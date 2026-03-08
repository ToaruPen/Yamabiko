const RETRYABLE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "EAI_AGAIN",
]);

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

const RETRYABLE_MESSAGE_FRAGMENTS = ["network", "timeout", "rate limit"];

function hasProperty<K extends string>(
  value: object,
  key: K,
): value is Record<K, unknown> {
  return key in value;
}

function hasRetryableCauseCode(error: TypeError): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (
    cause !== undefined &&
    typeof cause.code === "string" &&
    RETRYABLE_ERROR_CODES.has(cause.code)
  );
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof RangeError || error instanceof SyntaxError) {
    return false;
  }

  if (error instanceof TypeError) {
    return hasRetryableCauseCode(error);
  }

  if (
    hasProperty(error, "code") &&
    typeof error.code === "string" &&
    RETRYABLE_ERROR_CODES.has(error.code)
  ) {
    return true;
  }

  if (
    hasProperty(error, "statusCode") &&
    typeof error.statusCode === "number" &&
    RETRYABLE_HTTP_STATUSES.has(error.statusCode)
  ) {
    return true;
  }

  if (
    hasProperty(error, "status") &&
    typeof error.status === "number" &&
    RETRYABLE_HTTP_STATUSES.has(error.status)
  ) {
    return true;
  }

  const lowerMessage = error.message.toLowerCase();

  return RETRYABLE_MESSAGE_FRAGMENTS.some((fragment) =>
    lowerMessage.includes(fragment),
  );
}
