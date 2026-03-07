import type { ReviewRunRepository } from "../../adapters/persistence/review-run-repository.js";
import type { ReviewJobQueue } from "../../adapters/queue/review-job-queue.js";
import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";
import {
  type ActionabilitySignal,
  classifyActionability,
  type ReviewActionability,
} from "../../domain/policy/actionability.js";
import type { ReviewFeedbackEvent } from "../../domain/review-events/review-feedback-event.js";
import type { ReviewRun, RunMode } from "../../domain/runs/review-run.js";
import { createRunId } from "../../shared/ids.js";

export interface IngestReviewEventDependencies {
  now?: () => Date;
  reviewJobQueue: ReviewJobQueue;
  reviewRunRepository: ReviewRunRepository;
}

export interface IngestReviewEventInput {
  event: ReviewFeedbackEvent;
  mode: RunMode;
  signal: ActionabilitySignal;
}

export interface IngestReviewEventResult {
  actionability: ReviewActionability;
  enqueued: boolean;
  runId: string;
}

export async function ingestReviewEvent(
  dependencies: IngestReviewEventDependencies,
  input: IngestReviewEventInput,
): Promise<IngestReviewEventResult> {
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
      enqueued: false,
      runId,
    };
  }

  if (input.event.headSha === null) {
    return {
      actionability,
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
    enqueued: true,
    runId,
  };
}
