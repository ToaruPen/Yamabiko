import Fastify, { type FastifyInstance } from "fastify";

import type { DeliveryRepository } from "../../application/ports/delivery-repository.js";
import type { ReviewJobQueue } from "../../application/ports/review-job-queue.js";
import type { ReviewRunRepository } from "../../application/ports/review-run-repository.js";
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
  interface FastifyRequest {
    rawBody?: string;
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
      req.rawBody = body as string;
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
