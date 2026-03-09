import type { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  REVIEW_JOBS_DLQ,
  REVIEW_JOBS_QUEUE,
} from "../../adapters/queue/pg-boss-review-job-queue.js";
import type { FixExecutor } from "../../application/ports/fix-executor.js";
import type { WorkerQueueSetup } from "../../application/ports/review-job-queue.js";
import type { ReviewRunRepository } from "../../application/ports/review-run-repository.js";
import { reviewJobPayloadSchema } from "../../contracts/review-job-payload.js";
import { handleDeadLetter } from "../../workers/handle-dead-letter.js";
import { handleReviewJob } from "../../workers/handle-review-job.js";
import {
  createJobLogger,
  type JobLogContext,
  type JobLogger,
} from "../../workers/job-logger.js";

export const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

export interface WorkerRuntimeDependencies {
  boss: PgBoss;
  fixExecutor: FixExecutor;
  queue: WorkerQueueSetup;
  reviewRunRepository: ReviewRunRepository;
  createLogger?: (context: JobLogContext) => JobLogger;
}

export async function recoverStaleRuns(
  repository: ReviewRunRepository,
): Promise<void> {
  const processingRuns = await repository.findByStatus("processing");
  const now = Date.now();

  for (const run of processingRuns) {
    if (run.startedAt === undefined) {
      continue;
    }

    const elapsed = now - new Date(run.startedAt).getTime();
    if (elapsed > STALE_PROCESSING_THRESHOLD_MS) {
      const recovered = await repository.recoverStaleProcessing(
        run.id,
        run.startedAt,
      );
      if (recovered) {
        console.log(
          `Recovered stale processing run ${run.id} (stuck for ${String(Math.round(elapsed / 1000))}s)`,
        );
      }
    }
  }
}

export async function startWorkerRuntime(
  deps: WorkerRuntimeDependencies,
): Promise<void> {
  await deps.queue.createQueue();
  await recoverStaleRuns(deps.reviewRunRepository);
  await registerWorkerConsumers(deps);
}

export async function registerWorkerConsumers(
  deps: WorkerRuntimeDependencies,
): Promise<void> {
  const createLogger = deps.createLogger ?? createJobLogger;

  await deps.boss.work(
    REVIEW_JOBS_QUEUE,
    { includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        const parseResult = reviewJobPayloadSchema.safeParse(job.data);
        if (!parseResult.success) {
          throw new Error(
            `Invalid job payload for job ${job.id}: ${parseResult.error.message}`,
          );
        }

        const payload = parseResult.data;
        const logger = createLogger({
          attempt: job.retryCount + 1,
          jobId: job.id,
          runId: payload.runId,
        });

        await handleReviewJob(
          {
            reviewRunRepository: deps.reviewRunRepository,
            fixExecutor: deps.fixExecutor,
            logger,
          },
          payload,
          job.retryCount,
        );
      }
    },
  );

  await deps.boss.work(REVIEW_JOBS_DLQ, async (jobs) => {
    for (const job of jobs) {
      const parseResult = reviewJobPayloadSchema.safeParse(job.data);
      if (!parseResult.success) {
        throw new Error(
          `Invalid DLQ job payload for job ${job.id}: ${parseResult.error.message}`,
        );
      }

      const payload = parseResult.data;
      const logger = createLogger({
        jobId: job.id,
        runId: payload.runId,
      });

      await handleDeadLetter(
        { reviewRunRepository: deps.reviewRunRepository, logger },
        payload,
      );
    }
  });
}

export async function stopWorkerRuntime(
  boss: PgBoss,
  pool: Pool,
): Promise<void> {
  let bossStopError: Error | undefined;

  try {
    await boss.stop({ graceful: true, timeout: 30_000 });
  } catch (error) {
    bossStopError = toError(error);
  }

  try {
    await pool.end();
  } catch (error) {
    if (bossStopError !== undefined) {
      console.error("Failed to close pg pool during worker shutdown:", error);
    } else {
      throw toError(error);
    }
  }

  if (bossStopError !== undefined) {
    throw bossStopError;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
