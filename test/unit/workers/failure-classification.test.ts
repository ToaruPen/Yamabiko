import { describe, expect, it } from "vitest";

import { isRetryableError } from "../../../src/workers/failure-classification.js";

function createErrorWithProps(
  message: string,
  props: Record<string, string | number>,
): Error {
  return Object.assign(new Error(message), props);
}

describe("isRetryableError", () => {
  it("returns true for retryable network error codes", () => {
    const retryableCodes = [
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ECONNRESET",
      "EPIPE",
      "EAI_AGAIN",
    ] as const;

    for (const code of retryableCodes) {
      const error = createErrorWithProps("socket failure", { code });

      expect(isRetryableError(error)).toBe(true);
    }
  });

  it("returns true for retryable HTTP statusCode values", () => {
    const retryableStatuses = [429, 500, 502, 503, 504] as const;

    for (const statusCode of retryableStatuses) {
      const error = createErrorWithProps("upstream failed", { statusCode });

      expect(isRetryableError(error)).toBe(true);
    }
  });

  it("returns true for retryable HTTP status values", () => {
    const retryableStatuses = [429, 500, 502, 503, 504] as const;

    for (const status of retryableStatuses) {
      const error = createErrorWithProps("upstream failed", { status });

      expect(isRetryableError(error)).toBe(true);
    }
  });

  it("returns true when message includes retryable keywords", () => {
    const errors = [
      new Error("Network connection dropped"),
      new Error("request TIMEOUT while waiting for upstream"),
      new Error("RATE LIMIT exceeded by provider"),
    ];

    for (const error of errors) {
      expect(isRetryableError(error)).toBe(true);
    }
  });

  it("returns false for validation errors", () => {
    class ValidationError extends Error {
      public constructor(message: string) {
        super(message);
        this.name = "ValidationError";
      }
    }

    const error = new ValidationError("Input payload validation failed");

    expect(isRetryableError(error)).toBe(false);
  });

  it("returns true for TypeError with retryable cause.code", () => {
    const retryableCodes = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"] as const;

    for (const code of retryableCodes) {
      const error = new TypeError("fetch failed");
      (error as { cause: { code: string } }).cause = { code };

      expect(isRetryableError(error)).toBe(true);
    }
  });

  it("returns false for TypeError with non-retryable cause.code", () => {
    const error = new TypeError("fetch failed");
    (error as { cause: { code: string } }).cause = { code: "UNKNOWN" };

    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for TypeError without cause", () => {
    const error = new TypeError("Wrong input type");

    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for programmer errors", () => {
    const errors = [
      new TypeError("Wrong input type"),
      new RangeError("Out of range"),
      new SyntaxError("Unexpected token"),
    ];

    for (const error of errors) {
      expect(isRetryableError(error)).toBe(false);
    }
  });

  it("returns false for unknown generic errors", () => {
    const error = new Error("Unexpected internal failure");

    expect(isRetryableError(error)).toBe(false);
  });

  it("returns false for non-Error values", () => {
    const nonErrors: unknown[] = [
      null,
      undefined,
      "ECONNRESET",
      500,
      { code: "ETIMEDOUT" },
      { message: "network unreachable", statusCode: 503 },
    ];

    for (const value of nonErrors) {
      expect(isRetryableError(value)).toBe(false);
    }
  });

  it("returns false for non-retryable status codes and error codes", () => {
    const codeError = createErrorWithProps("database error", {
      code: "ERR_INVALID_ARG_TYPE",
    });
    const statusCodeError = createErrorWithProps("client error", {
      statusCode: 400,
    });
    const statusError = createErrorWithProps("forbidden", {
      status: 403,
    });

    expect(isRetryableError(codeError)).toBe(false);
    expect(isRetryableError(statusCodeError)).toBe(false);
    expect(isRetryableError(statusError)).toBe(false);
  });
});
