# AGENTS.md

## WHY
- `drizzle/` will hold generated migration artifacts derived from the schema in `src/adapters/persistence/schema.ts`.

## WHAT
- Treat generated SQL and metadata here as build artifacts with reviewable diffs.

## HOW
- Update this directory through Drizzle tooling rather than hand-editing generated output.
- Keep schema intent in `src/adapters/persistence/schema.ts`; keep generated state here.
