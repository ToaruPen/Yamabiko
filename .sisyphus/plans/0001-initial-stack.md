# Initial Stack Plan

## Goal

Call-n-Response is an OSS for ingesting GitHub PR review bot feedback, deciding whether it is actionable, applying safe fixes, and pushing updates back to the PR branch.

The first implementation should optimize for:

- GitHub-native event handling
- reliable event-driven execution
- OSS contributor ergonomics
- safe branch operations and idempotency
- a clear path from single-repo MVP to multi-repo GitHub App

## Reference OSS Review

### `anthropics/claude-code-action`

- Repo metadata shows `TypeScript` as the primary language and the project exposes a composite GitHub Action through `action.yml`.
- `action.yml` shows comment triggers, bot allowlisting, branch naming, and direct GitHub token use.
- `package.json` shows a Bun-based toolchain and Octokit/Zod usage.
- Takeaway: strong reference for GitHub comment-driven automation and policy inputs, but it is Action-first rather than webhook-server-first.

Sources:

- `https://github.com/anthropics/claude-code-action`
- `https://raw.githubusercontent.com/anthropics/claude-code-action/main/action.yml`

### `vercel-labs/openreview`

- Repo metadata shows `TypeScript` as the primary language.
- `README.md` describes a self-hosted GitHub App, webhook handler, durable workflow execution, sandboxed repo execution, and direct commit/push support.
- Root layout and `package.json` show a `Next.js` app with Vercel-specific workflow and sandbox dependencies.
- Takeaway: the best reference for App/webhook/worker separation and safe PR automation, but too platform-specific for a portable OSS v1.

Sources:

- `https://github.com/vercel-labs/openreview`
- `https://raw.githubusercontent.com/vercel-labs/openreview/main/README.md`

### `coderabbitai/ai-pr-reviewer`

- Repo metadata shows `TypeScript` as the primary language and the repository is archived.
- `action.yml` shows a Node-based GitHub Action focused on PR review/summarization.
- `package.json` shows an Octokit-based implementation packaged as a GitHub Action.
- Takeaway: useful evidence that TypeScript + Octokit + Action packaging works well for review automation, but not a strong primary architecture target for a new event-driven system.

Sources:

- `https://github.com/coderabbitai/ai-pr-reviewer`
- `https://raw.githubusercontent.com/coderabbitai/ai-pr-reviewer/main/action.yml`

## Common Pattern Across References

The repeated pattern is:

1. TypeScript as the implementation language
2. Octokit-based GitHub integration
3. Event-driven execution from PR comments/reviews
4. Separation between GitHub event intake and heavier code-analysis/code-change work

The main difference is deployment style:

- GitHub Action centric (`claude-code-action`, `ai-pr-reviewer`)
- GitHub App + webhook server + worker (`openreview`)

## Decision

### Chosen v1 stack

- Language/runtime: `TypeScript 5` on `Node.js 22 LTS`
- Package manager: `pnpm`
- Formatting: `Biome`
- Linting: `ESLint 10` + `typescript-eslint` (type-aware rules plus `consistent-type-imports`)
- Type checking: `tsc --noEmit` with strict compiler settings
- Webhook/API server: `Fastify`
- GitHub integration: `Octokit` + `@octokit/webhooks`
- Validation/config: `Zod`
- Persistence: `PostgreSQL`
- Queue: `pg-boss` (Postgres-backed)
- Database access: `Drizzle ORM`
- Testing: `Vitest` for unit/integration tests
- Deployment: one Docker image, split into `web` and `worker` processes

### Required architectural boundaries from day one

- `Delivery adapters`: CLI/dev runner, webhook server, and future GitHub Action entrypoints must call the same core services.
- `Auth adapters`: PAT, `GITHUB_TOKEN`, and GitHub App installation token handling must sit behind one interface.
- `State adapters`: in-memory/dev adapters and Postgres-backed adapters must be swappable.
- `Core logic`: review normalization, policy evaluation, and run planning must not call GitHub APIs directly.

### Execution model

1. GitHub App receives webhook events
2. Web server verifies signature and normalizes the event
3. Event metadata is stored with idempotency keys
4. A job is enqueued in `pg-boss`
5. Worker creates an ephemeral workspace for the PR branch
6. Worker evaluates review feedback through a policy layer
7. Worker applies fixes, runs configured checks, and re-fetches the PR head SHA
8. Push happens only if the latest head SHA still matches the expected SHA and policy allows it

### Push policy for v1

- Automatic push-back is `opt-in`, not the default behavior.
- Default mode is comment/suggestion-oriented when branch safety is uncertain.
- Push is allowed only when the actor is trusted, the branch is writable, the PR is not a disallowed fork scenario, and the current head SHA matches the expected SHA.
- Bot-authored commits must be marked so self-trigger loops can be ignored.

### v1 executor assumption

- v1 will use a `hybrid` fix executor model.
- The default path is `suggest-only` unless feedback matches the actionable rubric below and the selected executor is explicitly enabled.
- Rule-driven fixes should handle deterministic cases first (formatting, lint autofix, mechanical edits).
- External agent-driven fixes are allowed only behind an executor interface and only in trusted, opt-in flows.

## Why this stack

### Why `TypeScript + Node.js 22`

- All three reference implementations are TypeScript-heavy.
- GitHub API libraries, webhook tooling, and Action/App examples are strongest in the Node ecosystem.
- Node 22 LTS is a safer OSS baseline than tying runtime behavior to Bun in v1.

### Why `Fastify` instead of `Next.js` or `Probot`

- `Next.js` is useful when UI is a first-class feature; it is unnecessary for v1.
- `Probot` is convenient but adds framework opinions where we want explicit control over worker separation, idempotency, and execution policy.
- `Fastify` is thin, typed, and fits webhook-heavy backends well.

### Why `PostgreSQL + pg-boss`

- This keeps durable state and durable jobs in one system.
- It avoids adding Redis or another queue service in v1.
- It supports retries, delayed jobs, and job coordination without introducing a second operational dependency.

### Why still keep in-memory adapters for local development

- Contributors should be able to run unit tests and basic dry-run flows without booting Postgres.
- Hosted and integration paths still target `PostgreSQL + pg-boss`, but local dev must retain a low-friction path.

### Why `Drizzle`

- The schema will be small but correctness-sensitive.
- Drizzle keeps SQL visibility high while remaining lightweight.
- It is easier to reason about than a heavier ORM for a workflow-centric service.

### Why `pnpm + Biome`

- `pnpm` is widely familiar for OSS contributors and works cleanly with Node 22.
- `Biome` becomes the single owner of formatting, which avoids formatter conflicts and noisy diffs.

### Why `Biome + ESLint` instead of `Biome` only

- Biome can enforce `noExplicitAny` and cognitive complexity, but the strictest practical quality gate still benefits from `typescript-eslint`'s type-aware rules.
- `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-misused-promises`, and the `no-unsafe-*` family are proven fits for a webhook/server/worker backend.
- Keeping formatting in `Biome` and type-aware lint in `ESLint` keeps responsibilities clear without falling back to `ESLint + Prettier`.

### Quality gate defaults

The repository should assume these defaults from the first scaffold:

- `Biome`: formatting, import organization, unused code checks, and cognitive complexity
- `ESLint`: `typescript-eslint` flat config with `strict-type-checked` and selected backend-safe overrides, plus `consistent-type-imports`
- `tsc --noEmit`: required in CI and local verification

The minimum enforced ruleset should include:

- forbid explicit `any`
- forbid `@ts-ignore` and `@ts-expect-error`
- forbid floating or misused promises
- forbid unsafe assignment, calls, returns, member access, and arguments that escape the type system
- fail on unused imports and unused variables
- cap function cognitive complexity at about `10`

Rule ownership should be explicit:

- `Biome` owns formatting, import organization, `noUnusedImports`, `noUnusedVariables`, and `noExcessiveCognitiveComplexity`
- `ESLint` owns `@typescript-eslint/no-explicit-any`, `ban-ts-comment`, `consistent-type-imports`, `no-floating-promises`, `no-misused-promises`, and the `no-unsafe-*` family
- overlapping lint rules should be disabled on one side rather than tolerated twice

The strict compiler baseline should include:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `useUnknownInCatchVariables`

## Data model to assume from day one

The initial schema should cover:

- GitHub App installations
- repositories and repo-level settings
- webhook deliveries
- pull request runs
- review/comment events and normalized actions
- idempotency keys
- audit log entries

The initial configuration surface should also cover:

- configurable GitHub API base URL for future GHES support
- explicit event actor allowlists/denylists
- run mode (`dry-run`, `suggest-only`, `push-enabled`)

## Actionable feedback rubric for v1

Feedback is considered actionable in v1 only when all of the following are true:

1. it maps to a concrete file/path or PR-level task we can localize
2. it is specific enough to produce a bounded edit or bounded check
3. it does not require hidden business context that is unavailable in the repo/PR
4. it does not require unsafe branch operations or privileged side effects

Result categories:

- `ignore`: vague, duplicate, stale, or policy-blocked feedback
- `suggest`: feedback is understandable but not safe enough for unattended mutation
- `apply`: deterministic or explicitly approved trusted-path feedback that passes policy gates

## v1 boundaries

### In scope

- GitHub App webhook intake
- support for `issue_comment`, `pull_request_review`, and `pull_request_review_comment`
- policy checks for actor allowlists, deduplication, and branch safety
- worker-based execution in ephemeral workspaces
- safe push-back to PR branches
- self-hosted deployment through Docker Compose

### Explicitly deferred

- UI/dashboard
- Redis or a separate queue service
- Next.js frontend
- Kubernetes-specific deployment work
- cross-SCM support
- full multi-provider orchestration layer
- hardened sandbox backends such as Docker-per-job or Firecracker
- GitHub Action adapter as a first-class integration

## Development modes

### Local contributor mode

- dry-run first
- PAT-based auth allowed
- in-memory state/queue adapters available
- no database required for unit tests or basic local dry-run flows
- end-to-end durable workflow testing still uses Docker Compose with Postgres

### Hosted/self-host mode

- GitHub App auth first
- Postgres + pg-boss required
- webhook delivery tracking and durable runs enabled

## Open questions

- license choice: `MIT` vs `AGPL-3.0`
- how soon GHES support matters

## v1 non-goals and assumptions

- v1 does not guarantee unattended autonomous fixing for ambiguous review prose.
- v1 does not require a database for unit tests and dry-run developer flows, but durable workflow behavior is tested with Postgres.
- v1 assumes GitHub App-first hosted execution, with PAT-based local development support.

## Repository shape for v1

Start with a single package, not a monorepo.

Suggested layout:

```text
AGENTS.md
package.json
pnpm-lock.yaml
biome.json
eslint.config.mjs
tsconfig.json
vitest.config.ts
drizzle.config.ts
docker-compose.yml
.sisyphus/
scripts/
drizzle/
  docker/
    app.Dockerfile
src/
  entrypoints/
    http/
    cli/
    worker/
  config/
  contracts/
  domain/
    review-events/
    policy/
    runs/
  application/
    services/
    use-cases/
  adapters/
    github/
    auth/
    persistence/
    queue/
    worktree/
    llm/
  workers/
  executors/
    rule-based/
    agent-based/
  shared/
test/
  unit/
  integration/
  fixtures/
```

Notes:

- `entrypoints/` owns delivery-specific code only.
- `domain/` stays free of direct GitHub API calls.
- `application/` orchestrates use cases without owning infrastructure concerns.
- `adapters/` maps external systems to internal interfaces.
- `executors/` separates deterministic fixers from agent-backed fixers.

If a GitHub Action adapter or hosted control plane becomes real, split packages later.

Test file naming should use `*.test.ts` so Vitest discovery stays explicit and predictable.

## Immediate next steps

1. scaffold `package.json`, `tsconfig.json`, Biome, Vitest, and Fastify entrypoints
2. add Docker Compose for `app` + `postgres`
3. define the initial Drizzle schema and `pg-boss` setup
4. implement GitHub webhook signature verification and event normalization
5. add a stub worker that records runs without mutating code yet

## Decision summary

Call-n-Response v1 will be a GitHub App-first, webhook-driven TypeScript service built on Node 22, Fastify, Octokit, PostgreSQL, pg-boss, Drizzle, and Vitest. It will favor a portable self-hosted backend over an Action-only or platform-specific design, while keeping room for a future GitHub Action adapter.
