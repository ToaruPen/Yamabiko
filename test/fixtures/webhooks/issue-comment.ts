export const issueCommentPayload = {
  action: "created",
  comment: {
    id: 1,
    body: "Please fix the lint error in src/config/env.ts.",
    user: { login: "codex-bot" },
  },
  issue: {
    number: 42,
    pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/42" },
  },
  repository: {
    name: "call-n-response",
    owner: { login: "ToaruPen" },
  },
  sender: { login: "codex-bot" },
} as const;
