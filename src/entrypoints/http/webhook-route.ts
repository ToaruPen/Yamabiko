import type { FastifyInstance, FastifyRequest } from "fastify";

import { createDefaultActionabilitySignal } from "../../application/signals/default-actionability-signal.js";
import { ingestReviewEvent } from "../../application/use-cases/ingest-review-event.js";
import { normalizeWebhookEvent } from "../../domain/review-events/normalize-webhook-event.js";
import { verifyWebhookSignature } from "./verify-webhook-signature.js";

interface HeaderValidationError {
  message: string;
  statusCode: 400 | 401;
}

interface WebhookHeaders {
  deliveryId: string;
  eventType: string;
  signature: string;
}

interface WebhookPayload {
  action?: string;
}

export async function webhookRoute(server: FastifyInstance): Promise<void> {
  server.post("/webhook", async (request, reply) => {
    const headers = parseWebhookHeaders(request.headers);
    if ("statusCode" in headers) {
      return reply.code(headers.statusCode).send({
        message: headers.message,
        status: "error",
      });
    }

    const rawBody = extractRawBody(request);
    if (rawBody === null) {
      return reply.code(500).send({
        message: "Raw body capture is not configured",
        status: "error",
      });
    }

    const isValidSignature = await verifyWebhookSignature(
      server.config.webhookSecret,
      rawBody,
      headers.signature,
    );
    if (!isValidSignature) {
      return reply.code(401).send({
        message: "Invalid signature",
        status: "error",
      });
    }

    const event = normalizeWebhookEvent(
      headers.eventType,
      extractAction(request),
      request.body,
    );

    if (event === null) {
      return reply.code(204).send();
    }

    const result = await ingestReviewEvent(
      {
        deliveryRepository: server.deps.deliveryRepository,
        reviewJobQueue: server.deps.reviewJobQueue,
        reviewRunRepository: server.deps.reviewRunRepository,
      },
      {
        deliveryId: headers.deliveryId,
        event,
        mode: server.config.runMode,
        signal: createDefaultActionabilitySignal(),
      },
    );

    if (result.duplicate) {
      return reply.code(200).send({
        deliveryId: headers.deliveryId,
        status: "duplicate",
      });
    }

    return reply.code(200).send({
      actionability: result.actionability,
      enqueued: result.enqueued,
      runId: result.runId,
      status: "accepted",
    });
  });
  await Promise.resolve();
}

function extractRawBody(request: FastifyRequest): string | null {
  return request.rawBody ?? null;
}

function extractAction(request: FastifyRequest): string {
  return (request.body as WebhookPayload).action ?? "";
}

function parseWebhookHeaders(
  headers: FastifyRequest["headers"],
): WebhookHeaders | HeaderValidationError {
  const deliveryId = readHeader(headers["x-github-delivery"]);
  if (deliveryId === null) {
    return {
      message: "Missing X-GitHub-Delivery header",
      statusCode: 400,
    };
  }

  const eventType = readHeader(headers["x-github-event"]);
  if (eventType === null) {
    return {
      message: "Missing X-GitHub-Event header",
      statusCode: 400,
    };
  }

  const signature = readHeader(headers["x-hub-signature-256"]);
  if (signature === null) {
    return {
      message: "Missing X-Hub-Signature-256 header",
      statusCode: 400,
    };
  }

  return {
    deliveryId,
    eventType,
    signature,
  };
}

function readHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}
