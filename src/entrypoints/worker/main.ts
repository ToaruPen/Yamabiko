import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { DrizzleReviewRunRepository } from "../../adapters/persistence/drizzle-review-run-repository.js";
import {
  PgBossReviewJobQueue,
  REVIEW_JOBS_DLQ,
  REVIEW_JOBS_QUEUE,
} from "../../adapters/queue/pg-boss-review-job-queue.js";
import type { ReviewRunRepository } from "../../application/ports/review-run-repository.js";
import { loadWorkerConfig } from "../../config/env.js";
import { reviewJobPayloadSchema } from "../../contracts/review-job-payload.js";
import { StubFixExecutor } from "../../executors/stub-fix-executor.js";
import { handleDeadLetter } from "../../workers/handle-dead-letter.js";
import { handleReviewJob } from "../../workers/handle-review-job.js";
import { createJobLogger } from "../../workers/job-logger.js";

const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000;

async function recoverStaleRuns(
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

async function main(): Promise<void> {
  const config = loadWorkerConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  pool.on("error", (error) => {
    console.error("pg pool error:", error);
  });
  const db = drizzle(pool);
  const boss = new PgBoss(config.databaseUrl);

  boss.on("error", (error) => {
    console.error("pg-boss error:", error);
  });

  await boss.start();

  const queue = new PgBossReviewJobQueue(boss);
  await queue.createQueue();

  const reviewRunRepository = new DrizzleReviewRunRepository(db);
  const fixExecutor = new StubFixExecutor();

  await recoverStaleRuns(reviewRunRepository);

  await boss.work(
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
        const logger = createJobLogger({
          attempt: job.retryCount + 1,
          jobId: job.id,
          runId: payload.runId,
        });

        await handleReviewJob(
          {
            reviewRunRepository,
            fixExecutor,
            logger,
          },
          payload,
          job.retryCount,
        );
      }
    },
  );

  await boss.work(REVIEW_JOBS_DLQ, async (jobs) => {
    for (const job of jobs) {
      const parseResult = reviewJobPayloadSchema.safeParse(job.data);
      if (!parseResult.success) {
        throw new Error(
          `Invalid DLQ job payload for job ${job.id}: ${parseResult.error.message}`,
        );
      }

      const payload = parseResult.data;
      const logger = createJobLogger({
        jobId: job.id,
        runId: payload.runId,
      });

      await handleDeadLetter({ reviewRunRepository, logger }, payload);
    }
  });

  console.log(
    `Worker started in ${config.runMode} mode, consuming from ${REVIEW_JOBS_QUEUE}`,
  );

  let isShuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`${signal} received, shutting down worker...`);

    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("Failed to stop pg-boss worker:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((error: unknown) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
