import type { ReviewRunRepository } from "../application/ports/review-run-repository.js";
import type { ReviewJobPayload } from "../contracts/review-job-payload.js";
import type { JobLogger } from "./job-logger.js";

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

  try {
    await deps.reviewRunRepository.updateStatus(job.runId, "failed", {
      completedAt: now().toISOString(),
      errorMessage: String(error),
    });
  } catch {
    // Run may already be in a terminal state or missing — log and continue.
  }

  deps.logger.deadLettered(error);
}
