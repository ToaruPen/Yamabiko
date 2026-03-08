import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";

export interface ReviewJobQueue {
  enqueue(job: ReviewJobPayload): Promise<void>;
}

export interface WorkerQueueSetup {
  createQueue(): Promise<void>;
}
