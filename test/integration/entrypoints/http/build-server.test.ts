import { afterEach, describe, expect, it } from "vitest";

import { InMemoryDeliveryRepository } from "../../../../src/adapters/persistence/in-memory-delivery-repository.js";
import { InMemoryReviewRunRepository } from "../../../../src/adapters/persistence/in-memory-review-run-repository.js";
import { InMemoryReviewJobQueue } from "../../../../src/adapters/queue/in-memory-review-job-queue.js";
import { buildServer } from "../../../../src/entrypoints/http/build-server.js";

describe("buildServer", () => {
  const servers = new Set<ReturnType<typeof buildServer>>();

  afterEach(async () => {
    await Promise.all(
      [...servers].map(async (server) => {
        await server.close();
      }),
    );
    servers.clear();
  });

  it("exposes a health endpoint", async () => {
    const server = buildServer(
      {
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/call_n_response",
        HOST: "127.0.0.1",
        PORT: "3000",
        RUN_MODE: "dry-run",
        WEBHOOK_SECRET: "test-secret",
      },
      {
        deliveryRepository: new InMemoryDeliveryRepository(),
        reviewJobQueue: new InMemoryReviewJobQueue(),
        reviewRunRepository: new InMemoryReviewRunRepository(),
      },
    );

    servers.add(server);

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      runMode: "dry-run",
      service: "call-n-response",
      status: "ok",
    });
  });
});
