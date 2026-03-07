# AGENTS.md

## WHY
- `test/` proves domain behavior, use-case orchestration, and entrypoint integration without weakening the strict quality bar.

## WHAT
- `unit/`: fast tests for pure logic and in-memory adapters.
- `integration/`: route wiring and multi-module flows.
- `fixtures/`: stable sample payloads and helper data when tests need them.

## HOW
- Prefer explicit assertions over snapshots.
- Keep unit tests deterministic and side-effect-free.
- Name test files with the `*.test.ts` suffix.
- Integration tests may compose multiple modules, but should still avoid real GitHub or database calls unless a dedicated fixture/setup is added.
