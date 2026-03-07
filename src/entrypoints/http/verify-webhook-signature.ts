import { Webhooks } from "@octokit/webhooks";

export async function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  if (signature.length === 0) {
    return false;
  }

  try {
    const webhooks = new Webhooks({ secret });

    return await webhooks.verify(payload, signature);
  } catch {
    return false;
  }
}
