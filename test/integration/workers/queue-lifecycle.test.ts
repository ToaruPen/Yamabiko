import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FixExecutor } from "../../../src/application/ports/fix-executor.js";
import type { ReviewJobPayload } from "../../../src/contracts/review-job-payload.js";
import { createReviewRun } from "../../fixtures/review-run.js";
import {
  createWorkerTestRuntime,
  resetWorkerTestDatabase,
  type WorkerTestRuntime,
  waitForLogEntry,
  waitForRun,
} from "../../helpers/worker-test-runtime.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const describeWorkerIntegration =
  TEST_DATABASE_URL === undefined ? describe.skip : describe;

function toJobPayload(runId: string): ReviewJobPayload {
  return {
    headSha: "abc123",
    pullRequestNumber: 12,
    repositoryName: "Yamabiko",
    repositoryOwner: "ToaruPen",
    runId,
  };
}

describeWorkerIntegration("worker queue lifecycle integration", () => {
  let databaseUrl = "";
  let runtime: WorkerTestRuntime | null = null;

  beforeEach(async () => {
    databaseUrl = getDatabaseUrl();
    await resetWorkerTestDatabase(databaseUrl);
  });

  afterEach(async () => {
    if (runtime !== null) {
      await runtime.stop();
      runtime = null;
    }
  });

  it("processes a queued pending run to completed", async () => {
    let executeCalls = 0;
    const fixExecutor: FixExecutor = {
      execute() {
        executeCalls += 1;
        return Promise.resolve({
          changedFiles: ["src/workers/handle-review-job.ts"],
          summary: "applied one deterministic fix",
        });
      },
    };

    runtime = await createWorkerTestRuntime(databaseUrl, fixExecutor, {
      retryDelay: 1,
    });

    const run = createReviewRun("run-success");
    await runtime.reviewRunRepository.save(run);
    await runtime.queue.enqueue(toJobPayload(run.id));

    const updated = await waitForRun(
      runtime.reviewRunRepository,
      run.id,
      (candidate) => candidate?.status === "completed",
    );

    expect(executeCalls).toBe(1);
    expect(updated.startedAt).toBeDefined();
    expect(updated.completedAt).toBeDefined();
    expect(updated.errorMessage).toBeUndefined();
  }, 15_000);

  it("retries retryable failures and eventually completes", async () => {
    let executeCalls = 0;
    const fixExecutor: FixExecutor = {
      execute() {
        executeCalls += 1;
        if (executeCalls === 1) {
          return Promise.reject(
            Object.assign(new Error("temporary network issue"), {
              code: "ETIMEDOUT",
            }),
          );
        }

        return Promise.resolve({
          changedFiles: [],
          summary: "succeeded after retry",
        });
      },
    };

    runtime = await createWorkerTestRuntime(databaseUrl, fixExecutor, {
      retryDelay: 1,
    });

    const run = createReviewRun("run-retry");
    await runtime.reviewRunRepository.save(run);
    await runtime.queue.enqueue(toJobPayload(run.id));

    const updated = await waitForRun(
      runtime.reviewRunRepository,
      run.id,
      (candidate) => candidate?.status === "completed",
      10_000,
    );

    await waitForLogEntry(
      runtime.logEntries,
      (entry) => entry.runId === run.id && entry.event === "job.retrying",
    );

    expect(executeCalls).toBe(2);
    expect(updated.errorMessage).toBeUndefined();
    expect(updated.completedAt).toBeDefined();
  }, 15_000);

  it("dead-letters exhausted retryable failures and marks the run failed", async () => {
    let executeCalls = 0;
    const fixExecutor: FixExecutor = {
      execute() {
        executeCalls += 1;
        return Promise.reject(
          Object.assign(new Error("transient upstream outage"), {
            code: "ECONNRESET",
          }),
        );
      },
    };

    runtime = await createWorkerTestRuntime(databaseUrl, fixExecutor, {
      retryDelay: 1,
      retryLimit: 1,
    });

    const run = createReviewRun("run-dead-letter");
    await runtime.reviewRunRepository.save(run);
    await runtime.queue.enqueue(toJobPayload(run.id));

    const updated = await waitForRun(
      runtime.reviewRunRepository,
      run.id,
      (candidate) =>
        candidate?.status === "failed" &&
        candidate.errorMessage?.includes(
          "dead-lettered after exhausting retries",
        ) === true,
      10_000,
    );

    await waitForLogEntry(
      runtime.logEntries,
      (entry) => entry.runId === run.id && entry.event === "job.dead_lettered",
      10_000,
    );

    expect(executeCalls).toBe(2);
    expect(updated.completedAt).toBeDefined();
  }, 15_000);

  it("skips idempotently when a queued run is already completed", async () => {
    let executeCalls = 0;
    const fixExecutor: FixExecutor = {
      execute() {
        executeCalls += 1;
        return Promise.resolve({
          changedFiles: [],
          summary: "should never run",
        });
      },
    };

    runtime = await createWorkerTestRuntime(databaseUrl, fixExecutor, {
      retryDelay: 1,
    });

    const run = createReviewRun("run-terminal", {
      completedAt: "2026-03-07T12:00:00.000Z",
      status: "completed",
    });
    await runtime.reviewRunRepository.save(run);
    await runtime.queue.enqueue(toJobPayload(run.id));

    await waitForLogEntry(
      runtime.logEntries,
      (entry) => entry.runId === run.id && entry.event === "job.completed",
    );

    const unchanged = await runtime.reviewRunRepository.findById(run.id);
    expect(executeCalls).toBe(0);
    expect(unchanged).toEqual(run);
  }, 15_000);
});

function getDatabaseUrl(): string {
  if (TEST_DATABASE_URL === undefined) {
    throw new Error(
      "TEST_DATABASE_URL must be set for worker integration tests",
    );
  }

  return TEST_DATABASE_URL;
}
