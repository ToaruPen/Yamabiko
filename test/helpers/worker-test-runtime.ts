import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg, { type Client } from "pg";
import { PgBoss } from "pg-boss";
import { DrizzleReviewRunRepository } from "../../src/adapters/persistence/drizzle-review-run-repository.js";
import {
  PgBossReviewJobQueue,
  type ReviewJobQueueOptions,
} from "../../src/adapters/queue/pg-boss-review-job-queue.js";
import type { FixExecutor } from "../../src/application/ports/fix-executor.js";
import {
  startWorkerRuntime,
  stopWorkerRuntime,
} from "../../src/entrypoints/worker/run-worker.js";
import {
  createJobLogger,
  type JobLogEntry,
} from "../../src/workers/job-logger.js";

const APP_RESET_STATEMENTS = [
  'DROP TABLE IF EXISTS "idempotency_keys" CASCADE',
  'DROP TABLE IF EXISTS "review_runs" CASCADE',
  'DROP TABLE IF EXISTS "webhook_deliveries" CASCADE',
  'DROP TYPE IF EXISTS "public"."review_actionability" CASCADE',
  'DROP TYPE IF EXISTS "public"."run_mode" CASCADE',
  'DROP TYPE IF EXISTS "public"."run_status" CASCADE',
  "DROP SCHEMA IF EXISTS pgboss CASCADE",
] as const;

const DRIZZLE_DIRECTORY = path.resolve(process.cwd(), "drizzle");

export interface WorkerTestRuntime {
  boss: PgBoss;
  logEntries: JobLogEntry[];
  queue: PgBossReviewJobQueue;
  reviewRunRepository: DrizzleReviewRunRepository;
  stop(): Promise<void>;
}

type FindReviewRunResult = Awaited<
  ReturnType<DrizzleReviewRunRepository["findById"]>
>;

export async function resetWorkerTestDatabase(
  connectionString: string,
): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    for (const statement of APP_RESET_STATEMENTS) {
      await client.query(statement);
    }

    for (const filePath of await findMigrationFiles()) {
      const migrationSql = await readFile(filePath, "utf8");
      await runSqlStatements(client, migrationSql);
    }
  } finally {
    await client.end();
  }
}

export async function createWorkerTestRuntime(
  connectionString: string,
  fixExecutor: FixExecutor,
  queueOptions?: ReviewJobQueueOptions,
): Promise<WorkerTestRuntime> {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);
  const boss = new PgBoss(connectionString);
  const queue = new PgBossReviewJobQueue(boss, queueOptions);
  const reviewRunRepository = new DrizzleReviewRunRepository(db);
  const logEntries: JobLogEntry[] = [];

  boss.on("error", (error) => {
    console.error("pg-boss test error:", error);
  });

  try {
    await boss.start();
    await startWorkerRuntime({
      boss,
      createLogger: (context) =>
        createJobLogger(context, (entry) => {
          logEntries.push(entry);
        }),
      fixExecutor,
      queue,
      reviewRunRepository,
    });
  } catch (error) {
    await stopWorkerRuntime(boss, pool).catch((shutdownError: unknown) => {
      console.error("Failed to clean up worker test runtime:", shutdownError);
    });
    throw error instanceof Error ? error : new Error(String(error));
  }

  return {
    boss,
    logEntries,
    queue,
    reviewRunRepository,
    async stop() {
      await stopWorkerRuntime(boss, pool);
    },
  };
}

export async function waitForRun(
  repository: DrizzleReviewRunRepository,
  runId: string,
  predicate: (run: FindReviewRunResult) => boolean,
  timeoutMs: number = 5_000,
): Promise<NonNullable<FindReviewRunResult>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const run = await repository.findById(runId);
    if (predicate(run)) {
      if (run === null) {
        throw new Error(`Expected run ${runId} to exist`);
      }

      return run;
    }

    await delay(50);
  }

  const latest = await repository.findById(runId);
  throw new Error(
    `Timed out waiting for run ${runId}. Latest state: ${JSON.stringify(latest)}`,
  );
}

export async function waitForLogEntry(
  logEntries: JobLogEntry[],
  predicate: (entry: JobLogEntry) => boolean,
  timeoutMs: number = 5_000,
): Promise<JobLogEntry> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const match = logEntries.find(predicate);
    if (match !== undefined) {
      return match;
    }

    await delay(50);
  }

  throw new Error("Timed out waiting for expected worker log entry");
}

async function runSqlStatements(client: Client, sql: string): Promise<void> {
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await client.query(statement);
  }
}

async function findMigrationFiles(): Promise<string[]> {
  const entries = await readdir(DRIZZLE_DIRECTORY, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => path.join(DRIZZLE_DIRECTORY, entry.name))
    .sort();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
