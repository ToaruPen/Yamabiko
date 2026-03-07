import type { ReviewActionability } from "../policy/actionability.js";
import type { ReviewFeedbackEvent } from "../review-events/review-feedback-event.js";

export const RUN_MODES = ["dry-run", "suggest-only", "push-enabled"] as const;

export type RunMode = (typeof RUN_MODES)[number];

// biome-ignore format: keep exact union declaration
export type RunStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

export interface ReviewRun {
  actionability: ReviewActionability;
  completedAt?: string;
  createdAt: string;
  errorMessage?: string;
  event: ReviewFeedbackEvent;
  id: string;
  mode: RunMode;
  startedAt?: string;
  status: RunStatus;
}
