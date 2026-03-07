import type { PgBoss } from "pg-boss";
import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";
import type { ReviewJobQueue } from "./review-job-queue.js";

export const REVIEW_JOBS_QUEUE = "review-jobs";
export const REVIEW_JOBS_DLQ = "review-jobs-dlq";

export class PgBossReviewJobQueue implements ReviewJobQueue {
  public constructor(private readonly boss: PgBoss) {}

  public async enqueue(job: ReviewJobPayload): Promise<void> {
    await this.boss.send(REVIEW_JOBS_QUEUE, job);
  }

  public async createQueue(): Promise<void> {
    await this.boss.createQueue(REVIEW_JOBS_DLQ);
    await this.boss.createQueue(REVIEW_JOBS_QUEUE, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: REVIEW_JOBS_DLQ,
    });
  }
}
