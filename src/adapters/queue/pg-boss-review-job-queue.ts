import type { PgBoss } from "pg-boss";
import type {
  ReviewJobQueue,
  WorkerQueueSetup,
} from "../../application/ports/review-job-queue.js";
import type { ReviewJobPayload } from "../../contracts/review-job-payload.js";

export const REVIEW_JOBS_QUEUE = "review-jobs";
export const REVIEW_JOBS_DLQ = "review-jobs-dlq";

export interface ReviewJobQueueOptions {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
}

const DEFAULT_REVIEW_JOB_QUEUE_OPTIONS: Required<ReviewJobQueueOptions> = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
};

export class PgBossReviewJobQueue implements ReviewJobQueue, WorkerQueueSetup {
  public constructor(
    private readonly boss: PgBoss,
    private readonly options?: ReviewJobQueueOptions,
  ) {}

  public async enqueue(job: ReviewJobPayload): Promise<void> {
    await this.boss.send(REVIEW_JOBS_QUEUE, job);
  }

  public async createQueue(): Promise<void> {
    const options: Required<ReviewJobQueueOptions> = {
      ...DEFAULT_REVIEW_JOB_QUEUE_OPTIONS,
      ...this.options,
    };

    await this.boss.createQueue(REVIEW_JOBS_DLQ);
    await this.boss.createQueue(REVIEW_JOBS_QUEUE, {
      retryLimit: options.retryLimit,
      retryDelay: options.retryDelay,
      retryBackoff: options.retryBackoff,
      deadLetter: REVIEW_JOBS_DLQ,
    });
  }
}
