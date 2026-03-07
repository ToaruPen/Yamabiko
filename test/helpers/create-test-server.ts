import { InMemoryDeliveryRepository } from "../../src/adapters/persistence/in-memory-delivery-repository.js";
import { InMemoryReviewRunRepository } from "../../src/adapters/persistence/in-memory-review-run-repository.js";
import { InMemoryReviewJobQueue } from "../../src/adapters/queue/in-memory-review-job-queue.js";
import { buildServer } from "../../src/entrypoints/http/build-server.js";
import { signPayload } from "./sign-payload.js";

export const TEST_WEBHOOK_SECRET = "test-webhook-secret";

export const TEST_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/yamabiko",
  HOST: "127.0.0.1",
  PORT: "3000",
  RUN_MODE: "dry-run",
  WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
} as const;

export interface TestServerContext {
  server: ReturnType<typeof buildServer>;
  deliveryRepository: InMemoryDeliveryRepository;
  reviewRunRepository: InMemoryReviewRunRepository;
  reviewJobQueue: InMemoryReviewJobQueue;
}

export function createTestServer(
  overrides?: Partial<typeof TEST_ENV>,
): TestServerContext {
  const deliveryRepository = new InMemoryDeliveryRepository();
  const reviewRunRepository = new InMemoryReviewRunRepository();
  const reviewJobQueue = new InMemoryReviewJobQueue();
  const server = buildServer(
    { ...TEST_ENV, ...overrides },
    { deliveryRepository, reviewJobQueue, reviewRunRepository },
  );
  return { server, deliveryRepository, reviewRunRepository, reviewJobQueue };
}

export function createSignedWebhookRequest(
  payload: unknown,
  deliveryId: string,
  eventType: string,
  secret: string = TEST_WEBHOOK_SECRET,
): { headers: Record<string, string>; payload: string } {
  const body = JSON.stringify(payload);
  return {
    headers: {
      "content-type": "application/json",
      "x-github-delivery": deliveryId,
      "x-github-event": eventType,
      "x-hub-signature-256": signPayload(secret, body),
    },
    payload: body,
  };
}
