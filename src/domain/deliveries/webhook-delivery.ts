export interface WebhookDelivery {
  id: string;
  eventType: string;
  action: string;
  receivedAt: string;
  processed: boolean;
}
