import type { ReviewActionability } from "../policy/actionability.js";
import type { ReviewFeedbackEvent } from "../review-events/review-feedback-event.js";

export const RUN_MODES = ["dry-run", "suggest-only", "push-enabled"] as const;

export type RunMode = (typeof RUN_MODES)[number];

export const RUN_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "skipped",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

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
