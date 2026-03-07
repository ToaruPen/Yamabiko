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
