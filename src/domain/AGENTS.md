# AGENTS.md

## WHY
- `src/domain/` defines the core language of the system: review events, actionability policy, and run state.

## WHAT
- Files here should stay deterministic and easy to unit test.
- Domain modules are safe places for enums, value objects, and pure policy functions.

## HOW
- Avoid framework, network, filesystem, database, and environment dependencies here.
- Favor small pure functions and typed data structures over service classes.
- If a domain rule changes, add or update unit tests in `test/unit/`.
