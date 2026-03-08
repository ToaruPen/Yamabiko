import type { ReviewRunRepository } from "../application/ports/review-run-repository.js";
import type { ReviewJobPayload } from "../contracts/review-job-payload.js";
import type { JobLogger } from "./job-logger.js";

const UPDATABLE_STATUSES = new Set(["pending", "processing"]);

export interface HandleDeadLetterDependencies {
  reviewRunRepository: ReviewRunRepository;
  logger: JobLogger;
  now?: () => Date;
}

export async function handleDeadLetter(
  deps: HandleDeadLetterDependencies,
  job: ReviewJobPayload,
): Promise<void> {
  const now = deps.now ?? (() => new Date());
  const error = new Error(
    `Job dead-lettered after exhausting retries: ${job.runId}`,
  );

  const run = await deps.reviewRunRepository.findById(job.runId);

  if (run !== null && UPDATABLE_STATUSES.has(run.status)) {
    await deps.reviewRunRepository.updateStatus(job.runId, "failed", {
      completedAt: now().toISOString(),
      errorMessage: String(error),
    });
  }

  deps.logger.deadLettered(error);
}
