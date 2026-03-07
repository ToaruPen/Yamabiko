export interface JobLogContext {
  jobId: string;
  runId: string;
  attempt?: number;
}

export interface JobLogEntry {
  event:
    | "job.received"
    | "job.processing"
    | "job.completed"
    | "job.failed"
    | "job.retrying"
    | "job.dead_lettered";
  jobId: string;
  runId: string;
  timestamp: string;
  attempt?: number;
  durationMs?: number;
  error?: string;
  nextAttempt?: number;
}

export interface JobLogger {
  received(): void;
  processing(): void;
  completed(durationMs: number): void;
  failed(error: unknown, durationMs: number): void;
  retrying(error: unknown, nextAttempt: number): void;
  deadLettered(error: unknown): void;
}

type JobLogSink = (entry: JobLogEntry) => void;

export function createJobLogger(
  context: JobLogContext,
  sink: JobLogSink = defaultJobLogSink,
): JobLogger {
  function emit(
    event: JobLogEntry["event"],
    details: Omit<
      JobLogEntry,
      "attempt" | "event" | "jobId" | "runId" | "timestamp"
    > = {},
  ): void {
    sink({
      ...(context.attempt === undefined ? {} : { attempt: context.attempt }),
      ...details,
      event,
      jobId: context.jobId,
      runId: context.runId,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    completed(durationMs) {
      emit("job.completed", { durationMs });
    },
    deadLettered(error) {
      emit("job.dead_lettered", { error: String(error) });
    },
    failed(error, durationMs) {
      emit("job.failed", {
        durationMs,
        error: String(error),
      });
    },
    processing() {
      emit("job.processing");
    },
    received() {
      emit("job.received");
    },
    retrying(error, nextAttempt) {
      emit("job.retrying", {
        error: String(error),
        nextAttempt,
      });
    },
  };
}

function defaultJobLogSink(entry: JobLogEntry): void {
  console.log(JSON.stringify(entry));
}
