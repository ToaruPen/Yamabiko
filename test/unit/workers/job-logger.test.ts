import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createJobLogger,
  type JobLogEntry,
} from "../../../src/workers/job-logger.js";

function expectIsoTimestamp(value: string): void {
  expect(Number.isNaN(Date.parse(value))).toBe(false);
  expect(new Date(value).toISOString()).toBe(value);
}

describe("createJobLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("received emits a structured job.received entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T11:00:00.000Z"));
    const entries: JobLogEntry[] = [];

    const logger = createJobLogger(
      { attempt: 1, jobId: "job-1", runId: "run-1" },
      (entry) => {
        entries.push(entry);
      },
    );

    logger.received();

    expect(entries).toEqual([
      {
        attempt: 1,
        event: "job.received",
        jobId: "job-1",
        runId: "run-1",
        timestamp: "2026-03-07T11:00:00.000Z",
      },
    ]);
  });

  it("processing emits a structured job.processing entry without optional fields", () => {
    const entries: JobLogEntry[] = [];

    const logger = createJobLogger(
      { jobId: "job-2", runId: "run-2" },
      (entry) => {
        entries.push(entry);
      },
    );

    logger.processing();

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (entry === undefined) {
      throw new Error("expected one log entry");
    }

    expect(entry).toMatchObject({
      event: "job.processing",
      jobId: "job-2",
      runId: "run-2",
    });
    expect(entry).not.toHaveProperty("attempt");
    expectIsoTimestamp(entry.timestamp);
  });

  it("completed emits duration with job.completed entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));
    const entries: JobLogEntry[] = [];

    const logger = createJobLogger(
      { jobId: "job-3", runId: "run-3" },
      (entry) => {
        entries.push(entry);
      },
    );

    logger.completed(238);

    expect(entries).toEqual([
      {
        durationMs: 238,
        event: "job.completed",
        jobId: "job-3",
        runId: "run-3",
        timestamp: "2026-03-07T12:00:00.000Z",
      },
    ]);
  });

  it("failed serializes unknown errors safely", () => {
    const entries: JobLogEntry[] = [];

    const logger = createJobLogger(
      { jobId: "job-4", runId: "run-4" },
      (entry) => {
        entries.push(entry);
      },
    );

    logger.failed(new Error("boom"), 19);

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (entry === undefined) {
      throw new Error("expected one log entry");
    }

    expect(entry).toMatchObject({
      durationMs: 19,
      error: "Error: boom",
      event: "job.failed",
      jobId: "job-4",
      runId: "run-4",
    });
    expectIsoTimestamp(entry.timestamp);
  });

  it("retrying emits nextAttempt and serialized error", () => {
    const entries: JobLogEntry[] = [];

    const logger = createJobLogger(
      { attempt: 1, jobId: "job-5", runId: "run-5" },
      (entry) => {
        entries.push(entry);
      },
    );

    logger.retrying("temporary network issue", 2);

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (entry === undefined) {
      throw new Error("expected one log entry");
    }

    expect(entry).toMatchObject({
      attempt: 1,
      error: "temporary network issue",
      event: "job.retrying",
      jobId: "job-5",
      nextAttempt: 2,
      runId: "run-5",
    });
    expectIsoTimestamp(entry.timestamp);
  });

  it("deadLettered emits serialized error with job.dead_lettered entry", () => {
    const entries: JobLogEntry[] = [];

    const logger = createJobLogger(
      { attempt: 3, jobId: "job-7", runId: "run-7" },
      (entry) => {
        entries.push(entry);
      },
    );

    logger.deadLettered(new Error("poison message"));

    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (entry === undefined) {
      throw new Error("expected one log entry");
    }

    expect(entry).toMatchObject({
      attempt: 3,
      error: "Error: poison message",
      event: "job.dead_lettered",
      jobId: "job-7",
      runId: "run-7",
    });
    expectIsoTimestamp(entry.timestamp);
  });

  it("uses console.log JSON sink by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T13:00:00.000Z"));
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const logger = createJobLogger({ jobId: "job-6", runId: "run-6" });

    logger.received();

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      JSON.stringify({
        event: "job.received",
        jobId: "job-6",
        runId: "run-6",
        timestamp: "2026-03-07T13:00:00.000Z",
      }),
    );
  });
});
