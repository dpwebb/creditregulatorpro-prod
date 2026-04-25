import { createHmac } from "crypto";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

/**
 * Derives a cron authentication token using HMAC-SHA256.
 * @param label A unique string label identifying the cron job.
 * @returns A hex-encoded HMAC-SHA256 token.
 */
export function deriveCronSecret(label: string): string {
  return createHmac("sha256", process.env.JWT_SECRET!)
    .update(label)
    .digest("hex");
}