import type {
  ClaimResult,
  ReviewRunRepository,
} from "../../application/ports/review-run-repository.js";
import type { ReviewRun, RunStatus } from "../../domain/runs/review-run.js";

const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([
  "completed",
  "failed",
  "skipped",
]);

export class InMemoryReviewRunRepository implements ReviewRunRepository {
  private readonly runs = new Map<string, ReviewRun>();

  public claimForProcessing(
    id: string,
    startedAt: string,
  ): Promise<ClaimResult> {
    const current = this.runs.get(id);

    if (current === undefined) {
      return Promise.resolve("missing");
    }

    if (TERMINAL_STATUSES.has(current.status)) {
      return Promise.resolve("terminal");
    }

    if (current.status === "processing") {
      return Promise.resolve("already-processing");
    }

    this.runs.set(id, { ...current, startedAt, status: "processing" });
    return Promise.resolve("claimed");
  }

  public findById(id: string): Promise<ReviewRun | null> {
    return Promise.resolve(this.runs.get(id) ?? null);
  }

  public findByStatus(status: RunStatus): Promise<ReviewRun[]> {
    const matches = [...this.runs.values()].filter(
      (run) => run.status === status,
    );
    return Promise.resolve(matches);
  }

  public save(run: ReviewRun): Promise<void> {
    this.runs.set(run.id, run);
    return Promise.resolve();
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

    const filtered = filterUndefined(metadata);
    const updatedRun: ReviewRun = { ...current, ...filtered, status };

    this.runs.set(id, updatedRun);
    return Promise.resolve();
  }
}

function filterUndefined<T extends Record<string, unknown>>(
  obj?: T,
): Partial<T> {
  if (obj === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
