# AGENTS.md

## WHY
- Yamabiko is a GitHub App-first backend for ingesting PR review bot feedback and turning it into safe suggestions or fixes.
- The canonical stack, architecture, and safety decisions live in `README.md` and `.sisyphus/plans/0001-initial-stack.md`.

## WHAT
- `src/`: application code and architecture layers. See `src/AGENTS.md`.
  - `src/entrypoints/worker/`: pg-boss consumer that processes queued review jobs.
  - `src/workers/`: job handler, failure classification, and structured job logging.
  - `src/adapters/queue/`: `ReviewJobQueue` port implementations (pg-boss and in-memory).
  - `src/application/ports/`: inward-facing interfaces including `ReviewRunRepository` (with atomic `claimForProcessing`).
- `test/`: unit and integration coverage. See `test/AGENTS.md`.
- `.sisyphus/`: plans, decision records, and developer scripts. See `.sisyphus/AGENTS.md`.
- `docker/`, `drizzle/`: infrastructure and workflow helpers with scoped guidance.

## HARD RULES
- Keep `Biome` as the formatter/import organizer and `ESLint` as the type-aware lint owner unless the documented quality bar changes.
- Do not introduce `any`, `@ts-ignore`, or `@ts-expect-error`.
- Keep domain code independent from framework, GitHub API, and persistence details.
- After meaningful code changes, run `pnpm lint` and `pnpm test`.

## HOW
- Read the nearest scoped `AGENTS.md` before editing a directory.
- Update `README.md` and `.sisyphus/plans/0001-initial-stack.md` when architecture, quality gates, or layout change.
