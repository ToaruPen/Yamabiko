import { afterEach, describe, expect, it, vi } from "vitest";

import { InMemoryDeliveryRepository } from "../../../../src/adapters/persistence/in-memory-delivery-repository.js";
import { InMemoryReviewRunRepository } from "../../../../src/adapters/persistence/in-memory-review-run-repository.js";
import { InMemoryReviewJobQueue } from "../../../../src/adapters/queue/in-memory-review-job-queue.js";
import { buildServer } from "../../../../src/entrypoints/http/build-server.js";
import {
  issueCommentPayload,
  pullRequestReviewCommentPayload,
  pullRequestReviewPayload,
} from "../../../fixtures/webhooks/index.js";
import { signPayload } from "../../../helpers/sign-payload.js";

const WEBHOOK_SECRET = "integration-test-secret";

const ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/call_n_response",
  HOST: "127.0.0.1",
  PORT: "3000",
  RUN_MODE: "dry-run",
  WEBHOOK_SECRET,
} as const;

interface AcceptedResponseBody {
  actionability: "suggest" | "ignore" | "apply";
  enqueued: boolean;
  runId: string | null;
  status: "accepted";
}

describe("webhook intake integration", () => {
  let deliveryRepository: InMemoryDeliveryRepository;
  let reviewRunRepository: InMemoryReviewRunRepository;
  let reviewJobQueue: InMemoryReviewJobQueue;
  let server: ReturnType<typeof buildServer> | null = null;

  function createServer(): void {
    deliveryRepository = new InMemoryDeliveryRepository();
    reviewRunRepository = new InMemoryReviewRunRepository();
    reviewJobQueue = new InMemoryReviewJobQueue();
    server = buildServer(ENV, {
      deliveryRepository,
      reviewJobQueue,
      reviewRunRepository,
    });
  }

  function createSignedWebhookRequest(
    payload: unknown,
    deliveryId: string,
    eventType: string,
  ): {
    headers: Record<string, string>;
    payload: string;
  } {
    const body = JSON.stringify(payload);
    return {
      headers: {
        "content-type": "application/json",
        "x-github-delivery": deliveryId,
        "x-github-event": eventType,
        "x-hub-signature-256": signPayload(WEBHOOK_SECRET, body),
      },
      payload: body,
    };
  }

  function getServer(): ReturnType<typeof buildServer> {
    if (server === null) {
      throw new Error("Server is not initialized");
    }

    return server;
  }

  afterEach(async () => {
    if (server !== null) {
      await server.close();
      server = null;
    }
  });

  it("accepts pull_request_review and persists delivery/run then enqueues job", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");

    const request = createSignedWebhookRequest(
      pullRequestReviewPayload,
      "delivery-pr-review",
      "pull_request_review",
    );
    const response = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json<AcceptedResponseBody>();
    expect(responseBody).toMatchObject({
      actionability: "suggest",
      enqueued: true,
      status: "accepted",
    });
    expect(responseBody.runId).not.toBeNull();

    if (responseBody.runId === null) {
      throw new Error(
        "runId should not be null for accepted pull_request_review",
      );
    }

    const delivery = await deliveryRepository.findById("delivery-pr-review");
    expect(delivery).not.toBeNull();
    expect(delivery).toMatchObject({
      action: "submitted",
      eventType: "pull_request_review",
      id: "delivery-pr-review",
      processed: false,
    });

    expect(runSaveSpy).toHaveBeenCalledTimes(1);
    const savedRun = await reviewRunRepository.findById(responseBody.runId);
    expect(savedRun).not.toBeNull();
    expect(savedRun?.event.kind).toBe("pull_request_review");
    expect(savedRun?.event.headSha).toBe("abc123def456");

    const jobs = reviewJobQueue.snapshot();
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    if (job === undefined) {
      throw new Error("job should exist after actionable pull_request_review");
    }

    expect(job).toMatchObject({
      headSha: "abc123def456",
      pullRequestNumber: 42,
      repositoryName: "call-n-response",
      repositoryOwner: "ToaruPen",
      runId: responseBody.runId,
    });
  });

  it("accepts issue_comment on PR, persists delivery/run, and does not enqueue when headSha is null", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");

    const request = createSignedWebhookRequest(
      issueCommentPayload,
      "delivery-issue-comment",
      "issue_comment",
    );
    const response = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json<AcceptedResponseBody>();
    expect(responseBody).toMatchObject({
      actionability: "suggest",
      enqueued: false,
      status: "accepted",
    });
    expect(responseBody.runId).not.toBeNull();

    if (responseBody.runId === null) {
      throw new Error("runId should not be null for accepted issue_comment");
    }

    const delivery = await deliveryRepository.findById(
      "delivery-issue-comment",
    );
    expect(delivery).not.toBeNull();
    expect(delivery).toMatchObject({
      action: "created",
      eventType: "issue_comment",
      id: "delivery-issue-comment",
      processed: false,
    });

    expect(runSaveSpy).toHaveBeenCalledTimes(1);
    const savedRun = await reviewRunRepository.findById(responseBody.runId);
    expect(savedRun).not.toBeNull();
    expect(savedRun?.event.kind).toBe("issue_comment");
    expect(savedRun?.event.headSha).toBeNull();

    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });

  it("accepts pull_request_review_comment and enqueues job", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");

    const request = createSignedWebhookRequest(
      pullRequestReviewCommentPayload,
      "delivery-pr-review-comment",
      "pull_request_review_comment",
    );
    const response = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(200);
    const responseBody = response.json<AcceptedResponseBody>();
    expect(responseBody).toMatchObject({
      actionability: "suggest",
      enqueued: true,
      status: "accepted",
    });
    expect(responseBody.runId).not.toBeNull();

    if (responseBody.runId === null) {
      throw new Error(
        "runId should not be null for accepted pull_request_review_comment",
      );
    }

    const delivery = await deliveryRepository.findById(
      "delivery-pr-review-comment",
    );
    expect(delivery).not.toBeNull();
    expect(delivery).toMatchObject({
      action: "created",
      eventType: "pull_request_review_comment",
      id: "delivery-pr-review-comment",
      processed: false,
    });

    expect(runSaveSpy).toHaveBeenCalledTimes(1);
    const savedRun = await reviewRunRepository.findById(responseBody.runId);
    expect(savedRun).not.toBeNull();
    expect(savedRun?.event.kind).toBe("pull_request_review_comment");

    const jobs = reviewJobQueue.snapshot();
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    if (job === undefined) {
      throw new Error("job should exist after pull_request_review_comment");
    }

    expect(job.runId).toBe(responseBody.runId);
  });

  it("rejects invalid signature and does not persist or enqueue", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");
    const request = createSignedWebhookRequest(
      pullRequestReviewCommentPayload,
      "delivery-invalid-signature",
      "pull_request_review_comment",
    );

    const response = await getServer().inject({
      headers: {
        ...request.headers,
        "x-hub-signature-256": "sha256=invalid",
      },
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      message: "Invalid signature",
      status: "error",
    });
    expect(
      await deliveryRepository.findById("delivery-invalid-signature"),
    ).toBeNull();
    expect(runSaveSpy).not.toHaveBeenCalled();
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });

  it("returns 400 when X-GitHub-Delivery is missing and keeps state unchanged", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");
    const body = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await getServer().inject({
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request_review_comment",
        "x-hub-signature-256": signPayload(WEBHOOK_SECRET, body),
      },
      method: "POST",
      payload: body,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Missing X-GitHub-Delivery header",
      status: "error",
    });
    expect(
      await deliveryRepository.findById("delivery-missing-header"),
    ).toBeNull();
    expect(runSaveSpy).not.toHaveBeenCalled();
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });

  it("returns 400 when X-GitHub-Event is missing and keeps state unchanged", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");
    const body = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await getServer().inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-missing-event",
        "x-hub-signature-256": signPayload(WEBHOOK_SECRET, body),
      },
      method: "POST",
      payload: body,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Missing X-GitHub-Event header",
      status: "error",
    });
    expect(
      await deliveryRepository.findById("delivery-missing-event"),
    ).toBeNull();
    expect(runSaveSpy).not.toHaveBeenCalled();
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });

  it("ignores unsupported event type and keeps repositories/queue untouched", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");
    const request = createSignedWebhookRequest(
      issueCommentPayload,
      "delivery-unsupported-event",
      "push",
    );

    const response = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(204);
    expect(
      await deliveryRepository.findById("delivery-unsupported-event"),
    ).toBeNull();
    expect(runSaveSpy).not.toHaveBeenCalled();
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });

  it("returns duplicate on second delivery and avoids double enqueue", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");
    const request = createSignedWebhookRequest(
      pullRequestReviewCommentPayload,
      "delivery-duplicate",
      "pull_request_review_comment",
    );

    const firstResponse = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });
    const secondResponse = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(firstResponse.statusCode).toBe(200);
    const firstBody = firstResponse.json<AcceptedResponseBody>();
    expect(firstBody.status).toBe("accepted");
    expect(firstBody.enqueued).toBe(true);

    if (firstBody.runId === null) {
      throw new Error("first runId should not be null for duplicate test");
    }

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toEqual({
      deliveryId: "delivery-duplicate",
      status: "duplicate",
    });

    expect(
      await deliveryRepository.findById("delivery-duplicate"),
    ).not.toBeNull();
    expect(await reviewRunRepository.findById(firstBody.runId)).not.toBeNull();
    expect(runSaveSpy).toHaveBeenCalledTimes(1);
    const jobs = reviewJobQueue.snapshot();
    expect(jobs).toHaveLength(1);

    const [job] = jobs;
    if (job === undefined) {
      throw new Error("exactly one job should exist for duplicate test");
    }

    expect(job.runId).toBe(firstBody.runId);
  });

  it("ignores unsupported action and keeps repositories/queue untouched", async () => {
    createServer();
    const runSaveSpy = vi.spyOn(reviewRunRepository, "save");
    const payload = {
      ...issueCommentPayload,
      action: "deleted",
    };
    const request = createSignedWebhookRequest(
      payload,
      "delivery-unsupported-action",
      "issue_comment",
    );

    const response = await getServer().inject({
      headers: request.headers,
      method: "POST",
      payload: request.payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(204);
    expect(
      await deliveryRepository.findById("delivery-unsupported-action"),
    ).toBeNull();
    expect(runSaveSpy).not.toHaveBeenCalled();
    expect(reviewJobQueue.snapshot()).toHaveLength(0);
  });
});
