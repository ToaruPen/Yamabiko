import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";
import type { ReviewJobQueue } from "./review-job-queue.js";

export class InMemoryReviewJobQueue implements ReviewJobQueue {
  private readonly jobs: ReviewJobPayload[] = [];

  public enqueue(job: ReviewJobPayload): Promise<void> {
    this.jobs.push({ ...job });
    return Promise.resolve();
  }

  public snapshot(): readonly ReviewJobPayload[] {
    return this.jobs.map((j) => ({ ...j }));
  }
}
