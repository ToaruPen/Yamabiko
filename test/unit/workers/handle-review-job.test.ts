import { afterEach, describe, expect, it, type Mock, vi } from "vitest";

import type { FixExecutor } from "../../../src/adapters/llm/fix-executor.js";
import { InMemoryReviewRunRepository } from "../../../src/adapters/persistence/in-memory-review-run-repository.js";
import type { ReviewJobPayload } from "../../../src/contracts/review-job-payload.js";
import type {
  ReviewRun,
  RunStatus,
} from "../../../src/domain/runs/review-run.js";
import { handleReviewJob } from "../../../src/workers/handle-review-job.js";
import type { JobLogger } from "../../../src/workers/job-logger.js";

function createReviewRun(
  id: string,
  overrides: Partial<ReviewRun> = {},
): ReviewRun {
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

function createReviewJob(
  overrides: Partial<ReviewJobPayload> = {},
): ReviewJobPayload {
  return {
    headSha: "abc123",
    pullRequestNumber: 12,
    repositoryName: "Call-n-Response",
    repositoryOwner: "ToaruPen",
    runId: "run-1",
    ...overrides,
  };
}

function createNow(...timestamps: string[]): () => Date {
  if (timestamps.length === 0) {
    throw new Error("createNow requires at least one timestamp");
  }

  let index = 0;

  return () => {
    const current = timestamps[Math.min(index, timestamps.length - 1)];
    index += 1;

    if (current === undefined) {
      throw new Error("timestamp must be defined");
    }

    return new Date(current);
  };
}

function createLoggerMocks(): {
  logger: JobLogger;
  completed: Mock<(durationMs: number) => void>;
  failed: Mock<(error: unknown, durationMs: number) => void>;
  processing: Mock<() => void>;
  received: Mock<() => void>;
  retrying: Mock<(error: unknown, nextAttempt: number) => void>;
} {
  const received: Mock<() => void> = vi.fn();
  const processing: Mock<() => void> = vi.fn();
  const completed: Mock<(durationMs: number) => void> = vi.fn();
  const failed: Mock<(error: unknown, durationMs: number) => void> = vi.fn();
  const retrying: Mock<(error: unknown, nextAttempt: number) => void> = vi.fn();

  const logger: JobLogger = {
    completed,
    failed,
    processing,
    received,
    retrying,
  };

  return {
    completed,
    failed,
    logger,
    processing,
    received,
    retrying,
  };
}

describe("handleReviewJob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("processes a pending run through processing to completed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T10:00:00.000Z"));

    const reviewRunRepository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-happy");
    await reviewRunRepository.save(run);

    const execute = vi.fn(
      ({ run: inputRun }: Parameters<FixExecutor["execute"]>[0]) => {
        expect(inputRun).toEqual(run);
        vi.setSystemTime(new Date("2026-03-07T10:00:00.750Z"));
        return Promise.resolve({
          changedFiles: ["src/workers/handle-review-job.ts"],
          summary: "applied one fix",
        });
      },
    );
    const fixExecutor: FixExecutor = { execute };
    const logger = createLoggerMocks();

    await handleReviewJob(
      {
        fixExecutor,
        logger: logger.logger,
        now: createNow("2026-03-07T10:00:01.000Z", "2026-03-07T10:00:05.000Z"),
        reviewRunRepository,
      },
      createReviewJob({ runId: run.id }),
    );

    const updated = await reviewRunRepository.findById(run.id);
    expect(updated).toMatchObject({
      completedAt: "2026-03-07T10:00:05.000Z",
      startedAt: "2026-03-07T10:00:01.000Z",
      status: "completed",
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(logger.received).toHaveBeenCalledTimes(1);
    expect(logger.processing).toHaveBeenCalledTimes(1);
    expect(logger.completed).toHaveBeenCalledWith(750);
    expect(logger.failed).not.toHaveBeenCalled();
    expect(logger.retrying).not.toHaveBeenCalled();
  });

  it("treats missing run as terminal and returns without throwing", async () => {
    const reviewRunRepository = new InMemoryReviewRunRepository();
    const execute = vi.fn();
    const fixExecutor: FixExecutor = { execute };
    const logger = createLoggerMocks();

    await expect(
      handleReviewJob(
        {
          fixExecutor,
          logger: logger.logger,
          now: createNow("2026-03-07T11:00:00.000Z"),
          reviewRunRepository,
        },
        createReviewJob({ runId: "run-missing" }),
      ),
    ).resolves.toBeUndefined();

    expect(execute).not.toHaveBeenCalled();
    expect(logger.received).toHaveBeenCalledTimes(1);
    expect(logger.processing).not.toHaveBeenCalled();
    expect(logger.completed).not.toHaveBeenCalled();
    expect(logger.retrying).not.toHaveBeenCalled();
    expect(logger.failed).toHaveBeenCalledTimes(1);

    const failedCall = logger.failed.mock.calls[0];
    if (failedCall === undefined) {
      throw new Error("expected failed logger call");
    }

    const [error, durationMs] = failedCall;
    expect(String(error)).toContain("ReviewRun not found: run-missing");
    expect(durationMs).toBe(0);
  });

  it.each([
    "completed",
    "failed",
    "skipped",
  ] as const)("skips idempotently when run status is %s", async (status: Extract<
    RunStatus,
    "completed" | "failed" | "skipped"
  >) => {
    const reviewRunRepository = new InMemoryReviewRunRepository();
    const run = createReviewRun(`run-${status}`, { status });
    await reviewRunRepository.save(run);

    const execute = vi.fn();
    const fixExecutor: FixExecutor = { execute };
    const logger = createLoggerMocks();

    await handleReviewJob(
      {
        fixExecutor,
        logger: logger.logger,
        now: createNow("2026-03-07T11:30:00.000Z"),
        reviewRunRepository,
      },
      createReviewJob({ runId: run.id }),
    );

    const unchanged = await reviewRunRepository.findById(run.id);
    expect(unchanged).toEqual(run);
    expect(execute).not.toHaveBeenCalled();
    expect(logger.received).toHaveBeenCalledTimes(1);
    expect(logger.processing).not.toHaveBeenCalled();
    expect(logger.completed).toHaveBeenCalledWith(0);
    expect(logger.failed).not.toHaveBeenCalled();
    expect(logger.retrying).not.toHaveBeenCalled();
  });

  it("marks run failed and rethrows retryable errors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));

    const reviewRunRepository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-retryable");
    await reviewRunRepository.save(run);

    const retryableError = Object.assign(
      new Error("temporary network timeout"),
      {
        code: "ETIMEDOUT",
      },
    );
    const execute = vi.fn(() => {
      vi.setSystemTime(new Date("2026-03-07T12:00:00.900Z"));
      return Promise.reject(retryableError);
    });
    const fixExecutor: FixExecutor = { execute };
    const logger = createLoggerMocks();

    await expect(
      handleReviewJob(
        {
          fixExecutor,
          logger: logger.logger,
          now: createNow(
            "2026-03-07T12:00:01.000Z",
            "2026-03-07T12:00:02.000Z",
          ),
          reviewRunRepository,
        },
        createReviewJob({ runId: run.id }),
      ),
    ).rejects.toThrowError("temporary network timeout");

    const failedRun = await reviewRunRepository.findById(run.id);
    expect(failedRun).toMatchObject({
      completedAt: "2026-03-07T12:00:02.000Z",
      errorMessage: "Error: temporary network timeout",
      startedAt: "2026-03-07T12:00:01.000Z",
      status: "failed",
    });
    expect(logger.processing).toHaveBeenCalledTimes(1);
    expect(logger.completed).not.toHaveBeenCalled();
    expect(logger.failed).not.toHaveBeenCalled();
    expect(logger.retrying).toHaveBeenCalledWith(retryableError, 2);
  });

  it("marks run failed and swallows terminal errors", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T13:00:00.000Z"));

    const reviewRunRepository = new InMemoryReviewRunRepository();
    const run = createReviewRun("run-terminal");
    await reviewRunRepository.save(run);

    const terminalError = new TypeError("invalid transform shape");
    const execute = vi.fn(() => {
      vi.setSystemTime(new Date("2026-03-07T13:00:00.450Z"));
      return Promise.reject(terminalError);
    });
    const fixExecutor: FixExecutor = { execute };
    const logger = createLoggerMocks();

    await expect(
      handleReviewJob(
        {
          fixExecutor,
          logger: logger.logger,
          now: createNow(
            "2026-03-07T13:00:01.000Z",
            "2026-03-07T13:00:02.000Z",
          ),
          reviewRunRepository,
        },
        createReviewJob({ runId: run.id }),
      ),
    ).resolves.toBeUndefined();

    const failedRun = await reviewRunRepository.findById(run.id);
    expect(failedRun).toMatchObject({
      completedAt: "2026-03-07T13:00:02.000Z",
      errorMessage: "TypeError: invalid transform shape",
      startedAt: "2026-03-07T13:00:01.000Z",
      status: "failed",
    });
    expect(logger.completed).not.toHaveBeenCalled();
    expect(logger.retrying).not.toHaveBeenCalled();
    expect(logger.failed).toHaveBeenCalledWith(terminalError, 450);
  });
});
