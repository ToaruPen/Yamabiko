# 2026-03-07

- Moved application-facing port interfaces from `src/adapters/` to `src/application/ports/` so dependency direction stays inward (`entrypoints/workers/executors/adapters -> application -> domain`).
- Kept all four interface signatures unchanged and updated only file locations/import paths to avoid behavioral changes.
- Deleted old adapter-side interface files instead of re-export shims to remove architecture ambiguity at compile time.

# 2026-03-07 (unify-review-job-payload)

- Unified `ReviewJobPayload` to a single source of truth using Zod schema + `z.infer`.
- Replaced plain TypeScript interface in `src/contracts/review-job-payload.ts` with Zod schema `reviewJobPayloadSchema` and derived type via `z.infer<typeof reviewJobPayloadSchema>`.
- Removed duplicate Zod schema from `src/entrypoints/worker/main.ts` and imported `reviewJobPayloadSchema` from contracts instead.
- Ensures runtime validation (Zod) and static types stay synchronized; adding a field now requires updating only one place.

# 2026-03-07 (inline-process-review-feedback)

- Inlined `processReviewFeedback` into `handle-review-job.ts` and deleted `src/workers/process-review-feedback.ts`.
- The function was a single-line delegation (`executor.execute({ run })`) with only one caller, so removing the indirection improved readability without losing abstraction.
