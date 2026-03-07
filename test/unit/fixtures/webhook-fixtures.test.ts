import { describe, expect, it } from "vitest";
import {
  issueCommentPayload,
  pullRequestReviewCommentPayload,
  pullRequestReviewPayload,
} from "../../fixtures/webhooks/index.js";

interface MinimalWebhookPayload {
  action: string;
  sender?: { login: string };
  repository?: { owner?: { login: string }; name: string };
}

function validateCommonFields(payload: MinimalWebhookPayload): void {
  expect(payload.action).toBeDefined();
  expect(payload.sender?.login).toBeDefined();
  expect(payload.repository?.owner?.login).toBeDefined();
  expect(payload.repository?.name).toBeDefined();
}

describe("Webhook fixtures structure validation", () => {
  describe("issue_comment payload", () => {
    it("has required common fields", () => {
      validateCommonFields(issueCommentPayload);
    });

    it("has PR indicator field", () => {
      expect(issueCommentPayload.issue.pull_request).toBeDefined();
    });
  });

  describe("pull_request_review payload", () => {
    it("has required common fields", () => {
      validateCommonFields(pullRequestReviewPayload);
    });

    it("has pull request SHA field", () => {
      expect(pullRequestReviewPayload.pull_request.head.sha).toBeDefined();
    });
  });

  describe("pull_request_review_comment payload", () => {
    it("has required common fields", () => {
      validateCommonFields(pullRequestReviewCommentPayload);
    });

    it("has pull request SHA field", () => {
      expect(
        pullRequestReviewCommentPayload.pull_request.head.sha,
      ).toBeDefined();
    });
  });
});
