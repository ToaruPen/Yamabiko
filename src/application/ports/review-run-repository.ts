import type { ReviewRun, RunStatus } from "../../domain/runs/review-run.js";

export type ClaimResult =
  | "claimed"
  | "missing"
  | "already-processing"
  | "terminal";

export interface ReviewRunRepository {
  claimForProcessing(id: string, startedAt: string): Promise<ClaimResult>;
  findById(id: string): Promise<ReviewRun | null>;
  findByStatus(status: RunStatus): Promise<ReviewRun[]>;
  recoverStaleProcessing(
    id: string,
    expectedStartedAt: string,
  ): Promise<boolean>;
  save(run: ReviewRun): Promise<void>;
  updateStatus(
    id: string,
    status: RunStatus,
    metadata?: {
      startedAt?: string | null;
      completedAt?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void>;
}
