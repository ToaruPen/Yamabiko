import Fastify, { type FastifyInstance } from "fastify";

import type { DeliveryRepository } from "../../adapters/persistence/delivery-repository.js";
import type { ReviewRunRepository } from "../../adapters/persistence/review-run-repository.js";
import type { ReviewJobQueue } from "../../adapters/queue/review-job-queue.js";
import { loadRuntimeConfig } from "../../config/env.js";
import { webhookRoute } from "./webhook-route.js";

export interface ServerDependencies {
  deliveryRepository: DeliveryRepository;
  reviewJobQueue: ReviewJobQueue;
  reviewRunRepository: ReviewRunRepository;
}

declare module "fastify" {
  interface FastifyInstance {
    config: ReturnType<typeof loadRuntimeConfig>;
    deps: ServerDependencies;
  }
}

export function buildServer(
  env: NodeJS.ProcessEnv = process.env,
  deps: ServerDependencies,
): FastifyInstance {
  const config = loadRuntimeConfig(env);
  const server = Fastify({
    logger: false,
  });

  server.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      // Store raw body on request for HMAC verification
      (req as unknown as { rawBody: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  server.decorate("config", config);
  server.decorate("deps", deps);

  server.get("/health", () => ({
    runMode: config.runMode,
    service: "call-n-response",
    status: "ok",
  }));

  server.register(webhookRoute);

  return server;
}
