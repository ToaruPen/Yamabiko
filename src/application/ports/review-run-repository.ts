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
  save(run: ReviewRun): Promise<void>;
  updateStatus(
    id: string,
    status: RunStatus,
    metadata?: {
      startedAt?: string;
      completedAt?: string;
      errorMessage?: string;
    },
  ): Promise<void>;
}
