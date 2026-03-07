import { describe, expect, it, type Mock, vi } from "vitest";
import { InMemoryReviewRunRepository } from "../../../src/adapters/persistence/in-memory-review-run-repository.js";
import type { ReviewJobPayload } from "../../../src/contracts/review-job-payload.js";
import { handleDeadLetter } from "../../../src/workers/handle-dead-letter.js";
import type { JobLogger } from "../../../src/workers/job-logger.js";
import { createReviewRun } from "../../fixtures/review-run.js";

function createJob(
  overrides: Partial<ReviewJobPayload> = {},
): ReviewJobPayload {
  return {
    headSha: "abc123",
    pullRequestNumber: 12,
    repositoryName: "Yamabiko",
    repositoryOwner: "ToaruPen",
    runId: "run-1",
    ...overrides,
  };
}

function createLoggerMock(): {
  logger: JobLogger;
  deadLettered: Mock<(error: unknown) => void>;
} {
  const deadLettered: Mock<(error: unknown) => void> = vi.fn();

  const logger: JobLogger = {
    completed: vi.fn(),
    deadLettered,
    failed: vi.fn(),
    processing: vi.fn(),
    received: vi.fn(),
    retrying: vi.fn(),
  };

  return { deadLettered, logger };
}

describe("handleDeadLetter", () => {
  it("transitions a processing run to failed", async () => {
    const repository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-dl", { status: "processing" });
    await repository.save(run);

    const { deadLettered, logger } = createLoggerMock();

    await handleDeadLetter(
      {
        logger,
        now: () => new Date("2026-03-07T14:00:00.000Z"),
        reviewRunRepository: repository,
      },
      createJob({ runId: "run-dl" }),
    );

    const updated = await repository.findById("run-dl");
    expect(updated).toMatchObject({
      completedAt: "2026-03-07T14:00:00.000Z",
      errorMessage: "Error: Job dead-lettered after exhausting retries: run-dl",
      status: "failed",
    });

    expect(deadLettered).toHaveBeenCalledTimes(1);
    const call = deadLettered.mock.calls[0];
    if (call === undefined) {
      throw new Error("expected deadLettered call");
    }
    expect(String(call[0])).toContain("dead-lettered after exhausting retries");
  });

  it("logs deadLettered even when run is missing", async () => {
    const repository = new InMemoryReviewRunRepository();
    const { deadLettered, logger } = createLoggerMock();

    await handleDeadLetter(
      { logger, reviewRunRepository: repository },
      createJob({ runId: "run-gone" }),
    );

    expect(deadLettered).toHaveBeenCalledTimes(1);
  });

  it("logs deadLettered even when run is already in terminal state", async () => {
    const repository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-already-failed", { status: "failed" });
    await repository.save(run);

    const { deadLettered, logger } = createLoggerMock();

    await handleDeadLetter(
      { logger, reviewRunRepository: repository },
      createJob({ runId: "run-already-failed" }),
    );

    expect(deadLettered).toHaveBeenCalledTimes(1);
  });
});
