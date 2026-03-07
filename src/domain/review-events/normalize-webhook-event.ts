import { z } from "zod";

import type {
  RepositoryRef,
  ReviewFeedbackEvent,
} from "./review-feedback-event.js";

const repositorySchema = z.object({
  name: z.string(),
  owner: z.object({
    login: z.string(),
  }),
});

const senderSchema = z.object({
  login: z.string(),
});

const issueCommentSchema = z.object({
  comment: z.object({
    body: z.string(),
    user: z.object({
      login: z.string(),
    }),
  }),
  issue: z.object({
    number: z.number(),
    pull_request: z.record(z.string(), z.unknown()),
  }),
  repository: repositorySchema,
  sender: senderSchema,
});

const pullRequestReviewSchema = z.object({
  pull_request: z.object({
    head: z.object({
      sha: z.string(),
    }),
    number: z.number(),
  }),
  repository: repositorySchema,
  review: z.object({
    body: z.string(),
  }),
  sender: senderSchema,
});

const pullRequestReviewCommentSchema = z.object({
  comment: z.object({
    body: z.string(),
    user: z.object({
      login: z.string(),
    }),
  }),
  pull_request: z.object({
    head: z.object({
      sha: z.string(),
    }),
    number: z.number(),
  }),
  repository: repositorySchema,
  sender: senderSchema,
});

export function normalizeWebhookEvent(
  eventType: string,
  action: string,
  payload: unknown,
): ReviewFeedbackEvent | null {
  try {
    const receivedAt = new Date().toISOString();

    if (eventType === "issue_comment" && action === "created") {
      return normalizeIssueComment(payload, receivedAt);
    }

    if (eventType === "pull_request_review" && action === "submitted") {
      return normalizePullRequestReview(payload, receivedAt);
    }

    if (eventType === "pull_request_review_comment" && action === "created") {
      return normalizePullRequestReviewComment(payload, receivedAt);
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeIssueComment(
  payload: unknown,
  receivedAt: string,
): ReviewFeedbackEvent | null {
  const parsed = issueCommentSchema.safeParse(payload);

  if (!parsed.success) {
    return null;
  }

  return {
    actorLogin: parsed.data.sender.login,
    body: parsed.data.comment.body,
    headSha: null,
    kind: "issue_comment",
    pullRequestNumber: parsed.data.issue.number,
    receivedAt,
    repository: toRepositoryRef(parsed.data.repository),
  };
}

function normalizePullRequestReview(
  payload: unknown,
  receivedAt: string,
): ReviewFeedbackEvent | null {
  const parsed = pullRequestReviewSchema.safeParse(payload);

  if (!parsed.success) {
    return null;
  }

  return {
    actorLogin: parsed.data.sender.login,
    body: parsed.data.review.body,
    headSha: parsed.data.pull_request.head.sha,
    kind: "pull_request_review",
    pullRequestNumber: parsed.data.pull_request.number,
    receivedAt,
    repository: toRepositoryRef(parsed.data.repository),
  };
}

function normalizePullRequestReviewComment(
  payload: unknown,
  receivedAt: string,
): ReviewFeedbackEvent | null {
  const parsed = pullRequestReviewCommentSchema.safeParse(payload);

  if (!parsed.success) {
    return null;
  }

  return {
    actorLogin: parsed.data.sender.login,
    body: parsed.data.comment.body,
    headSha: parsed.data.pull_request.head.sha,
    kind: "pull_request_review_comment",
    pullRequestNumber: parsed.data.pull_request.number,
    receivedAt,
    repository: toRepositoryRef(parsed.data.repository),
  };
}

function toRepositoryRef(
  repository: z.infer<typeof repositorySchema>,
): RepositoryRef {
  return {
    name: repository.name,
    owner: repository.owner.login,
  };
}
