import type { FixExecutor } from "../application/ports/fix-executor.js";
import type { ReviewRunRepository } from "../application/ports/review-run-repository.js";
import type { ReviewJobPayload } from "../contracts/review-job-payload.js";
import { isRetryableError } from "./failure-classification.js";
import type { JobLogger } from "./job-logger.js";

export interface HandleReviewJobDependencies {
  reviewRunRepository: ReviewRunRepository;
  fixExecutor: FixExecutor;
  logger: JobLogger;
  now?: () => Date;
}

export async function handleReviewJob(
  deps: HandleReviewJobDependencies,
  job: ReviewJobPayload,
  retryCount?: number,
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

  if (claimResult === "terminal") {
    deps.logger.completed(0);
    return;
  }

  if (claimResult === "already-processing") {
    throw new Error(
      `ReviewRun ${job.runId} is already being processed by another worker`,
    );
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
      errorMessage: null,
    });

    deps.logger.completed(Date.now() - startedAtMs);
  } catch (error) {
    if (isRetryableError(error)) {
      await deps.reviewRunRepository.updateStatus(run.id, "pending", {
        errorMessage: String(error),
      });
      deps.logger.retrying(error, (retryCount ?? 0) + 2);
      throw error;
    }

    await deps.reviewRunRepository.updateStatus(run.id, "failed", {
      completedAt: now().toISOString(),
      errorMessage: String(error),
    });

    deps.logger.failed(error, Date.now() - startedAtMs);
  }
}
