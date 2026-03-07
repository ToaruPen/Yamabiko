import type { ReviewJobQueue } from "../../application/ports/review-job-queue.js";
import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";

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
