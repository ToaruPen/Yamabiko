import { describe, expect, it } from "vitest";

import { InMemoryReviewRunRepository } from "../../../src/adapters/persistence/in-memory-review-run-repository.js";
import { createReviewRun } from "../../fixtures/review-run.js";

describe("InMemoryReviewRunRepository", () => {
  it("updateStatus updates only status when metadata is omitted", async () => {
    const repository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-1", {
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
    const run = createReviewRun("run-2");

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

    const pendingRun = createReviewRun("run-pending", { status: "pending" });
    const processingRun = createReviewRun("run-processing", {
      status: "processing",
    });
    const completedRun = createReviewRun("run-completed", {
      status: "completed",
    });

    await repository.save(pendingRun);
    await repository.save(processingRun);
    await repository.save(completedRun);

    const matches = await repository.findByStatus("processing");

    expect(matches).toEqual([processingRun]);
  });

  it("findByStatus returns empty array when no runs match", async () => {
    const repository = new InMemoryReviewRunRepository();

    await repository.save(
      createReviewRun("run-pending", { status: "pending" }),
    );

    const matches = await repository.findByStatus("failed");

    expect(matches).toEqual([]);
  });
});
