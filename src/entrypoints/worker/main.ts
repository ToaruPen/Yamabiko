import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { DrizzleReviewRunRepository } from "../../adapters/persistence/drizzle-review-run-repository.js";
import {
  PgBossReviewJobQueue,
  REVIEW_JOBS_QUEUE,
} from "../../adapters/queue/pg-boss-review-job-queue.js";
import { loadWorkerConfig } from "../../config/env.js";
import { StubFixExecutor } from "../../executors/stub-fix-executor.js";
import { startWorkerRuntime, stopWorkerRuntime } from "./run-worker.js";

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
  const reviewRunRepository = new DrizzleReviewRunRepository(db);
  const fixExecutor = new StubFixExecutor();

  await startWorkerRuntime({
    boss,
    fixExecutor,
    queue,
    reviewRunRepository,
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
      await stopWorkerRuntime(boss, pool);
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
