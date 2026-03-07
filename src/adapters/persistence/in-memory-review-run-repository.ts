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
      startedAt?: string | null;
      completedAt?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    const current = this.runs.get(id);

    if (current === undefined) {
      return Promise.reject(new Error(`ReviewRun not found: ${id}`));
    }

    const updatedRun: ReviewRun = { ...current, status };

    if (metadata) {
      applyStatusMetadata(updatedRun, metadata);
    }

    this.runs.set(id, updatedRun);
    return Promise.resolve();
  }
}

// Metadata semantics: undefined = keep, null = clear, string = set
function applyStatusMetadata(
  run: ReviewRun,
  metadata: {
    startedAt?: string | null;
    completedAt?: string | null;
    errorMessage?: string | null;
  },
): void {
  if (metadata.startedAt === null) {
    delete run.startedAt;
  } else if (metadata.startedAt !== undefined) {
    run.startedAt = metadata.startedAt;
  }

  if (metadata.completedAt === null) {
    delete run.completedAt;
  } else if (metadata.completedAt !== undefined) {
    run.completedAt = metadata.completedAt;
  }

  if (metadata.errorMessage === null) {
    delete run.errorMessage;
  } else if (metadata.errorMessage !== undefined) {
    run.errorMessage = metadata.errorMessage;
  }
}
