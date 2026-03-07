import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { DrizzleReviewRunRepository } from "../../adapters/persistence/drizzle-review-run-repository.js";
import {
  PgBossReviewJobQueue,
  REVIEW_JOBS_DLQ,
  REVIEW_JOBS_QUEUE,
} from "../../adapters/queue/pg-boss-review-job-queue.js";
import { loadWorkerConfig } from "../../config/env.js";
import { reviewJobPayloadSchema } from "../../contracts/review-job-payload.js";
import { StubFixExecutor } from "../../executors/stub-fix-executor.js";
import { handleDeadLetter } from "../../workers/handle-dead-letter.js";
import { handleReviewJob } from "../../workers/handle-review-job.js";
import { createJobLogger } from "../../workers/job-logger.js";

async function main(): Promise<void> {
  const config = loadWorkerConfig(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
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

  await boss.work(REVIEW_JOBS_QUEUE, async ([job]) => {
    if (job === undefined) {
      return;
    }

    const parseResult = reviewJobPayloadSchema.safeParse(job.data);
    if (!parseResult.success) {
      throw new Error(
        `Invalid job payload for job ${job.id}: ${parseResult.error.message}`,
      );
    }

    const payload = parseResult.data;
    const logger = createJobLogger({
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
    );
  });

  await boss.work(REVIEW_JOBS_DLQ, async ([job]) => {
    if (job === undefined) {
      return;
    }

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
