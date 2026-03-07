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

  describe("claimForProcessing", () => {
    it("claims a pending run and transitions to processing", async () => {
      const repository = new InMemoryReviewRunRepository();
      const run = createReviewRun("run-claim", { status: "pending" });
      await repository.save(run);

      const result = await repository.claimForProcessing(
        "run-claim",
        "2026-03-07T10:00:00.000Z",
      );

      expect(result).toBe("claimed");

      const found = await repository.findById("run-claim");
      expect(found).toEqual({
        ...run,
        startedAt: "2026-03-07T10:00:00.000Z",
        status: "processing",
      });
    });

    it("returns missing when run does not exist", async () => {
      const repository = new InMemoryReviewRunRepository();

      const result = await repository.claimForProcessing(
        "nonexistent",
        "2026-03-07T10:00:00.000Z",
      );

      expect(result).toBe("missing");
    });

    it.each([
      "completed",
      "failed",
      "skipped",
    ] as const)("returns terminal when run status is %s", async (status) => {
      const repository = new InMemoryReviewRunRepository();
      const run = createReviewRun("run-terminal", { status });
      await repository.save(run);

      const result = await repository.claimForProcessing(
        "run-terminal",
        "2026-03-07T10:00:00.000Z",
      );

      expect(result).toBe("terminal");

      const found = await repository.findById("run-terminal");
      expect(found).toEqual(run);
    });

    it("returns already-processing and updates startedAt for processing run", async () => {
      const repository = new InMemoryReviewRunRepository();
      const run = createReviewRun("run-retry", {
        startedAt: "2026-03-07T09:00:00.000Z",
        status: "processing",
      });
      await repository.save(run);

      const result = await repository.claimForProcessing(
        "run-retry",
        "2026-03-07T10:00:00.000Z",
      );

      expect(result).toBe("already-processing");

      const found = await repository.findById("run-retry");
      expect(found).toEqual({
        ...run,
        startedAt: "2026-03-07T10:00:00.000Z",
      });
    });
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
