import { describe, expect, it, type Mock, vi } from "vitest";
import { InMemoryReviewRunRepository } from "../../../src/adapters/persistence/in-memory-review-run-repository.js";
import type { ReviewJobPayload } from "../../../src/contracts/review-job-payload.js";
import type { RunStatus } from "../../../src/domain/runs/review-run.js";
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
  it.each([
    "pending",
    "processing",
  ] as const)("transitions a %s run to failed", async (status: Extract<
    RunStatus,
    "pending" | "processing"
  >) => {
    const repository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-dl", { status });
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

  it("logs deadLettered without updating when run is missing", async () => {
    const repository = new InMemoryReviewRunRepository();
    const { deadLettered, logger } = createLoggerMock();

    await handleDeadLetter(
      { logger, reviewRunRepository: repository },
      createJob({ runId: "run-gone" }),
    );

    expect(deadLettered).toHaveBeenCalledTimes(1);
  });

  it.each([
    "completed",
    "failed",
    "skipped",
  ] as const)("logs deadLettered without updating when run status is %s", async (status: Extract<
    RunStatus,
    "completed" | "failed" | "skipped"
  >) => {
    const repository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-terminal", { status });
    await repository.save(run);

    const { deadLettered, logger } = createLoggerMock();

    await handleDeadLetter(
      { logger, reviewRunRepository: repository },
      createJob({ runId: "run-terminal" }),
    );

    const unchanged = await repository.findById("run-terminal");
    expect(unchanged).toEqual(run);
    expect(deadLettered).toHaveBeenCalledTimes(1);
  });
});
