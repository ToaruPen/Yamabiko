import { InMemoryDeliveryRepository } from "../../adapters/persistence/in-memory-delivery-repository.js";
import { InMemoryReviewRunRepository } from "../../adapters/persistence/in-memory-review-run-repository.js";
import { InMemoryReviewJobQueue } from "../../adapters/queue/in-memory-review-job-queue.js";
import { buildServer } from "./build-server.js";

const server = buildServer(process.env, {
  deliveryRepository: new InMemoryDeliveryRepository(),
  reviewJobQueue: new InMemoryReviewJobQueue(),
  reviewRunRepository: new InMemoryReviewRunRepository(),
});

try {
  await server.listen({
    host: server.config.host,
    port: server.config.port,
  });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
