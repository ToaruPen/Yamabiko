export const pullRequestReviewCommentPayload = {
  action: "created",
  comment: {
    id: 1,
    body: "This function has too much cognitive complexity.",
    user: { login: "lint-bot" },
    path: "src/config/env.ts",
    line: 15,
  },
  pull_request: {
    number: 42,
    head: { sha: "abc123def456" },
  },
  repository: {
    name: "yamabiko",
    owner: { login: "ToaruPen" },
  },
  sender: { login: "lint-bot" },
} as const;
