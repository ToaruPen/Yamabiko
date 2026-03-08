import { afterEach, describe, expect, it } from "vitest";
import {
  issueCommentPayload,
  pullRequestReviewCommentPayload,
} from "../../../fixtures/webhooks/index.js";
import {
  createTestServer,
  TEST_WEBHOOK_SECRET,
} from "../../../helpers/create-test-server.js";
import { signPayload } from "../../../helpers/sign-payload.js";

describe("webhook route", () => {
  const servers = new Set<ReturnType<typeof createTestServer>["server"]>();

  afterEach(async () => {
    await Promise.all(
      [...servers].map(async (server) => {
        await server.close();
      }),
    );
    servers.clear();
  });

  function createServer(): ReturnType<typeof createTestServer>["server"] {
    const { server } = createTestServer();
    servers.add(server);
    return server;
  }

  it("returns 400 when X-GitHub-Delivery header is missing", async () => {
    const server = createServer();
    const payload = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await server.inject({
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request_review_comment",
        "x-hub-signature-256": signPayload(TEST_WEBHOOK_SECRET, payload),
      },
      method: "POST",
      payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Missing X-GitHub-Delivery header",
      status: "error",
    });
  });

  it("returns 400 when X-GitHub-Event header is missing", async () => {
    const server = createServer();
    const payload = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await server.inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-123",
        "x-hub-signature-256": signPayload(TEST_WEBHOOK_SECRET, payload),
      },
      method: "POST",
      payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Missing X-GitHub-Event header",
      status: "error",
    });
  });

  it("returns 400 when signature header is missing", async () => {
    const server = createServer();
    const payload = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await server.inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-123",
        "x-github-event": "pull_request_review_comment",
      },
      method: "POST",
      payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Missing X-Hub-Signature-256 header",
      status: "error",
    });
  });

  it("returns 401 for invalid signature", async () => {
    const server = createServer();
    const payload = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await server.inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-123",
        "x-github-event": "pull_request_review_comment",
        "x-hub-signature-256": "sha256=deadbeef",
      },
      method: "POST",
      payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      message: "Invalid signature",
      status: "error",
    });
  });

  it("returns 204 when webhook event is unsupported", async () => {
    const server = createServer();
    const payload = JSON.stringify(issueCommentPayload);

    const response = await server.inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-ignored",
        "x-github-event": "ping",
        "x-hub-signature-256": signPayload(TEST_WEBHOOK_SECRET, payload),
      },
      method: "POST",
      payload,
      url: "/webhook",
    });

    expect(response.statusCode).toBe(204);
  });

  it("returns 200 accepted for a valid webhook", async () => {
    const server = createServer();
    const payload = JSON.stringify(pullRequestReviewCommentPayload);

    const response = await server.inject({
      headers: {
        "content-type": "application/json",
        "x-github-delivery": "delivery-valid",
        "x-github-event": "pull_request_review_comment",
        "x-hub-signature-256": signPayload(TEST_WEBHOOK_SECRET, payload),
      },
      method: "POST",
      payload,
      url: "/webhook",
    });

    const responseBody = response.json<{
      actionability: string;
      enqueued: boolean;
      runId: string | null;
      status: string;
    }>();

    expect(response.statusCode).toBe(200);
    expect(responseBody.status).toBe("accepted");
    expect(responseBody.actionability).toBe("suggest");
    expect(responseBody.enqueued).toBe(true);
    expect(responseBody.runId).not.toBeNull();
    expect(typeof responseBody.runId).toBe("string");
  });

  it("returns 200 duplicate for already ingested delivery", async () => {
    const server = createServer();
    const payload = JSON.stringify(pullRequestReviewCommentPayload);

    const headers = {
      "content-type": "application/json",
      "x-github-delivery": "delivery-duplicate",
      "x-github-event": "pull_request_review_comment",
      "x-hub-signature-256": signPayload(TEST_WEBHOOK_SECRET, payload),
    };

    await server.inject({
      headers,
      method: "POST",
      payload,
      url: "/webhook",
    });

    const duplicateResponse = await server.inject({
      headers,
      method: "POST",
      payload,
      url: "/webhook",
    });

    expect(duplicateResponse.statusCode).toBe(200);
    expect(duplicateResponse.json()).toEqual({
      deliveryId: "delivery-duplicate",
      status: "duplicate",
    });
  });
});
