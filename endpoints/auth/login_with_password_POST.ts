// adapt this to your database schema
import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { sql } from "kysely";
import { schema } from "./login_with_password_POST.schema";
import { compare } from "bcryptjs";
import { randomBytes } from "crypto";
import {
  setServerSession,
  SessionExpirationSeconds,
} from "../../helpers/getSetServerSession";
import { User } from "../../helpers/User";
import { logLogin, logLoginFailed } from "../../helpers/auditLogger";
import { assertOriginAllowed } from "../../helpers/assertOriginAllowed";
import { logger } from "../../helpers/logger";
import { reconcileEmailVerifiedFromVerifiedToken } from "../../helpers/emailVerificationState";

// Configuration constants
const RATE_LIMIT_CONFIG = {
  maxFailedAttempts: 5,
  lockoutWindowMinutes: 15,
  lockoutDurationMinutes: 15,
  cleanupProbability: 0.1,
} as const;

// Helper function to safely convert union type to Date
function safeToDate(
  value: string | number | bigint | Date | null | undefined
): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    // Convert bigint to number (assuming it's a timestamp in milliseconds)
    return new Date(Number(value));
  }

  return new Date(value);
}

export async function handle(request: Request) {
  try {
    await assertOriginAllowed(request);

    const json = await request.json();
    const { email, password } = schema.parse(json);

    // Normalize email to lowercase for consistent handling
    const normalizedEmail = email.toLowerCase();

    const now = new Date();
    const windowStart = new Date(
      now.getTime() - RATE_LIMIT_CONFIG.lockoutWindowMinutes * 60 * 1000
    );

    // Start transaction for atomic rate limiting and session creation
    const result = await db.transaction().execute(async (trx) => {
      // Use PostgreSQL advisory lock to serialize access per email
      // This prevents concurrent processing of the same email address
      // The lock is automatically released when the transaction ends
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail},0))`.execute(
        trx
      );

      // Get rate limiting info efficiently - use COUNT and MAX instead of SELECT *
      const rateLimitQuery = await trx
        .selectFrom("loginAttempts")
        .select([
          trx.fn.countAll<number>().as("failedCount"),
          trx.fn.max(trx.dynamic.ref("attemptedAt")).as("lastFailedAt"),
        ])
        .where("email", "=", normalizedEmail)
        .where("success", "=", false)
        .where("attemptedAt", ">=", windowStart)
        .where("attemptedAt", "is not", null) // Ensure null safety
        .executeTakeFirst();

      const { failedCount = 0, lastFailedAt = null } = rateLimitQuery || {};
      const safeLastFailedAt = safeToDate(lastFailedAt);

      // Check if user is locked out
      if (
        rateLimitQuery &&
        failedCount >= RATE_LIMIT_CONFIG.maxFailedAttempts &&
        safeLastFailedAt
      ) {
        const lockoutEnd = new Date(
          safeLastFailedAt.getTime() +
            RATE_LIMIT_CONFIG.lockoutDurationMinutes * 60 * 1000
        );

        if (now < lockoutEnd) {
          const remainingMinutes = Math.ceil(
            (lockoutEnd.getTime() - now.getTime()) / (60 * 1000)
          );
          // DO NOT log blocked attempts to prevent extending lockout indefinitely
          return {
            type: "rate_limited" as const,
            remainingMinutes,
          };
        }
      }

      // Find user by email (normalized), also LEFT JOIN subscriptions and userAccount
      const userResults = await trx
        .selectFrom("users")
        .innerJoin("userPasswords", "users.id", "userPasswords.userId")
        .leftJoin("subscriptions", "subscriptions.userId", "users.id")
        .leftJoin("userAccount", "userAccount.userId", "users.id")
        .select([
          "users.id",
          "users.email",
          "users.displayName",
          "users.avatarUrl",
          "users.organizationId",
          "users.role",
          "users.emailVerified",
          "userPasswords.passwordHash",
          "subscriptions.plan as subscriptionPlan",
          "subscriptions.status as subscriptionStatus",
          "subscriptions.trialEnd as subscriptionTrialEnd",
          "userAccount.termsAcceptedAt as termsAcceptedAt",
          "userAccount.termsAcceptedVersion as termsAcceptedVersion",
        ])
        .where(sql`LOWER(users.email)`, "=", normalizedEmail)
        .limit(1)
        .execute();

      if (userResults.length === 0) {
        // Log failed attempt for non-existent user
        await trx
          .insertInto("loginAttempts")
          .values({
            email: normalizedEmail,
            attemptedAt: now,
            success: false,
          })
          .execute();

        return {
          type: "auth_failed" as const,
          reason: "User not found",
        };
      }

      const user = userResults[0];

      // Verify password
      const passwordValid = await compare(password, user.passwordHash);
      if (!passwordValid) {
        // Log failed attempt for invalid password
        await trx
          .insertInto("loginAttempts")
          .values({
            email: normalizedEmail,
            attemptedAt: now,
            success: false,
          })
          .execute();

        return {
          type: "auth_failed" as const,
          reason: "Invalid password",
        };
      }

      // Password is valid - log successful attempt
      await trx
        .insertInto("loginAttempts")
        .values({
          email: normalizedEmail,
          attemptedAt: now,
          success: true,
        })
        .execute();

      // Create session inside the same transaction to ensure atomicity
      const sessionId = randomBytes(32).toString("hex");
      const expiresAt = new Date(
        now.getTime() + SessionExpirationSeconds * 1000
      );

      await trx
        .insertInto("sessions")
        .values({
          id: sessionId,
          userId: user.id,
          createdAt: now,
          lastAccessed: now,
          expiresAt: expiresAt,
        })
        .execute();

      // Reset failed attempts counter by deleting previous failed attempts
      // This preserves audit trail of successful logins
      await trx
        .deleteFrom("loginAttempts")
        .where("email", "=", normalizedEmail)
        .where("success", "=", false)
        .execute();

      // Backfill userAccount row if missing
      const existingUserAccount = await trx
        .selectFrom("userAccount")
        .select(["id"])
        .where("userId", "=", user.id)
        .limit(1)
        .executeTakeFirst();

      if (!existingUserAccount) {
        logger.info("Backfilling userAccount for password login", { userId: user.id });
        await trx
          .insertInto("userAccount")
          .values({
            userId: user.id,
            email: normalizedEmail,
            fullName: user.displayName,
            termsAcceptedAt: null,
          })
          .execute();
      }

      return {
        type: "success" as const,
        user,
        sessionId,
        sessionCreatedAt: now,
      };
    });

    // Clean up old login attempts periodically
    // Run cleanup outside transaction to prevent extending transaction time and potential deadlocks
    if (Math.random() < RATE_LIMIT_CONFIG.cleanupProbability) {
      const cleanupBefore = new Date(
        now.getTime() - RATE_LIMIT_CONFIG.lockoutWindowMinutes * 60 * 1000
      );
      try {
        await db
          .deleteFrom("loginAttempts")
          .where("attemptedAt", "<", cleanupBefore)
          .where("attemptedAt", "is not", null)
          .executeTakeFirst();
      } catch {
        // Don't fail the login if cleanup fails
      }
    }

    // Handle different transaction results
    if (result.type === "rate_limited") {
      await logLoginFailed(
        normalizedEmail,
        request,
        "Account locked due to too many failed attempts"
      );
      const rateLimitMessage = `Too many failed login attempts. Account locked for ${result.remainingMinutes} more minutes.`;
      return Response.json(
        { error: rateLimitMessage, message: rateLimitMessage },
        { status: 429 }
      );
    }

    if (result.type === "auth_failed") {
      await logLoginFailed(
        normalizedEmail,
        request,
        result.reason || "Invalid credentials"
      );
      return Response.json(
        { error: "Invalid email or password", message: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Success case - session was already created in transaction
    const user = result.user;
    const emailVerificationState = await reconcileEmailVerifiedFromVerifiedToken({
      userId: user.id,
      currentEmailVerified: user.emailVerified,
      source: "password_login",
      request,
    });

    // Fetch current terms version from system_settings
    const termsVersionSetting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", "terms_version")
      .executeTakeFirst();
    const currentTermsVersion = termsVersionSetting?.value ?? null;

    // Log successful login
    await logLogin(user.id, request);

    // Create response with user data (excluding sensitive information)
    const isAdminOrSupport = user.role === "admin" || user.role === "support";
    const userData: User = {
      id: user.id,
      email: user.email,
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      emailVerified: emailVerificationState.emailVerified,
      organizationId: user.organizationId,
      role: user.role,
      subscriptionPlan: user.subscriptionPlan ?? null,
      subscriptionStatus: user.subscriptionStatus ?? null,
      trialEnd: user.subscriptionTrialEnd instanceof Date
        ? user.subscriptionTrialEnd.toISOString()
        : (user.subscriptionTrialEnd ?? null),
      termsAcceptedAt: isAdminOrSupport
        ? new Date(0).toISOString()
        : (user.termsAcceptedAt instanceof Date
            ? user.termsAcceptedAt.toISOString()
            : (user.termsAcceptedAt ?? null)),
      termsAcceptedVersion: isAdminOrSupport
        ? currentTermsVersion
        : ((user.termsAcceptedVersion as string | null) ?? null),
      currentTermsVersion,
    };

    const response = Response.json({
      user: userData,
    });

    // Set session cookie
    await setServerSession(response, {
      id: result.sessionId,
      createdAt: result.sessionCreatedAt.getTime(),
      lastAccessed: result.sessionCreatedAt.getTime(),
    });

    return response;
  } catch (error) {
    return handleEndpointError(error);
  }
}
