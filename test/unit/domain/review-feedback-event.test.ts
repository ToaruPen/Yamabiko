import { describe, expect, it } from "vitest";

import type { ReviewFeedbackEvent } from "../../../src/domain/review-events/review-feedback-event.js";

describe("ReviewFeedbackEvent", () => {
  it("accepts event with headSha: null (issue_comment has no head SHA)", () => {
    const event: ReviewFeedbackEvent = {
      actorLogin: "codex-bot",
      body: "Please fix the lint error.",
      headSha: null,
      kind: "issue_comment",
      pullRequestNumber: 12,
      receivedAt: "2026-03-07T00:00:00.000Z",
      repository: {
        name: "Call-n-Response",
        owner: "ToaruPen",
      },
    };

    expect(event.headSha).toBe(null);
    expect(event.kind).toBe("issue_comment");
  });

  it("accepts event with headSha: string (pull_request_review has head SHA)", () => {
    const event: ReviewFeedbackEvent = {
      actorLogin: "codex-bot",
      body: "Please fix the lint error.",
      headSha: "abc123def456",
      kind: "pull_request_review",
      pullRequestNumber: 12,
      receivedAt: "2026-03-07T00:00:00.000Z",
      repository: {
        name: "Call-n-Response",
        owner: "ToaruPen",
      },
    };

    expect(event.headSha).toBe("abc123def456");
    expect(event.kind).toBe("pull_request_review");
  });

  it("accepts event with headSha: string (pull_request_review_comment has head SHA)", () => {
    const event: ReviewFeedbackEvent = {
      actorLogin: "lint-bot",
      body: "This function has too much cognitive complexity.",
      headSha: "abc123def456",
      kind: "pull_request_review_comment",
      pullRequestNumber: 42,
      receivedAt: "2026-03-07T00:00:00.000Z",
      repository: {
        name: "Call-n-Response",
        owner: "ToaruPen",
      },
    };

    expect(event.headSha).toBe("abc123def456");
    expect(event.kind).toBe("pull_request_review_comment");
  });
});
