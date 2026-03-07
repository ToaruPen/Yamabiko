import type { ReviewRun, RunStatus } from "../../domain/runs/review-run.js";
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

  public findByStatus(status: RunStatus): Promise<ReviewRun[]> {
    const matches = [...this.runs.values()].filter(
      (run) => run.status === status,
    );
    return Promise.resolve(matches);
  }

  public updateStatus(
    id: string,
    status: RunStatus,
    metadata?: {
      startedAt?: string;
      completedAt?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    const current = this.runs.get(id);

    if (current === undefined) {
      return Promise.reject(new Error(`ReviewRun not found: ${id}`));
    }

    const updatedRun: ReviewRun = {
      ...current,
      status,
      ...(metadata?.startedAt !== undefined
        ? { startedAt: metadata.startedAt }
        : {}),
      ...(metadata?.completedAt !== undefined
        ? { completedAt: metadata.completedAt }
        : {}),
      ...(metadata?.errorMessage !== undefined
        ? { errorMessage: metadata.errorMessage }
        : {}),
    };

    this.runs.set(id, updatedRun);
    return Promise.resolve();
  }
}
