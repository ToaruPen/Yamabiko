import type { ReviewRun } from "../../domain/runs/review-run.js";
import type { ReviewRunRepository } from "./review-run-repository.js";

export class InMemoryReviewRunRepository implements ReviewRunRepository {
  private readonly runs = new Map<string, ReviewRun>();

  public findById(id: string): Promise<ReviewRun | null> {
    return Promise.resolve(this.runs.get(id) ?? null);
  }

  public save(run: ReviewRun): Promise<void> {
    this.runs.set(run.id, run);
    return Promise.resolve();
  }
}
