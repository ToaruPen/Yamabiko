import { describe, expect, it } from "vitest";

import { InMemoryDeliveryRepository } from "../../../src/adapters/persistence/in-memory-delivery-repository.js";
import { InMemoryReviewRunRepository } from "../../../src/adapters/persistence/in-memory-review-run-repository.js";
import { InMemoryReviewJobQueue } from "../../../src/adapters/queue/in-memory-review-job-queue.js";
import { ingestReviewEvent } from "../../../src/application/use-cases/ingest-review-event.js";

describe("ingestReviewEvent", () => {
  it("enqueues actionable review feedback", async () => {
    const deliveryRepository = new InMemoryDeliveryRepository();
    const reviewRunRepository = new InMemoryReviewRunRepository();
    const reviewJobQueue = new InMemoryReviewJobQueue();

    const result = await ingestReviewEvent(
      {
        deliveryRepository,
        now: () => new Date("2026-03-07T00:00:00.000Z"),
        reviewJobQueue,
        reviewRunRepository,
      },
      {
        deliveryId: "delivery-123",
        event: {
          actorLogin: "codex-bot",
          body: "Please fix the lint error in src/config/env.ts.",
          headSha: "abc123",
          kind: "pull_request_review_comment",
          pullRequestNumber: 12,
          receivedAt: "2026-03-07T00:00:00.000Z",
          repository: {
            name: "Call-n-Response",
            owner: "ToaruPen",
          },
        },
        mode: "suggest-only",
        signal: {
          hasBoundedChange: true,
          hasConcreteTarget: true,
          requiresHiddenContext: false,
          requiresUnsafeSideEffects: false,
          trustedExecution: false,
        },
      },
    );

    expect(result.actionability).toBe("suggest");
    expect(result.duplicate).toBe(false);
    expect(result.enqueued).toBe(true);
    expect(result.runId).not.toBeNull();

    if (result.runId === null) {
      throw new Error("runId should not be null");
    }

    const savedDelivery = await deliveryRepository.findById("delivery-123");
    const savedRun = await reviewRunRepository.findById(result.runId);

    expect(savedDelivery).toEqual({
      action: "created",
      eventType: "pull_request_review_comment",
      id: "delivery-123",
      processed: false,
      receivedAt: "2026-03-07T00:00:00.000Z",
    });
    expect(savedRun?.actionability).toBe("suggest");
    expect(savedRun?.status).toBe("pending");
    expect(reviewJobQueue.snapshot()).toHaveLength(1);
  });

  it("saves run but does not enqueue when headSha is null", async () => {
    const deliveryRepository = new InMemoryDeliveryRepository();
    const reviewRunRepository = new InMemoryReviewRunRepository();
    const reviewJobQueue = new InMemoryReviewJobQueue();

    const result = await ingestReviewEvent(
      {
        deliveryRepository,
        now: () => new Date("2026-03-07T00:00:00.000Z"),
        reviewJobQueue,
        reviewRunRepository,
      },
      {
        deliveryId: "delivery-null-sha",
        event: {
          actorLogin: "codex-bot",
          body: "Please fix the lint error.",
          headSha: null,
          kind: "issue_comment",
          pullRequestNumber: 12,
          receivedAt: "2026-03-07T00:00:00.000Z",
          repository: {
            name: "Call-n-Response",
            owner: "ToaruPen",
          },
        },
        mode: "suggest-only",
        signal: {
          hasBoundedChange: true,
          hasConcreteTarget: true,
          requiresHiddenContext: false,
          requiresUnsafeSideEffects: false,
          trustedExecution: false,
        },
      },
    );

    expect(result.actionability).toBe("suggest");
    expect(result.duplicate).toBe(false);
    expect(result.enqueued).toBe(false);
    expect(result.runId).not.toBeNull();
    expect(reviewJobQueue.snapshot()).toHaveLength(0);

    if (result.runId !== null) {
      const savedRun = await reviewRunRepository.findById(result.runId);
      expect(savedRun).not.toBeNull();
      expect(savedRun?.status).toBe("skipped");
    }
  });

  it("marks ignored review feedback as skipped and does not enqueue", async () => {
    const deliveryRepository = new InMemoryDeliveryRepository();
    const reviewRunRepository = new InMemoryReviewRunRepository();
    const reviewJobQueue = new InMemoryReviewJobQueue();

    const result = await ingestReviewEvent(
      {
        deliveryRepository,
        now: () => new Date("2026-03-07T00:00:00.000Z"),
        reviewJobQueue,
        reviewRunRepository,
      },
      {
        deliveryId: "delivery-ignored",
        event: {
          actorLogin: "codex-bot",
          body: "Please fix the lint error in src/config/env.ts.",
          headSha: "abc123",
          kind: "pull_request_review_comment",
          pullRequestNumber: 12,
          receivedAt: "2026-03-07T00:00:00.000Z",
          repository: {
            name: "Call-n-Response",
            owner: "ToaruPen",
          },
        },
        mode: "suggest-only",
        signal: {
          hasBoundedChange: true,
          hasConcreteTarget: false,
          requiresHiddenContext: false,
          requiresUnsafeSideEffects: false,
          trustedExecution: false,
        },
      },
    );

    expect(result.actionability).toBe("ignore");
    expect(result.duplicate).toBe(false);
    expect(result.enqueued).toBe(false);
    expect(result.runId).not.toBeNull();

    if (result.runId === null) {
      throw new Error("runId should not be null for ignored review feedback");
    }

    const savedRun = await reviewRunRepository.findById(result.runId);
    expect(savedRun?.actionability).toBe("ignore");
    expect(savedRun?.status).toBe("skipped");
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });

  it("ignores duplicate deliveries", async () => {
    const deliveryRepository = new InMemoryDeliveryRepository();
    const reviewRunRepository = new InMemoryReviewRunRepository();
    const reviewJobQueue = new InMemoryReviewJobQueue();

    await deliveryRepository.save({
      action: "created",
      eventType: "pull_request_review_comment",
      id: "delivery-123",
      processed: false,
      receivedAt: "2026-03-07T00:00:00.000Z",
    });

    const result = await ingestReviewEvent(
      {
        deliveryRepository,
        now: () => new Date("2026-03-07T00:00:00.000Z"),
        reviewJobQueue,
        reviewRunRepository,
      },
      {
        deliveryId: "delivery-123",
        event: {
          actorLogin: "codex-bot",
          body: "Please fix the lint error in src/config/env.ts.",
          headSha: "abc123",
          kind: "pull_request_review_comment",
          pullRequestNumber: 12,
          receivedAt: "2026-03-07T00:00:00.000Z",
          repository: {
            name: "Call-n-Response",
            owner: "ToaruPen",
          },
        },
        mode: "suggest-only",
        signal: {
          hasBoundedChange: true,
          hasConcreteTarget: true,
          requiresHiddenContext: false,
          requiresUnsafeSideEffects: false,
          trustedExecution: false,
        },
      },
    );

    expect(result).toEqual({
      actionability: "ignore",
      duplicate: true,
      enqueued: false,
      runId: null,
    });
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });
});
