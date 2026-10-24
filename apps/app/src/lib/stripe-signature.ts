import { createHmac, timingSafeEqual } from "node:crypto";

function parseStripeSignature(header: string | null) {
  if (!header) return null;
  const signatures: string[] = [];
  let timestamp: string | null = null;

  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value ?? null;
    if (key === "v1" && value) signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string, now = Date.now()) {
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) return false;

  const timestamp = Number(parsed.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 60 * 5) return false;

  const expected = createHmac("sha256", secret).update(`${parsed.timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return parsed.signatures.some((signature) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    const actualBuffer = Buffer.from(signature, "hex");
    return timingSafeEqual(actualBuffer, expectedBuffer);
  });
}
