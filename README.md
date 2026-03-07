# Call-n-Response

Event-driven automation for ingesting GitHub PR review bot feedback, applying fixes, and pushing updates safely.

## Planned Stack

- Runtime: `Node.js 22 LTS`
- Language: `TypeScript 5`
- Package manager: `pnpm`
- HTTP/webhook server: `Fastify`
- GitHub integration: `Octokit` + `@octokit/webhooks`
- Database: `PostgreSQL`
- Queue: `pg-boss`
- ORM: `Drizzle ORM`
- Testing: `Vitest`
- Formatting: `Biome`
- Type-aware linting: `ESLint 10` + `typescript-eslint`

## Quality Bar

This repository is planned with strict quality gates from the start.

- `Biome` owns formatting, import organization, unused-code checks, and cognitive complexity
- `ESLint` owns type-aware linting, plus `consistent-type-imports`
- `tsc --noEmit` is required in CI
- explicit `any` is forbidden
- `@ts-ignore` and `@ts-expect-error` are forbidden
- floating promises and misused promises fail lint
- unsafe assignment/call/member access/return patterns fail lint
- unused imports and unused variables fail checks
- cognitive complexity is capped around `10`
- strict compiler settings will include `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `useUnknownInCatchVariables`

Planned ownership split:

- `Biome`: format + `noUnusedImports` + `noUnusedVariables` + cognitive complexity
- `ESLint`: `@typescript-eslint/no-explicit-any`, `ban-ts-comment`, `consistent-type-imports`, `no-floating-promises`, `no-misused-promises`, and `no-unsafe-*`
- overlapping rules will be disabled rather than reported twice

## Planned Repository Layout

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

Structure intent:

- `entrypoints/` handles delivery-specific concerns such as webhook and CLI input
- `domain/` contains business rules and stays independent from GitHub API calls
- `application/` coordinates use-cases
- `adapters/` integrates GitHub, auth, persistence, queue, and workspace execution
- `executors/` separates deterministic fixers from agent-backed fixers

Test naming:

- test files use `*.test.ts`

## Status

Phase 1+2 (webhook intake and event normalization) is implemented:

- POST /webhook endpoint with HMAC signature verification
- Event normalization for `pull_request_review`, `pull_request_review_comment`, and `issue_comment`
- Idempotent delivery handling keyed by `X-GitHub-Delivery`
- Review run creation with actionability classification
- Job queue handoff for actionable events
- 48+ unit and integration tests

Current default runtime uses in-memory repositories in Phase 1+2.
PostgreSQL-backed durable persistence is planned for Phase 4+.

Phase 3 (queue integration and worker orchestration) is in progress.

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm

### Install and verify

```bash
pnpm install
pnpm test       # 48+ unit and integration tests
pnpm lint       # Biome formatting + ESLint type-aware checks
```

### Local development

```bash
export WEBHOOK_SECRET="your-webhook-secret"
pnpm dev
```

> **Note:** `DATABASE_URL` is not required for Phase 1+2 (in-memory repositories are used by default). It will be needed when PostgreSQL-backed persistence is added in Phase 4+.

The test suite covers webhook HMAC signature verification, idempotent deduplication via `X-GitHub-Delivery`, and event normalization for all supported GitHub event types.

## Planning

- Initial stack plan: `.sisyphus/plans/0001-initial-stack.md`
- Implementation plan: `.sisyphus/plans/0002-implementation-plan.md`
