import { db } from "./db";
import { User } from "./User";
import { SubscriptionPlan, SubscriptionStatus } from "./schema";

import {
  CleanupProbability,
  getServerSessionOrThrow,
  NotAuthenticatedError,
  SessionExpirationSeconds,
} from "./getSetServerSession";
import { shouldTouchSessionLastAccessed } from "./runtimeTuningConfig";

function coerceLastAccessedDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") {
    return new Date(value);
  }
  return new Date(0);
}

export async function getServerUserSession(request: Request) {
  const session = await getServerSessionOrThrow(request);
  const now = new Date();

  // Query the sessions and users tables in a single join query, also LEFT JOIN subscriptions and userAccount
  const results = await db
    .selectFrom("sessions")
    .innerJoin("users", "sessions.userId", "users.id")
    .leftJoin("subscriptions", "subscriptions.userId", "users.id")
    .leftJoin("userAccount", "userAccount.userId", "users.id")
    .select([
      "sessions.id as sessionId",
      "sessions.createdAt as sessionCreatedAt",
      "sessions.lastAccessed as sessionLastAccessed",
      "users.id",
      "users.email",
      "users.displayName",
      "users.organizationId",
      "users.role",
      "users.avatarUrl",
      "users.emailVerified",
      "subscriptions.plan as subscriptionPlan",
      "subscriptions.status as subscriptionStatus",
      "subscriptions.trialEnd as subscriptionTrialEnd",
      "userAccount.termsAcceptedAt as termsAcceptedAt",
      "userAccount.termsAcceptedVersion as termsAcceptedVersion",
    ])
    .where("sessions.id", "=", session.id)
    .limit(1)
    .execute();

  if (results.length === 0) {
    throw new NotAuthenticatedError();
  }

  // Fetch current terms version from system_settings
  const termsVersionSetting = await db
    .selectFrom("systemSettings")
    .select("value")
    .where("key", "=", "terms_version")
    .executeTakeFirst();

  const currentTermsVersion = termsVersionSetting?.value ?? null;

  const result = results[0];
  const isAdminOrSupport = result.role === "admin" || result.role === "support";

  const termsAcceptedAt = isAdminOrSupport
    ? new Date(0).toISOString()
    : (result.termsAcceptedAt instanceof Date
        ? result.termsAcceptedAt.toISOString()
        : (result.termsAcceptedAt ?? null));

  // For admin/support, treat their accepted version as the current version so they auto-pass version checks
  const termsAcceptedVersion = isAdminOrSupport
    ? currentTermsVersion
    : ((result.termsAcceptedVersion as string | null) ?? null);

  const user = {
    id: result.id,
    email: result.email,
    displayName: result.displayName,
    avatarUrl: result.avatarUrl,
    organizationId: result.organizationId,
    emailVerified: result.emailVerified ?? false,
    role: result.role,
    subscriptionPlan: isAdminOrSupport ? null : ((result.subscriptionPlan as SubscriptionPlan | null) ?? null),
    subscriptionStatus: isAdminOrSupport ? null : ((result.subscriptionStatus as SubscriptionStatus | null) ?? null),
    trialEnd: isAdminOrSupport ? null : (result.subscriptionTrialEnd instanceof Date
      ? result.subscriptionTrialEnd.toISOString()
      : (result.subscriptionTrialEnd ?? null)),
    termsAcceptedAt,
    termsAcceptedVersion,
    currentTermsVersion,
  };

  const dbLastAccessed = coerceLastAccessedDate(result.sessionLastAccessed);
  const shouldTouchSession = shouldTouchSessionLastAccessed(dbLastAccessed, now);
  const returnedLastAccessed = shouldTouchSession ? now : dbLastAccessed;

  if (shouldTouchSession) {
    await db
      .updateTable("sessions")
      .set({ lastAccessed: now })
      .where("id", "=", session.id)
      .execute();
  }

  // Occasionally clean up expired sessions (fire-and-forget)
  if (Math.random() < CleanupProbability) {
    const expirationDate = new Date(
      Date.now() - SessionExpirationSeconds * 1000
    );
    db.deleteFrom("sessions")
      .where("lastAccessed", "<", expirationDate)
      .execute()
      .catch((cleanupError) => {
        // Log but don't fail the request if cleanup fails
        console.error("Session cleanup error:", cleanupError);
      });
  }

  return {
    user: user satisfies User,
    // make sure to update the session in cookie
    session: {
      ...session,
      lastAccessed: returnedLastAccessed,
    },
  };
}
