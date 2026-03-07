# AGENTS.md

## WHY
- `docker/` holds container definitions for local self-hosted development.

## WHAT
- Dockerfiles and compose-related assets here should mirror the runtime assumptions documented in `README.md`.

## HOW
- Keep environment variable names aligned with `src/config/env.ts`.
- Favor simple local-dev images over production-hardening until the hosted path is implemented.
