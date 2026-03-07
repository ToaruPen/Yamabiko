export const pullRequestReviewPayload = {
  action: "submitted",
  review: {
    id: 1,
    body: "Consider extracting this validation logic.",
    state: "commented",
    user: { login: "reviewer-bot" },
  },
  pull_request: {
    number: 42,
    head: { sha: "abc123def456" },
  },
  repository: {
    name: "call-n-response",
    owner: { login: "ToaruPen" },
  },
  sender: { login: "reviewer-bot" },
} as const;
