# Learnings — Queue Worker (Phase 3)

## Pre-Implementation Context
- pg-boss v12.14.0 already in package.json but never imported
- ReviewJobQueue has enqueue() only — no consumption API
- Worker entrypoint is heartbeat scaffold only
- ReviewRun has NO status field — only actionability classification
- processReviewFeedback exists but disconnected from queue
- docker-compose.yml has postgres:17-alpine + worker service ready
- No barrel exports — explicit file imports throughout
- In-memory adapters used for all unit/integration tests so far

## T2: Drizzle Schema Extension (2026-03-07)
- Schema columns are alphabetically ordered in `reviewRunsTable` definition
- Drizzle migration generation requires `DATABASE_URL` even for dry-run generation
- Migration generation command (tsconfig uses `noEmit: true`, so requires tsx):
  DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm exec tsx node_modules/.pnpm/drizzle-kit@*/node_modules/drizzle-kit/bin.cjs generate
- Generated migration files in `drizzle/` need formatting with `pnpm format` (Biome)
- New columns added to `review_runs` table:
  - `status` (text, not null, default 'pending')
  - `started_at` (timestamp with timezone, nullable)
  - `completed_at` (timestamp with timezone, nullable)
  - `error_message` (text, nullable)

## T1: Domain Status + Ingest Initialization (2026-03-07)
- `RunStatus` is defined in domain as the exact union: `"pending" | "processing" | "completed" | "failed" | "skipped"`
- `ReviewRun` lifecycle fields are optional (`startedAt`, `completedAt`, `errorMessage`) while `status` is required
- `ingestReviewEvent` now sets initial status at creation time:
  - `ignore` actionability => `status: "skipped"`, not enqueued
  - `suggest` / `apply` actionability => `status: "pending"`
- `headSha: null` remains a persisted non-enqueued run and now still starts as `status: "pending"` when actionable

## T4: PgBoss Review Queue Adapter (2026-03-07)
- `pg-boss` v12.14.0 exports `PgBoss` as a named type/class (`import type { PgBoss } from "pg-boss"` works)
- Queue adapter is thin and testable via constructor injection (`new PgBossReviewJobQueue(boss)`), with no `start()` responsibility
- Queue bootstrap order is deterministic for DLQ wiring:
  1. `createQueue("review-jobs-dlq")`
  2. `createQueue("review-jobs", { retryLimit: 3, retryDelay: 30, retryBackoff: true, deadLetter: "review-jobs-dlq" })`
- Unit tests can mock `send` / `createQueue` with `vi.fn()` object and cast at injection boundary, keeping production class API typed to `PgBoss`

## T3: ReviewRunRepository Status Methods (2026-03-07)
- `ReviewRunRepository` now includes `updateStatus()` and `findByStatus()` to support lifecycle-driven worker updates and status-based querying from the same persistence port.
- In-memory implementation keeps storage as `Map<string, ReviewRun>` and performs status transitions by replacing the stored run object with `{ ...current, status, ...providedMetadata }`.
- `updateStatus()` behavior in tests:
  - throws `Error("ReviewRun not found: <id>")` for unknown ids
  - updates only `status` when metadata is omitted
  - applies `startedAt`, `completedAt`, and `errorMessage` only when those keys are provided
- `findByStatus()` returns an array of matching runs and returns `[]` when no run matches.

## T7: Worker Job Logger (2026-03-07)
- Added `createJobLogger()` in `src/workers/job-logger.ts` with a small factory + sink-injection shape so worker job lifecycle logs stay testable without console interception.
- Logger emits consistent JSON entries for `job.received`, `job.processing`, `job.completed`, `job.failed`, and `job.retrying` with shared context (`jobId`, `runId`, optional `attempt`) and ISO timestamps.
- Error fields are always serialized through `String(error)` to avoid unsafe/non-serializable values in structured logs.
- Default sink writes `console.log(JSON.stringify(entry))`; tests use injected sink arrays for deterministic explicit assertions.

## T5: Worker Failure Classification (2026-03-07)
- `isRetryableError(error: unknown)` is implemented as fail-safe terminal by default: non-`Error` values and unknown cases always return `false`.
- Retryable conditions are explicitly limited to:
  - network-ish Node codes: `ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`, `EPIPE`, `EAI_AGAIN`
  - HTTP status/statusCode: `429`, `500`, `502`, `503`, `504`
  - error message fragments (case-insensitive): `network`, `timeout`, `rate limit`
- Programmer errors (`TypeError`, `RangeError`, `SyntaxError`) are terminal even when they are `Error` instances.
- TDD flow used: tests added first in `test/unit/workers/failure-classification.test.ts`, then implementation in `src/workers/failure-classification.ts`.
- `pnpm test` is green with new classification coverage; current `pnpm lint` fails due unrelated existing `test/unit/workers/job-logger.test.ts` errors from parallel logging work.

## T6: Worker Job Handler (2026-03-07)
- `handleReviewJob()` added in `src/workers/handle-review-job.ts` with dependency injection for `reviewRunRepository`, `fixExecutor`, `logger`, and optional deterministic `now()` clock.
- Lifecycle orchestration path is explicit and stateful: `pending` -> `processing` (with `startedAt`) -> `completed` (with `completedAt`) or `failed` (with `completedAt` + `errorMessage`).
- Idempotency guard treats `completed`, `failed`, and `skipped` runs as terminal and exits without calling the executor.
- Retry behavior follows pg-boss semantics: retryable errors are persisted as `failed`, logged with `logger.retrying(...)`, and rethrown; terminal errors are persisted as `failed`, logged with `logger.failed(...)`, and swallowed.
- Duration logging is measured from `Date.now()` immediately after status flips to `processing`, then emitted on completion/failure independent of the injected `now()` metadata clock.
- TDD coverage added in `test/unit/workers/handle-review-job.test.ts` for happy path, missing run, idempotent skips (`completed`/`failed`/`skipped`), retryable failure rethrow, and terminal failure swallow.
