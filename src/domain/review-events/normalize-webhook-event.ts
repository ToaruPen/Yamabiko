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

const pullRequestSchema = z.object({
  head: z.object({
    sha: z.string(),
  }),
  number: z.number(),
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
  pull_request: pullRequestSchema,
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
  pull_request: pullRequestSchema,
  repository: repositorySchema,
  sender: senderSchema,
});

function parseAndMap<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  mapper: (parsed: T, receivedAt: string) => ReviewFeedbackEvent,
  receivedAt: string,
): ReviewFeedbackEvent | null {
  const result = schema.safeParse(payload);

  if (!result.success) {
    return null;
  }

  return mapper(result.data, receivedAt);
}

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
  return parseAndMap(
    issueCommentSchema,
    payload,
    (parsed, normalizedAt) => ({
      actorLogin: parsed.sender.login,
      body: parsed.comment.body,
      headSha: null,
      kind: "issue_comment",
      pullRequestNumber: parsed.issue.number,
      receivedAt: normalizedAt,
      repository: toRepositoryRef(parsed.repository),
    }),
    receivedAt,
  );
}

function normalizePullRequestReview(
  payload: unknown,
  receivedAt: string,
): ReviewFeedbackEvent | null {
  return parseAndMap(
    pullRequestReviewSchema,
    payload,
    (parsed, normalizedAt) => ({
      actorLogin: parsed.sender.login,
      body: parsed.review.body,
      headSha: parsed.pull_request.head.sha,
      kind: "pull_request_review",
      pullRequestNumber: parsed.pull_request.number,
      receivedAt: normalizedAt,
      repository: toRepositoryRef(parsed.repository),
    }),
    receivedAt,
  );
}

function normalizePullRequestReviewComment(
  payload: unknown,
  receivedAt: string,
): ReviewFeedbackEvent | null {
  return parseAndMap(
    pullRequestReviewCommentSchema,
    payload,
    (parsed, normalizedAt) => ({
      actorLogin: parsed.sender.login,
      body: parsed.comment.body,
      headSha: parsed.pull_request.head.sha,
      kind: "pull_request_review_comment",
      pullRequestNumber: parsed.pull_request.number,
      receivedAt: normalizedAt,
      repository: toRepositoryRef(parsed.repository),
    }),
    receivedAt,
  );
}

function toRepositoryRef(
  repository: z.infer<typeof repositorySchema>,
): RepositoryRef {
  return {
    name: repository.name,
    owner: repository.owner.login,
  };
}
