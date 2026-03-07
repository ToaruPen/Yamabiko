import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeWebhookEvent } from "../../../src/domain/review-events/normalize-webhook-event.js";
import {
  issueCommentPayload,
  pullRequestReviewCommentPayload,
  pullRequestReviewPayload,
} from "../../fixtures/webhooks/index.js";

describe("normalizeWebhookEvent", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes pull_request_review submitted payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T10:00:00.000Z"));

    const event = normalizeWebhookEvent(
      "pull_request_review",
      "submitted",
      pullRequestReviewPayload,
    );

    expect(event).toEqual({
      actorLogin: "reviewer-bot",
      body: "Consider extracting this validation logic.",
      headSha: "abc123def456",
      kind: "pull_request_review",
      pullRequestNumber: 42,
      receivedAt: "2026-03-07T10:00:00.000Z",
      repository: {
        name: "yamabiko",
        owner: "ToaruPen",
      },
    });
  });

  it("normalizes pull_request_review_comment created payload", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T10:00:00.000Z"));

    const event = normalizeWebhookEvent(
      "pull_request_review_comment",
      "created",
      pullRequestReviewCommentPayload,
    );

    expect(event).toEqual({
      actorLogin: "lint-bot",
      body: "This function has too much cognitive complexity.",
      headSha: "abc123def456",
      kind: "pull_request_review_comment",
      pullRequestNumber: 42,
      receivedAt: "2026-03-07T10:00:00.000Z",
      repository: {
        name: "yamabiko",
        owner: "ToaruPen",
      },
    });
  });

  it("normalizes issue_comment created payload for PR with headSha null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T10:00:00.000Z"));

    const event = normalizeWebhookEvent(
      "issue_comment",
      "created",
      issueCommentPayload,
    );

    expect(event).toEqual({
      actorLogin: "codex-bot",
      body: "Please fix the lint error in src/config/env.ts.",
      headSha: null,
      kind: "issue_comment",
      pullRequestNumber: 42,
      receivedAt: "2026-03-07T10:00:00.000Z",
      repository: {
        name: "yamabiko",
        owner: "ToaruPen",
      },
    });
  });

  it("returns null for unsupported event type", () => {
    const event = normalizeWebhookEvent("push", "completed", {});

    expect(event).toBeNull();
  });

  it("returns null for unsupported action", () => {
    const event = normalizeWebhookEvent(
      "issue_comment",
      "deleted",
      issueCommentPayload,
    );

    expect(event).toBeNull();
  });

  it("returns null for issue_comment payload that is not on a pull request", () => {
    const payload = {
      ...issueCommentPayload,
      issue: {
        number: 42,
      },
    };

    const event = normalizeWebhookEvent("issue_comment", "created", payload);

    expect(event).toBeNull();
  });

  it("returns null for malformed payload", () => {
    const event = normalizeWebhookEvent("issue_comment", "created", {
      issue: { number: 1 },
    });

    expect(event).toBeNull();
  });
});
