import crypto from "crypto";

/**
 * Verify HMAC-SHA256 webhook signatures (Make/n8n compatible pattern).
 * Set WEBHOOK_SECRET in env; callers send `x-webhook-signature: sha256=<hex>`.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const provided = signatureHeader.replace(/^sha256=/i, "").trim();

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
