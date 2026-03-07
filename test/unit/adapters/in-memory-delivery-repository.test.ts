import { describe, expect, it } from "vitest";
import { InMemoryDeliveryRepository } from "../../../src/adapters/persistence/in-memory-delivery-repository.js";
import type { WebhookDelivery } from "../../../src/domain/deliveries/webhook-delivery.js";

describe("InMemoryDeliveryRepository", () => {
  const sampleDelivery: WebhookDelivery = {
    id: "delivery-123",
    eventType: "pull_request",
    action: "opened",
    receivedAt: "2026-03-07T00:00:00.000Z",
    processed: false,
  };

  it("save → findById returns same delivery", async () => {
    const repository = new InMemoryDeliveryRepository();

    await repository.save(sampleDelivery);

    const found = await repository.findById("delivery-123");
    expect(found).toEqual(sampleDelivery);
  });

  it("findById returns null for unknown id", async () => {
    const repository = new InMemoryDeliveryRepository();

    const found = await repository.findById("unknown-id");
    expect(found).toBeNull();
  });

  it("existsById returns true for saved delivery", async () => {
    const repository = new InMemoryDeliveryRepository();

    await repository.save(sampleDelivery);

    const exists = await repository.existsById("delivery-123");
    expect(exists).toBe(true);
  });

  it("existsById returns false for unknown id", async () => {
    const repository = new InMemoryDeliveryRepository();

    const exists = await repository.existsById("unknown-id");
    expect(exists).toBe(false);
  });
});
