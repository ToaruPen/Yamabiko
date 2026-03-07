import type { ReviewRun, RunStatus } from "../../domain/runs/review-run.js";

export interface ReviewRunRepository {
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
