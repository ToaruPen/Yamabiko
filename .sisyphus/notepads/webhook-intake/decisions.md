# Decisions — webhook-intake

## 2026-03-07 Plan Creation
- Idempotency key: X-GitHub-Delivery header (GitHub-guaranteed unique ID)
- Test strategy: TDD (RED-GREEN-REFACTOR)
- ActionabilitySignal: default stub in application layer → always "suggest"
- headSha: string | null (issue_comment lacks PR head SHA)
- HTTP responses: 200/401/400 standard webhook patterns
- buildServer DI: deps parameter (function-based, testable)
