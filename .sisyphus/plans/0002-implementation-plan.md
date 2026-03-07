# Implementation Plan

## Goal

Turn the current scaffold into a working GitHub App-first MVP that can:

1. receive GitHub PR review-related events
2. normalize them into internal review feedback events
3. persist runs and deliveries durably
4. enqueue worker jobs and process them safely
5. emit trusted suggestions or no-op decisions before any automatic mutation

The first implementation pass should stop short of autonomous code changes unless a path is deterministic and policy-approved.

## Scope Principles

- Prefer one vertical slice that is executable end-to-end over broad partial coverage.
- Keep `suggest-only` as the safe default mode.
- Treat GitHub webhook authenticity, idempotency, and head-SHA freshness as first-class requirements.
- Keep domain/application logic testable without Postgres or live GitHub access.

## Phase Plan

### Phase 1: Webhook intake and event normalization

Objective:

- Accept GitHub webhook deliveries and normalize supported events into `ReviewFeedbackEvent`.

Tasks:

- add webhook route under `src/entrypoints/http/`
- verify GitHub webhook signatures using `@octokit/webhooks`
- support `issue_comment`, `pull_request_review`, and `pull_request_review_comment`
- map raw payloads into normalized internal event types
- reject unsupported actions and malformed payloads explicitly
- add fixtures for representative GitHub payloads

Done when:

- webhook requests can be validated locally
- normalization outputs deterministic internal events
- invalid signatures and unsupported actions are covered by tests

### Phase 2: Durable delivery and run persistence

Objective:

- Persist webhook deliveries and review runs before worker execution.

Tasks:

- define Drizzle schema for webhook deliveries, review runs, and idempotency keys
- add persistence adapters for Postgres and in-memory dev mode
- persist normalized events and run metadata from the ingest flow
- add explicit run mode handling for `dry-run`, `suggest-only`, and `push-enabled`

Done when:

- every accepted webhook creates or reuses a durable run record
- duplicate deliveries can be recognized safely
- unit tests still run without Postgres

### Phase 3: Queue integration and worker orchestration

Objective:

- Convert accepted runs into durable background jobs.

Tasks:

- wire `pg-boss` into queue adapters
- create worker polling loop in `src/entrypoints/worker/`
- load run state from persistence in the worker
- define worker status transitions and failure handling
- emit structured logs for job lifecycle

Done when:

- a persisted actionable run becomes a worker job
- retryable failures are distinguished from terminal failures
- queue-backed integration tests cover enqueue/dequeue behavior

### Phase 4: Policy evaluation and suggestion path

Objective:

- Apply safety policy to decide ignore vs suggest vs apply, and implement the safe `suggest` path first.

Tasks:

- enrich the actionability classifier with actor trust and branch-safety inputs
- add policy checks for stale head SHA, unsupported PR context, and untrusted actors
- implement GitHub comment emission for suggestion/no-op reporting
- keep `apply` behind explicit trusted and deterministic conditions

Done when:

- worker can publish a suggestion or safe skip result back to GitHub via an adapter
- policy decisions are auditable and test-covered

### Phase 5: Deterministic apply path

Objective:

- Enable only deterministic fix execution before any broader agent-driven mutation work.

Tasks:

- implement a minimal rule-based executor path
- add worktree preparation and cleanup logic
- run configured checks before and after deterministic edits
- re-check PR head SHA before any write action

Done when:

- deterministic changes can be produced in a temp workspace
- writes are blocked if policy or SHA checks fail
- no agent-based mutation is required for MVP completeness

## Recommended First Issue Scope

The first issue should cover Phases 1 and 2 together, because they produce the first durable vertical slice:

- title: `durable webhook intake and queue handoff`
- completion target: accepted webhook -> persisted delivery/run -> duplicate-safe enqueue
- webhook route
- signature verification
- payload normalization
- minimal initial Drizzle schema for deliveries, runs, and idempotency keys only
- persistence of deliveries and runs
- idempotency handling, with key design treated as a primary acceptance criterion
- tests for valid, invalid, signed, and duplicate deliveries

This is the smallest slice that creates a real system boundary and unlocks queue/worker work next.

## Explicitly Deferred From The First Issue

- `pg-boss` worker polling loop
- GitHub write-back comments
- worktree cloning and execution
- deterministic fix application
- agent-based fix execution
- push-back to PR branches

## Risks To Watch

- GitHub payload shapes differ across the three supported review-related events
- duplicate or redelivered webhook events can create false duplicate runs if idempotency keys are weak
- local dev mode and hosted mode can drift unless adapters share the same application flow
- write paths may creep in too early unless `suggest-only` remains the default

## Verification Expectations

- `pnpm lint`
- `pnpm test`
- route/integration tests with payload fixtures
- schema and persistence behavior covered by automated tests

## Tracking Checklist

- [ ] Phase 1: webhook intake and normalization
- [ ] Phase 2: durable delivery and run persistence
- [ ] Phase 3: queue integration and worker orchestration
- [ ] Phase 4: policy evaluation and suggestion path
- [ ] Phase 5: deterministic apply path
