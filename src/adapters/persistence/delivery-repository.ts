import type { WebhookDelivery } from "../../domain/deliveries/webhook-delivery.js";

export interface DeliveryRepository {
  save(delivery: WebhookDelivery): Promise<void>;
  findById(id: string): Promise<WebhookDelivery | null>;
  existsById(id: string): Promise<boolean>;
}
