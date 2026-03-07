#!/usr/bin/env bash
set -euo pipefail

# Code simplification analysis via Claude CLI
# Run manually: pnpm simplify

if ! command -v claude &>/dev/null; then
	echo "Error: claude CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code" >&2
	exit 1
fi

echo "Running code simplification analysis..."
claude -p "Analyze this codebase for simplification opportunities:
1. Unnecessary complexity removal
2. Duplicate code consolidation
3. Type definition simplification
4. Test helper commonization
5. Import structure improvement

For each proposal include: target file(s), what to change, why, and estimated impact.
Rank proposals by impact (high/medium/low).
Report in Japanese."
