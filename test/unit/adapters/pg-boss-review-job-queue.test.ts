import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import {
  PgBossReviewJobQueue,
  REVIEW_JOBS_DLQ,
  REVIEW_JOBS_QUEUE,
} from "../../../src/adapters/queue/pg-boss-review-job-queue.js";
import type { ReviewJobPayload } from "../../../src/contracts/review-job-payload.js";

const sampleJob: ReviewJobPayload = {
  headSha: "abc123",
  pullRequestNumber: 42,
  repositoryName: "yamabiko",
  repositoryOwner: "acme",
  runId: "run-1",
};

describe("PgBossReviewJobQueue", () => {
  it("enqueue calls boss.send with queue name and payload", async () => {
    const bossMock = {
      send: vi.fn().mockResolvedValue("job-id-1"),
      createQueue: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new PgBossReviewJobQueue(bossMock as unknown as PgBoss);

    await queue.enqueue(sampleJob);

    expect(bossMock.send).toHaveBeenCalledTimes(1);
    expect(bossMock.send).toHaveBeenCalledWith(REVIEW_JOBS_QUEUE, sampleJob);
  });

  it("createQueue creates dlq and main queue with retry and dead letter options", async () => {
    const bossMock = {
      send: vi.fn().mockResolvedValue("job-id-1"),
      createQueue: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new PgBossReviewJobQueue(bossMock as unknown as PgBoss);

    await queue.createQueue();

    expect(bossMock.createQueue).toHaveBeenCalledTimes(2);
    expect(bossMock.createQueue).toHaveBeenNthCalledWith(1, REVIEW_JOBS_DLQ);
    expect(bossMock.createQueue).toHaveBeenNthCalledWith(2, REVIEW_JOBS_QUEUE, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: REVIEW_JOBS_DLQ,
    });
  });

  it("createQueue allows retry settings to be overridden", async () => {
    const bossMock = {
      send: vi.fn().mockResolvedValue("job-id-1"),
      createQueue: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new PgBossReviewJobQueue(bossMock as unknown as PgBoss, {
      retryDelay: 1,
      retryLimit: 1,
    });

    await queue.createQueue();

    expect(bossMock.createQueue).toHaveBeenCalledTimes(2);
    expect(bossMock.createQueue).toHaveBeenNthCalledWith(1, REVIEW_JOBS_DLQ);
    expect(bossMock.createQueue).toHaveBeenNthCalledWith(2, REVIEW_JOBS_QUEUE, {
      retryLimit: 1,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: REVIEW_JOBS_DLQ,
    });
  });

  it("uses constructor injected pg-boss instance", async () => {
    const bossMock = {
      send: vi.fn().mockResolvedValue("job-id-2"),
      createQueue: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new PgBossReviewJobQueue(bossMock as unknown as PgBoss);

    await queue.enqueue(sampleJob);

    expect(bossMock.send).toHaveBeenCalledTimes(1);
  });
});
