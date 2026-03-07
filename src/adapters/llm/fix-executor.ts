import type { ReviewRun } from "../../domain/runs/review-run.js";

export interface FixExecutionRequest {
  run: ReviewRun;
}

export interface FixExecutionResult {
  changedFiles: readonly string[];
  summary: string;
}

export interface FixExecutor {
  execute(request: FixExecutionRequest): Promise<FixExecutionResult>;
}
