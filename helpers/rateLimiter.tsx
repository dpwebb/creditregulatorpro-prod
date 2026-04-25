/**
 * Database-backed rate limiter for backend endpoints.
 * Provides distributed rate limiting using the `rateLimitEntry` table.
 */
import { sql } from "kysely";
import { db } from "./db";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

/**
 * Checks if an action is allowed for a given identifier based on rate limits.
 *
 * @param identifier Unique ID for the user or IP address
 * @param action The type of action being performed (e.g., 'LOGIN', 'UPLOAD')
 * @param maxAttempts Maximum number of allowed attempts within the window
 * @param windowMinutes Time window in minutes
 */
export const checkRateLimit = async (
  identifier: string,
  action: string,
  maxAttempts: number,
  windowMinutes: number
): Promise<RateLimitResult> => {
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const resetAtDate = new Date(now.getTime() + windowMs);

  // 1) Probabilistic cleanup (~5% chance)
  if (Math.random() < 0.05) {
    await db
      .deleteFrom("rateLimitEntry")
      .where("resetAt", "<", now)
      .execute()
      .catch((err) => console.error("Rate limit cleanup failed:", err));
  }

  // 2) Atomic UPSERT
  const result = await sql<any>`
    INSERT INTO rate_limit_entry (identifier, action, count, reset_at)
    VALUES (${identifier}, ${action}, 1, ${resetAtDate})
    ON CONFLICT (identifier, action) DO UPDATE SET
      count = CASE WHEN rate_limit_entry.reset_at < NOW() THEN 1 ELSE rate_limit_entry.count + 1 END,
      reset_at = CASE WHEN rate_limit_entry.reset_at < NOW() THEN ${resetAtDate} ELSE rate_limit_entry.reset_at END
    RETURNING count, reset_at;
  `.execute(db);

  const row = result.rows[0];
  const currentCount = Number(row.count);
  const currentResetAt = new Date(row.resetAt || row.reset_at);

  const allowed = currentCount <= maxAttempts;
  const remaining = allowed ? maxAttempts - currentCount : 0;

  return {
    allowed,
    remaining,
    resetAt: currentResetAt,
  };
};

// Default configurations for common actions
export const RateLimitConfig = {
  LOGIN: { maxAttempts: 5, windowMinutes: 15 },
  UPLOAD: { maxAttempts: 10, windowMinutes: 60 },
  API_CALL: { maxAttempts: 100, windowMinutes: 15 },
  PACKET_BUILD: { maxAttempts: 20, windowMinutes: 60 },
  PACKET_CREATE: { maxAttempts: 20, windowMinutes: 60 },
  SEND_REGISTERED: { maxAttempts: 5, windowMinutes: 60 },
  SEND_FIRST_CLASS: { maxAttempts: 10, windowMinutes: 60 },
  PAYMENT_INTENT: { maxAttempts: 10, windowMinutes: 15 },
  AI_ANALYSIS: { maxAttempts: 10, windowMinutes: 60 },
  REGISTRATION: { maxAttempts: 5, windowMinutes: 15 },
  AI_GENERATE_NOTES: { maxAttempts: 10, windowMinutes: 60 },
  SCRAPING_DETECTION: { maxAttempts: 200, windowMinutes: 5 },
  ENDPOINT_BREADTH: { maxAttempts: 50, windowMinutes: 5 },
  ANONYMOUS_UPLOAD: { maxAttempts: 5, windowMinutes: 22 },
  REPORT_PARSE: { maxAttempts: 5, windowMinutes: 60 },
  GLOBAL: { maxAttempts: 500, windowMinutes: 15 },
};