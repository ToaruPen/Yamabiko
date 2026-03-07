# AGENTS.md

## WHY
- `src/adapters/` isolates external systems from the core application so hosted, local, and test modes can swap implementations safely.

## WHAT
- `github/`: GitHub API ports and clients.
- `auth/`: token acquisition and auth abstractions.
- `persistence/` and `queue/`: durable and in-memory state backends.
- `worktree/` and `llm/`: execution boundaries for code changes.

## HOW
- Keep interfaces stable and implementations replaceable.
- Prefer in-memory test doubles for unit tests and reserve networked implementations for integration paths.
- Do not move business policy into adapters; keep them focused on translation and I/O.
