# AGENTS.md

## WHY
- `src/` contains the production code for the webhook server, worker flow, domain logic, and infrastructure adapters.

## WHAT
- `entrypoints/`: HTTP and CLI delivery code only.
- `domain/`: pure business types and policy logic.
- `application/`: use-cases and orchestration.
- `adapters/`: GitHub, auth, persistence, queue, worktree, and LLM boundaries.
- `workers/` and `executors/`: background processing and fix execution strategies.

## HOW
- Prefer imports inward: `entrypoints` -> `application` -> `domain`; adapters plug into application/domain ports.
- Keep `domain/` free of Fastify, Octokit, database clients, and environment parsing.
- Put new external integrations under `adapters/` and document any new boundary in the closest scoped `AGENTS.md`.
