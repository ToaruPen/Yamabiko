import type { FixExecutor } from "../application/ports/fix-executor.js";
import type { ReviewRunRepository } from "../application/ports/review-run-repository.js";
import type { ReviewJobPayload } from "../contracts/review-job-payload.js";
import { isRetryableError } from "./failure-classification.js";
import type { JobLogger } from "./job-logger.js";

const NEXT_ATTEMPT_ON_RETRY = 2;

export interface HandleReviewJobDependencies {
  reviewRunRepository: ReviewRunRepository;
  fixExecutor: FixExecutor;
  logger: JobLogger;
  now?: () => Date;
}

export async function handleReviewJob(
  deps: HandleReviewJobDependencies,
  job: ReviewJobPayload,
): Promise<void> {
  deps.logger.received();

  const now = deps.now ?? (() => new Date());
  const claimResult = await deps.reviewRunRepository.claimForProcessing(
    job.runId,
    now().toISOString(),
  );

  if (claimResult === "missing") {
    deps.logger.failed(new Error(`ReviewRun not found: ${job.runId}`), 0);
    return;
  }

  if (claimResult === "terminal" || claimResult === "already-processing") {
    deps.logger.completed(0);
    return;
  }

  deps.logger.processing();

  const run = await deps.reviewRunRepository.findById(job.runId);
  if (run === null) {
    deps.logger.failed(new Error(`ReviewRun disappeared: ${job.runId}`), 0);
    return;
  }

  const startedAtMs = Date.now();

  try {
    await deps.fixExecutor.execute({ run });
    await deps.reviewRunRepository.updateStatus(run.id, "completed", {
      completedAt: now().toISOString(),
    });

    deps.logger.completed(Date.now() - startedAtMs);
  } catch (error) {
    if (isRetryableError(error)) {
      await deps.reviewRunRepository.updateStatus(run.id, "pending", {
        errorMessage: String(error),
      });
      deps.logger.retrying(error, NEXT_ATTEMPT_ON_RETRY);
      throw error;
    }

    await deps.reviewRunRepository.updateStatus(run.id, "failed", {
      completedAt: now().toISOString(),
      errorMessage: String(error),
    });

    deps.logger.failed(error, Date.now() - startedAtMs);
  }
}
