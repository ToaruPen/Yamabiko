import type {
  FixExecutionResult,
  FixExecutor,
} from "../adapters/llm/fix-executor.js";
import type { ReviewRun } from "../domain/runs/review-run.js";

export async function processReviewFeedback(
  run: ReviewRun,
  executor: FixExecutor,
): Promise<FixExecutionResult> {
  return executor.execute({ run });
}
