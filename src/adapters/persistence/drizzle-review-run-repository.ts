import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  ClaimResult,
  ReviewRunRepository,
} from "../../application/ports/review-run-repository.js";
import type { ReviewEventKind } from "../../domain/review-events/review-feedback-event.js";
import type { ReviewRun, RunStatus } from "../../domain/runs/review-run.js";
import { reviewRunsTable } from "./schema.js";

type ReviewRunRow = typeof reviewRunsTable.$inferSelect;
type StatusMetadata = Parameters<ReviewRunRepository["updateStatus"]>[2];
type StatusUpdates = {
  status: RunStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
};

export class DrizzleReviewRunRepository implements ReviewRunRepository {
  public constructor(private readonly db: NodePgDatabase) {}

  public async claimForProcessing(
    id: string,
    startedAt: string,
  ): Promise<ClaimResult> {
    const claimed = await this.db
      .update(reviewRunsTable)
      .set({ status: "processing", startedAt: new Date(startedAt) })
      .where(
        and(eq(reviewRunsTable.id, id), eq(reviewRunsTable.status, "pending")),
      )
      .returning({ id: reviewRunsTable.id });

    if (claimed.length > 0) {
      return "claimed";
    }

    const rows = await this.db
      .select({ status: reviewRunsTable.status })
      .from(reviewRunsTable)
      .where(eq(reviewRunsTable.id, id));

    if (rows.length === 0) {
      return "missing";
    }

    const row = rows[0];
    if (row === undefined) {
      return "missing";
    }

    if (row.status === "processing") {
      return "already-processing";
    }

    return "terminal";
  }

  public async findById(id: string): Promise<ReviewRun | null> {
    const rows = await this.db
      .select()
      .from(reviewRunsTable)
      .where(eq(reviewRunsTable.id, id))
      .limit(1);

    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return toDomain(row);
  }

  public async findByStatus(status: RunStatus): Promise<ReviewRun[]> {
    const rows = await this.db
      .select()
      .from(reviewRunsTable)
      .where(eq(reviewRunsTable.status, status));

    return rows.map(toDomain);
  }

  public async save(run: ReviewRun): Promise<void> {
    await this.db.insert(reviewRunsTable).values({
      actionability: run.actionability,
      actorLogin: run.event.actorLogin,
      body: run.event.body,
      completedAt:
        run.completedAt === undefined ? null : new Date(run.completedAt),
      createdAt: new Date(run.createdAt),
      errorMessage: run.errorMessage === undefined ? null : run.errorMessage,
      headSha: run.event.headSha,
      id: run.id,
      kind: run.event.kind,
      mode: run.mode,
      pullRequestNumber: run.event.pullRequestNumber,
      receivedAt: new Date(run.event.receivedAt),
      repositoryName: run.event.repository.name,
      repositoryOwner: run.event.repository.owner,
      startedAt: run.startedAt === undefined ? null : new Date(run.startedAt),
      status: run.status,
    });
  }

  public async updateStatus(
    id: string,
    status: RunStatus,
    metadata?: {
      startedAt?: string | null;
      completedAt?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    const updates = buildStatusUpdates(status, metadata);

    const updated = await this.db
      .update(reviewRunsTable)
      .set(updates)
      .where(eq(reviewRunsTable.id, id))
      .returning({ id: reviewRunsTable.id });

    if (updated.length === 0) {
      throw new Error(`ReviewRun not found: ${id}`);
    }
  }
}

function buildStatusUpdates(
  status: RunStatus,
  metadata?: StatusMetadata,
): StatusUpdates {
  const updates: StatusUpdates = { status };

  if (metadata === undefined) {
    return updates;
  }

  applyOptionalDate(updates, "startedAt", metadata.startedAt);
  applyOptionalDate(updates, "completedAt", metadata.completedAt);

  if (metadata.errorMessage !== undefined) {
    updates.errorMessage = metadata.errorMessage;
  }

  return updates;
}

function applyOptionalDate(
  updates: StatusUpdates,
  key: "startedAt" | "completedAt",
  value: string | null | undefined,
): void {
  if (value === undefined) {
    return;
  }

  updates[key] = value === null ? null : new Date(value);
}

function toDomain(row: ReviewRunRow): ReviewRun {
  const run: ReviewRun = {
    actionability: row.actionability,
    createdAt: row.createdAt.toISOString(),
    event: {
      actorLogin: row.actorLogin,
      body: row.body,
      headSha: row.headSha,
      kind: row.kind as ReviewEventKind,
      pullRequestNumber: row.pullRequestNumber,
      receivedAt: row.receivedAt.toISOString(),
      repository: {
        name: row.repositoryName,
        owner: row.repositoryOwner,
      },
    },
    id: row.id,
    mode: row.mode,
    status: row.status,
  };

  if (row.startedAt !== null) {
    run.startedAt = row.startedAt.toISOString();
  }

  if (row.completedAt !== null) {
    run.completedAt = row.completedAt.toISOString();
  }

  if (row.errorMessage !== null) {
    run.errorMessage = row.errorMessage;
  }

  return run;
}
