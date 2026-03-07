import { randomUUID } from "node:crypto";

export function createRunId(): string {
  return randomUUID();
}
