import type { DeliveryRepository } from "../../adapters/persistence/delivery-repository.js";
import type { ReviewRunRepository } from "../../adapters/persistence/review-run-repository.js";
import type { ReviewJobQueue } from "../../adapters/queue/review-job-queue.js";
import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";
import type { WebhookDelivery } from "../../domain/deliveries/webhook-delivery.js";
import {
  type ActionabilitySignal,
  classifyActionability,
  type ReviewActionability,
} from "../../domain/policy/actionability.js";
import type { ReviewFeedbackEvent } from "../../domain/review-events/review-feedback-event.js";
import type { ReviewRun, RunMode } from "../../domain/runs/review-run.js";
import { createRunId } from "../../shared/ids.js";

export interface IngestReviewEventDependencies {
  deliveryRepository: DeliveryRepository;
  now?: () => Date;
  reviewJobQueue: ReviewJobQueue;
  reviewRunRepository: ReviewRunRepository;
}

export interface IngestReviewEventInput {
  deliveryId: string;
  event: ReviewFeedbackEvent;
  mode: RunMode;
  signal: ActionabilitySignal;
}

export interface IngestReviewEventResult {
  actionability: ReviewActionability;
  duplicate: boolean;
  enqueued: boolean;
  runId: string | null;
}

export async function ingestReviewEvent(
  dependencies: IngestReviewEventDependencies,
  input: IngestReviewEventInput,
): Promise<IngestReviewEventResult> {
  // TODO: Replace with atomic insert-or-conflict check (DB unique constraint on delivery_id)
  // when switching from in-memory to Postgres adapter. Current check-then-insert is not
  // race-safe under concurrent delivery of the same webhook event.
  const duplicate = await dependencies.deliveryRepository.existsById(
    input.deliveryId,
  );

  if (duplicate) {
    return {
      actionability: "ignore",
      duplicate: true,
      enqueued: false,
      runId: null,
    };
  }

  const delivery: WebhookDelivery = {
    action: toDeliveryAction(input.event),
    eventType: input.event.kind,
    id: input.deliveryId,
    processed: false,
    receivedAt: input.event.receivedAt,
  };

  // TODO: Wrap delivery + run + enqueue in a transaction (or outbox pattern)
  // so partial failures don't leave orphaned deliveries that block retries.
  await dependencies.deliveryRepository.save(delivery);

  const createdAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const actionability = classifyActionability(input.signal);
  const runId = createRunId();
  const run: ReviewRun = {
    actionability,
    createdAt,
    event: input.event,
    id: runId,
    mode: input.mode,
  };

  await dependencies.reviewRunRepository.save(run);

  if (actionability === "ignore") {
    return {
      actionability,
      duplicate: false,
      enqueued: false,
      runId,
    };
  }

  if (input.event.headSha === null) {
    return {
      actionability,
      duplicate: false,
      enqueued: false,
      runId,
    };
  }

  const job: ReviewJobPayload = {
    headSha: input.event.headSha,
    pullRequestNumber: input.event.pullRequestNumber,
    repositoryName: input.event.repository.name,
    repositoryOwner: input.event.repository.owner,
    runId,
  };

  await dependencies.reviewJobQueue.enqueue(job);

  return {
    actionability,
    duplicate: false,
    enqueued: true,
    runId,
  };
}

function toDeliveryAction(event: ReviewFeedbackEvent): string {
  if (event.kind === "pull_request_review") {
    return "submitted";
  }

  return "created";
}
