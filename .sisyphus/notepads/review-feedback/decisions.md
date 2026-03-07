# Decisions — CodeRabbit Review Feedback (PR #2)

## Triage Decisions
- Atomic dedup (existsById race): DEFER — needs DB unique constraint + transactions, not available with in-memory adapters. Document as TODO.
- Delivery save order: KEEP current order + add TODO comment — reordering introduces different failure modes. Real fix requires transactions.
- TokenProvider installation context: DEFER to Phase 4+
- InMemory adapters in production server.ts: DEFER — needs DB adapter implementation
- processReviewFeedback mode gating: DEFER to Phase 4
- .sisyphus/plans/ doc fixes: SKIP — internal planning docs, not worth modifying
