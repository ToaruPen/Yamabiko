import { describe, expect, it } from "vitest";

import type {
  ReviewRun,
  RunStatus,
} from "../../../src/domain/runs/review-run.js";

describe("ReviewRun", () => {
  it("supports all lifecycle statuses", () => {
    const statuses: RunStatus[] = [
      "pending",
      "processing",
      "completed",
      "failed",
      "skipped",
    ];

    expect(statuses).toEqual([
      "pending",
      "processing",
      "completed",
      "failed",
      "skipped",
    ]);
  });

  it("supports optional lifecycle fields", () => {
    const run: ReviewRun = {
      actionability: "suggest",
      completedAt: "2026-03-07T00:05:00.000Z",
      createdAt: "2026-03-07T00:00:00.000Z",
      errorMessage: "lint failed",
      event: {
        actorLogin: "codex-bot",
        body: "Please fix the lint error.",
        headSha: "abc123def456",
        kind: "pull_request_review_comment",
        pullRequestNumber: 12,
        receivedAt: "2026-03-07T00:00:00.000Z",
        repository: {
          name: "Call-n-Response",
          owner: "ToaruPen",
        },
      },
      id: "run-123",
      mode: "suggest-only",
      startedAt: "2026-03-07T00:01:00.000Z",
      status: "pending",
    };

    expect(run.status).toBe("pending");
    expect(run.startedAt).toBe("2026-03-07T00:01:00.000Z");
    expect(run.completedAt).toBe("2026-03-07T00:05:00.000Z");
    expect(run.errorMessage).toBe("lint failed");
  });
});
