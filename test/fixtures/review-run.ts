import type { ReviewRun } from "../../src/domain/runs/review-run.js";

export function createReviewRun(
  id: string,
  overrides: Partial<ReviewRun> = {},
): ReviewRun {
  return {
    actionability: "suggest",
    createdAt: "2026-03-07T00:00:00.000Z",
    event: {
      actorLogin: "codex-bot",
      body: "Please fix lint errors.",
      headSha: "abc123",
      kind: "pull_request_review_comment",
      pullRequestNumber: 12,
      receivedAt: "2026-03-07T00:00:00.000Z",
      repository: {
        name: "Yamabiko",
        owner: "ToaruPen",
      },
    },
    id,
    mode: "suggest-only",
    status: "pending",
    ...overrides,
  };
}
