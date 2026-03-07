# Decisions — Queue Worker (Phase 3)

## Pre-Implementation Decisions
- Use pg-boss `work()` for long-polling consumption (not manual fetch/complete)
- Failure classification lives in `src/workers/` (worker concern, not domain)
- RunStatus is a domain type but status transitions are orchestrated by the worker
- In-memory adapters continue for unit tests; real Postgres for integration tests
- Dead letter queue (`review-jobs-dlq`) for terminal failures
- Retry policy: retryLimit=3, retryDelay=30s, retryBackoff=true (exponential)
