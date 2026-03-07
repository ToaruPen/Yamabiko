import { describe, expect, it } from "vitest";

import { InMemoryReviewRunRepository } from "../../../src/adapters/persistence/in-memory-review-run-repository.js";
import type { ReviewRun } from "../../../src/domain/runs/review-run.js";

function createRun(id: string, overrides: Partial<ReviewRun> = {}): ReviewRun {
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
        name: "Call-n-Response",
        owner: "ToaruPen",
      },
    },
    id,
    mode: "suggest-only",
    status: "pending",
    ...overrides,
  };
}

describe("InMemoryReviewRunRepository", () => {
  it("updateStatus updates only status when metadata is omitted", async () => {
    const repository = new InMemoryReviewRunRepository();
    const run = createRun("run-1", {
      startedAt: "2026-03-07T00:01:00.000Z",
    });

    await repository.save(run);
    await repository.updateStatus("run-1", "processing");

    const found = await repository.findById("run-1");

    expect(found).toEqual({
      ...run,
      status: "processing",
    });
  });

  it("updateStatus applies lifecycle metadata fields", async () => {
    const repository = new InMemoryReviewRunRepository();
    const run = createRun("run-2");

    await repository.save(run);
    await repository.updateStatus("run-2", "failed", {
      completedAt: "2026-03-07T00:05:00.000Z",
      errorMessage: "lint failed",
      startedAt: "2026-03-07T00:01:00.000Z",
    });

    const found = await repository.findById("run-2");

    expect(found).toEqual({
      ...run,
      completedAt: "2026-03-07T00:05:00.000Z",
      errorMessage: "lint failed",
      startedAt: "2026-03-07T00:01:00.000Z",
      status: "failed",
    });
  });

  it("updateStatus throws when run does not exist", async () => {
    const repository = new InMemoryReviewRunRepository();

    await expect(
      repository.updateStatus("missing-run", "processing"),
    ).rejects.toThrowError("ReviewRun not found: missing-run");
  });

  it("findByStatus returns all matching runs", async () => {
    const repository = new InMemoryReviewRunRepository();

    const pendingRun = createRun("run-pending", { status: "pending" });
    const processingRun = createRun("run-processing", { status: "processing" });
    const completedRun = createRun("run-completed", { status: "completed" });

    await repository.save(pendingRun);
    await repository.save(processingRun);
    await repository.save(completedRun);

    const matches = await repository.findByStatus("processing");

    expect(matches).toEqual([processingRun]);
  });

  it("findByStatus returns empty array when no runs match", async () => {
    const repository = new InMemoryReviewRunRepository();

    await repository.save(createRun("run-pending", { status: "pending" }));

    const matches = await repository.findByStatus("failed");

    expect(matches).toEqual([]);
  });
});
