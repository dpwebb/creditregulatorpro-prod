import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema } from "./register_with_password_POST.schema";
import { randomBytes, randomUUID } from "crypto";
import {
  setServerSession,
  SessionExpirationSeconds,
} from "../../helpers/getSetServerSession";
import { generatePasswordHash } from "../../helpers/generatePasswordHash";
import { sendGridEmail } from "../../helpers/sendGridEmail";
import { checkRateLimit, RateLimitConfig } from "../../helpers/rateLimiter";
import { getSubscriptionDefaults } from "../../helpers/getSubscriptionDefaults";
import { validateOrigin } from "../../helpers/domainGuard";
import { OriginNotAllowedError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const guardResult = await validateOrigin(request);
    if (!guardResult.valid && guardResult.mode === "enforce") {
      throw new OriginNotAllowedError();
    }

    const json = await request.json();
    const { email, password, displayName, legalNameSignature, tempArtifactId, claimToken } = schema.parse(json);

    // Rate limit by email to prevent registration spam
    const rateLimitResult = await checkRateLimit(
      email,
      "REGISTRATION",
      RateLimitConfig.REGISTRATION.maxAttempts,
      RateLimitConfig.REGISTRATION.windowMinutes
    );
    if (!rateLimitResult.allowed) {
      return Response.json(
        { error: "Too many requests. Please try again later.", resetAt: rateLimitResult.resetAt },
        { status: 429 }
      );
    }

    // Support accounts can only be created by admins via admin/create-support-agent_POST.
    // The schema does not expose a role field, but as a defensive measure we reject any
    // attempt to pass role="support" (or any elevated role) in the raw request body.
    if (
      json !== null &&
      typeof json === "object" &&
      "role" in json &&
      (json as Record<string, unknown>)["role"] !== "user"
    ) {
      return Response.json(
        { error: "Invalid registration request", message: "Elevated roles cannot be assigned during self-registration" },
        { status: 403 }
      );
    }

    // Check if email already exists
    const existingUser = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", email)
      .limit(1)
      .execute();

    if (existingUser.length > 0) {
      return Response.json(
        { error: "email already in use", message: "email already in use" },
        { status: 409 }
      );
    }

    const passwordHash = await generatePasswordHash(password);
    const now = new Date();

    // Fetch current terms version from system_settings
    const termsVersionSetting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", "terms_version")
      .executeTakeFirst();
    const currentTermsVersion = termsVersionSetting?.value ?? null;

    // Determine subscription parameters based on production_mode system setting
    const { plan: subscriptionPlan, status: subscriptionStatus, trialStart, trialEnd } =
      await getSubscriptionDefaults(now);
    console.log(`Registration: subscriptionPlan=${subscriptionPlan}, subscriptionStatus=${subscriptionStatus}, trialEnd=${trialEnd.toISOString()}`);

    // Create new user
    const newUser = await db.transaction().execute(async (trx) => {
      // Insert the user
      const [user] = await trx
        .insertInto("users")
        .values({
          email,
          displayName,
          role: "user", // Default role
          organizationId: null, // Default for individual users
        })
        .returning(["id", "email", "displayName", "organizationId", "emailVerified", "createdAt"])
        .execute();

      // Store the password hash in another table
      await trx
        .insertInto("userPasswords")
        .values({
          userId: user.id,
          passwordHash,
        })
        .execute();

      await trx
        .insertInto("subscriptions")
        .values({
          userId: user.id,
          plan: subscriptionPlan,
          status: subscriptionStatus,
          trialStart,
          trialEnd,
        })
        .execute();

      // Check if a userAccount already exists for this user (by userId or email)
      const existingUserAccount = await trx
        .selectFrom("userAccount")
        .select("id")
        .where((eb) =>
          eb.or([
            eb("userId", "=", user.id),
            eb("email", "=", email),
          ])
        )
        .limit(1)
        .execute();

      if (existingUserAccount.length > 0) {
        // Update existing userAccount record
        await trx
          .updateTable("userAccount")
          .set({
            userId: user.id,
            fullName: legalNameSignature,
            legalNameSignature,
            termsAcceptedAt: now,
            termsAcceptedVersion: currentTermsVersion,
          })
          .where("id", "=", existingUserAccount[0].id)
          .execute();
      } else {
        // Insert new userAccount record
        await trx
          .insertInto("userAccount")
          .values({
            userId: user.id,
            email,
            fullName: legalNameSignature,
            legalNameSignature,
            termsAcceptedAt: now,
            termsAcceptedVersion: currentTermsVersion,
          })
          .execute();
      }

      return user;
    });

    // Create a new session
    const sessionId = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + SessionExpirationSeconds * 1000);

    await db
      .insertInto("sessions")
      .values({
        id: sessionId,
        userId: newUser.id,
        createdAt: now,
        lastAccessed: now,
        expiresAt,
      })
      .execute();

    // Attempt to claim anonymous artifact if tempArtifactId and claimToken are provided
    let claimedArtifactId: number | undefined;
    if (tempArtifactId !== undefined && claimToken !== undefined) {
      try {
        const artifact = await db
          .selectFrom("reportArtifact")
          .select(["id", "data", "userId"])
          .where("id", "=", tempArtifactId)
          .limit(1)
          .executeTakeFirst();

        if (!artifact) {
          console.warn(`Claim-after-signup: artifact ${tempArtifactId} not found`);
        } else if (artifact.userId !== null) {
          console.warn(`Claim-after-signup: artifact ${tempArtifactId} already claimed by user ${artifact.userId}`);
        } else {
          const data = artifact.data as Record<string, unknown> | null;
          const tokenMatches = data?.claimToken === claimToken;
          const isAnonymous = data?.isAnonymous === true;

          if (!tokenMatches || !isAnonymous) {
            console.warn(
              `Claim-after-signup: artifact ${tempArtifactId} failed validation — tokenMatches=${tokenMatches}, isAnonymous=${isAnonymous}`
            );
          } else {
            // Remove isAnonymous and claimToken from data, assign userId
            const { isAnonymous: _removed, claimToken: _removedToken, ...cleanedData } = data;
            await db
              .updateTable("reportArtifact")
              .set({
                userId: newUser.id,
                data: JSON.parse(JSON.stringify(cleanedData)),
              })
              .where("id", "=", tempArtifactId)
              .execute();

            claimedArtifactId = tempArtifactId;
            console.log(`Claim-after-signup: artifact ${tempArtifactId} claimed by new user ${newUser.id}`);
          }
        }
      } catch (claimError) {
        // Do not fail registration if claim fails
        console.error(
          "Claim-after-signup error:",
          claimError instanceof Error ? claimError.message : claimError
        );
      }
    }

    // Create response with user data
    const response = Response.json({
      user: {
        ...newUser,
        role: "user" as const,
        emailVerified: false,
        avatarUrl: null,
        subscriptionPlan,
        subscriptionStatus,
        trialEnd: trialEnd.toISOString(),
        termsAcceptedAt: now.toISOString(),
        termsAcceptedVersion: currentTermsVersion,
        currentTermsVersion,
      },
      ...(claimedArtifactId !== undefined ? { claimedArtifactId } : {}),
    });

    // Set session cookie
    await setServerSession(response, {
      id: sessionId,
      createdAt: now.getTime(),
      lastAccessed: now.getTime(),
    });

    // Automatically send verification email after registration (best-effort, do not fail registration)
    try {
      const verificationToken =
        randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      const verificationExpiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ); // 24 hours

      await db
        .insertInto("emailVerificationTokens")
        .values({
          userId: newUser.id,
          token: verificationToken,
          expiresAt: verificationExpiresAt,
          verified: false,
        })
        .execute();

      const verifyUrl = `https://www.creditregulatorpro.com/verify-email?token=${verificationToken}`;

      const emailHtml = `
        <h1>Verify your email</h1>
        <p>Welcome to Credit Regulator Pro! Please click the link below to verify your email address:</p>
        <a href="${verifyUrl}">${verifyUrl}</a>
      `;

      const emailResult = await sendGridEmail({
        to: newUser.email,
        subject: "Verify your email for Credit Regulator Pro",
        html: emailHtml,
      });

      if (!emailResult.success) {
        console.error(
          "Failed to send post-registration verification email:",
          emailResult.error
        );
      } else {
        console.log(
          `Post-registration verification email sent to ${newUser.email}`
        );
      }
    } catch (emailError) {
      console.error(
        "Error sending post-registration verification email:",
        emailError instanceof Error ? emailError.message : emailError
      );
    }

    return response;
  } catch (error: unknown) {
    console.error("Registration error:", error);
    return handleEndpointError(error);
  }
}