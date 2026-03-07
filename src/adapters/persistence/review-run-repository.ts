import type { ReviewRun } from "../../domain/runs/review-run.js";

export interface ReviewRunRepository {
  findById(id: string): Promise<ReviewRun | null>;
  save(run: ReviewRun): Promise<void>;
}
