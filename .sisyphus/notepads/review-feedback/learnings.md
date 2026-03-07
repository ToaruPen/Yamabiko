# Learnings — CodeRabbit Review Feedback (PR #2)

## 2026-03-07

- Use `server.config.host`/`server.config.port` from validated config to avoid drift from raw `process.env` parsing.
- Return `204` with empty body for intentionally skipped webhook events; reserve `200` for accepted/duplicate flows with response payloads.
- Missing signature header is client input validation (`400`) while invalid signature value remains authentication failure (`401`).
- Keep queue snapshots immutable to callers by shallow-copying on enqueue and readback.
- Reuse domain constants (`ACTIONABILITIES`) in persistence schema enums to avoid duplicated string sets.
- Centralize webhook HMAC signing in `test/helpers/sign-payload.ts` so unit/integration suites share one canonical signature helper.
- For `204 No Content` webhook outcomes, assert only status and avoid `response.json()` parsing in tests.
- If `pnpm exec drizzle-kit generate` cannot resolve TS ESM imports, `pnpm exec tsx node_modules/drizzle-kit/bin.cjs generate` is a working fallback.
