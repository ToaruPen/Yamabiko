# Queue Integration and Worker Orchestration

Issue: #3
Branch: `feat/queue-worker`
Strategy: TDD (RED → GREEN → REFACTOR)
Base: `feat/webhook-intake`

## Goal

Wire pg-boss into the existing queue adapter interface and implement a worker that consumes review jobs, manages run lifecycle status, and handles failures with retry classification.

## Task Plan

### Wave 1: Domain Foundation (parallelizable: T1 ∥ T2)

- [ ] **T1**: Add `RunStatus` to `ReviewRun` domain type
  - Define `RunStatus = "pending" | "processing" | "completed" | "failed" | "skipped"`
  - Add `status: RunStatus` field to `ReviewRun` interface
  - Add optional lifecycle fields: `startedAt?: string`, `completedAt?: string`, `errorMessage?: string`
  - Update `ingestReviewEvent` to set `status: "pending"` for actionable runs, `status: "skipped"` for ignored
  - Update all existing tests that construct ReviewRun objects
  - Files: `src/domain/runs/review-run.ts`, `src/application/use-cases/ingest-review-event.ts`, existing tests

- [ ] **T2**: Extend Drizzle schema with run lifecycle columns
  - Add columns to `review_runs` table: `status` (text, not null, default 'pending'), `started_at` (timestamp), `completed_at` (timestamp), `error_message` (text)
  - Create Drizzle migration for the schema change
  - Files: `src/adapters/persistence/schema.ts`, `drizzle/`

### Wave 2: Repository & Queue Adapter (depends on T1, T2)

- [ ] **T3**: Extend `ReviewRunRepository` with lifecycle methods
  - Add `updateStatus(id: string, status: RunStatus, metadata?: { startedAt?: string; completedAt?: string; errorMessage?: string }): Promise<void>`
  - Add `findByStatus(status: RunStatus): Promise<ReviewRun[]>`
  - Update `InMemoryReviewRunRepository` implementation
  - TDD: unit tests for new methods
  - Files: `src/adapters/persistence/review-run-repository.ts`, `src/adapters/persistence/in-memory-review-run-repository.ts`

- [ ] **T4**: Create `PgBossReviewJobQueue` adapter
  - Implement `ReviewJobQueue.enqueue()` using pg-boss `send()`
  - Add `createReviewQueue()` for queue creation with retry policy (retryLimit: 3, retryDelay: 30, retryBackoff: true)
  - Add dead letter queue `review-jobs-dlq` for terminal failures
  - TDD: unit tests with pg-boss constructor injection (mockable)
  - Files: `src/adapters/queue/pg-boss-review-job-queue.ts`

### Wave 3: Worker Core (depends on T3, T4)

- [ ] **T5**: Create failure classification module
  - Create `isRetryableError(error: unknown): boolean` function
  - Retryable: network errors (`ECONNREFUSED`, `ETIMEDOUT`), HTTP 5xx, rate limit (429)
  - Terminal: validation errors, missing run data, policy violations, programmer errors
  - TDD: unit tests for each error category
  - Files: `src/workers/failure-classification.ts`

- [ ] **T6**: Create worker job handler
  - Create `handleReviewJob(deps, job): Promise<void>` function
  - Load run from `ReviewRunRepository.findById()`
  - Guard: run not found → terminal failure
  - Guard: run already completed/failed → skip (idempotent)
  - Update status to `"processing"` with `startedAt`
  - Delegate to `processReviewFeedback(run, executor)`
  - On success: update status to `"completed"` with `completedAt`
  - On failure: classify error, update status to `"failed"` with `errorMessage`; if retryable, throw to trigger pg-boss retry
  - TDD: unit tests for all paths
  - Files: `src/workers/handle-review-job.ts`

- [ ] **T7**: Add structured logging for job lifecycle
  - Create `createJobLogger(context: { runId, jobId })` factory
  - Log events: `job.received`, `job.processing`, `job.completed`, `job.failed`, `job.retrying`, `job.dead_lettered`
  - Include timing (duration), run ID, job ID, attempt number
  - JSON structured format for observability
  - TDD: capture and assert log output
  - Files: `src/workers/job-logger.ts`

### Wave 4: Wiring & Integration (depends on T5, T6, T7)

- [ ] **T8**: Implement worker entrypoint with pg-boss consumption
  - Replace heartbeat scaffold in `src/entrypoints/worker/main.ts`
  - Initialize pg-boss with DATABASE_URL from RuntimeConfig
  - Call `boss.start()`, `boss.createQueue()`, `boss.work()`
  - Wire `handleReviewJob` as the job handler
  - Graceful shutdown: `boss.stop({ graceful: true, timeout: 30000 })` on SIGTERM/SIGINT
  - Files: `src/entrypoints/worker/main.ts`

- [ ] **T9**: Integration tests for queue lifecycle
  - Test pg-boss enqueue → dequeue → handler execution
  - Test retry on retryable failure (job re-appears)
  - Test terminal failure → dead letter queue
  - Test idempotent handling of already-completed runs
  - Requires: Postgres via docker-compose or test setup
  - Files: `test/integration/workers/`

## Verification Criteria

- [ ] F1: `pnpm test` — all tests pass (existing 48 + new)
- [ ] F2: `pnpm lint` — zero errors
- [ ] F3: No `any`, `@ts-ignore`, `@ts-expect-error`
- [ ] F4: Worker can consume a queued job end-to-end (manual or integration test)

## Architecture Notes

- pg-boss manages its own schema (auto-creates `pgboss.*` tables on `start()`)
- Worker uses pg-boss `work()` (long-polling) not manual `fetch()` + `complete()`
- In-memory adapters continue to be used for unit tests
- Integration tests need real Postgres — use docker-compose `postgres` service
- Failure classification lives in `src/workers/` (worker concern, not domain)
