import type { WebhookDelivery } from "../../domain/deliveries/webhook-delivery.js";
import type { DeliveryRepository } from "./delivery-repository.js";

export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly deliveries = new Map<string, WebhookDelivery>();

  public save(delivery: WebhookDelivery): Promise<void> {
    this.deliveries.set(delivery.id, delivery);
    return Promise.resolve();
  }

  public findById(id: string): Promise<WebhookDelivery | null> {
    return Promise.resolve(this.deliveries.get(id) ?? null);
  }

  public existsById(id: string): Promise<boolean> {
    return Promise.resolve(this.deliveries.has(id));
  }
}
