import { describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "../../../../src/entrypoints/http/verify-webhook-signature.js";
import { signPayload } from "../../../helpers/sign-payload.js";

describe("verifyWebhookSignature", () => {
  it("returns true for a valid signature", async () => {
    const secret = "test-webhook-secret";
    const payload = JSON.stringify({ action: "opened", number: 1 });
    const signature = signPayload(secret, payload);

    await expect(
      verifyWebhookSignature(secret, payload, signature),
    ).resolves.toBe(true);
  });

  it("returns false for an invalid signature", async () => {
    const secret = "test-webhook-secret";
    const payload = JSON.stringify({ action: "opened", number: 1 });

    await expect(
      verifyWebhookSignature(secret, payload, "sha256=deadbeef"),
    ).resolves.toBe(false);
  });

  it("returns false for an empty signature", async () => {
    const secret = "test-webhook-secret";
    const payload = JSON.stringify({ action: "opened", number: 1 });

    await expect(verifyWebhookSignature(secret, payload, "")).resolves.toBe(
      false,
    );
  });

  it("returns false when signature is generated with a different secret", async () => {
    const payload = JSON.stringify({ action: "opened", number: 1 });
    const signature = signPayload("different-secret", payload);

    await expect(
      verifyWebhookSignature("test-webhook-secret", payload, signature),
    ).resolves.toBe(false);
  });
});
