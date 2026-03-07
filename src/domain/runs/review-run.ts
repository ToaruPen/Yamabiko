import type { ReviewActionability } from "../policy/actionability.js";
import type { ReviewFeedbackEvent } from "../review-events/review-feedback-event.js";

export const RUN_MODES = ["dry-run", "suggest-only", "push-enabled"] as const;

export type RunMode = (typeof RUN_MODES)[number];

export interface ReviewRun {
  actionability: ReviewActionability;
  createdAt: string;
  event: ReviewFeedbackEvent;
  id: string;
  mode: RunMode;
}
