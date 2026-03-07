import { InMemoryDeliveryRepository } from "../../adapters/persistence/in-memory-delivery-repository.js";
import { InMemoryReviewRunRepository } from "../../adapters/persistence/in-memory-review-run-repository.js";
import { InMemoryReviewJobQueue } from "../../adapters/queue/in-memory-review-job-queue.js";
import { buildServer } from "./build-server.js";

const server = buildServer(process.env, {
  deliveryRepository: new InMemoryDeliveryRepository(),
  reviewJobQueue: new InMemoryReviewJobQueue(),
  reviewRunRepository: new InMemoryReviewRunRepository(),
});
const runtimeEnv = process.env;
const host = runtimeEnv.HOST ?? "127.0.0.1";
const port = Number(runtimeEnv.PORT ?? "3000");

try {
  await server.listen({
    host,
    port,
  });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
