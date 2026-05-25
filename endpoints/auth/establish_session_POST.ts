import { db } from "../../helpers/db";
import { schema } from "./establish_session_POST.schema";
import { setServerSession } from "../../helpers/getSetServerSession";
import { User } from "../../helpers/User";
import { randomBytes } from "crypto";
import { reconcileEmailVerifiedFromVerifiedToken } from "../../helpers/emailVerificationState";

export async function handle(request: Request) {
  try {
    const json = await request.json();

    const { tempToken } = schema.parse(json);

    // We reuse the session table for temporary tokens, with a much shorter lifetime
    const tempSession = await db
      .selectFrom("sessions")
      .selectAll()
      .where("id", "=", tempToken)
      .limit(1)
      .executeTakeFirst();

    if (!tempSession) {
      return Response.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    // Check if session is expired
    const now = new Date();
    if (tempSession.expiresAt < now) {
      // Clean up expired session
      await db
        .deleteFrom("sessions")
        .where("id", "=", tempSession.id)
        .execute();

      return Response.json({ error: "Token has expired" }, { status: 400 });
    }

    // Fetch the user by userId from the session record, LEFT JOIN subscriptions and userAccount
    const user = await db
      .selectFrom("users")
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
        "subscriptions.plan as subscriptionPlan",
        "subscriptions.status as subscriptionStatus",
        "subscriptions.trialEnd as subscriptionTrialEnd",
        "userAccount.termsAcceptedAt as termsAcceptedAt",
        "userAccount.termsAcceptedVersion as termsAcceptedVersion",
      ])
      .where("users.id", "=", tempSession.userId)
      .executeTakeFirst();

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 400 });
    }

    const emailVerificationState = await reconcileEmailVerifiedFromVerifiedToken({
      userId: user.id,
      currentEmailVerified: user.emailVerified,
      source: "establish_session",
      request,
    });

    // Backfill userAccount row if missing
    const existingUserAccount = await db
      .selectFrom("userAccount")
      .select(["id"])
      .where("userId", "=", user.id)
      .limit(1)
      .executeTakeFirst();

    if (!existingUserAccount) {
      console.log("Backfilling userAccount for OAuth user:", user.id);
      await db
        .insertInto("userAccount")
        .values({
          userId: user.id,
          email: user.email,
          fullName: user.displayName,
          termsAcceptedAt: null,
        })
        .execute();
    }

    // Fetch current terms version from system_settings
    const termsVersionSetting = await db
      .selectFrom("systemSettings")
      .select("value")
      .where("key", "=", "terms_version")
      .executeTakeFirst();
    const currentTermsVersion = termsVersionSetting?.value ?? null;

    // Delete the temp session immediately to make it single-use
    await db.deleteFrom("sessions").where("id", "=", tempSession.id).execute();

    // Create a new proper session with a different session ID
    const newSessionId = randomBytes(32).toString("hex");
    const sessionCreatedAt = new Date();
    const sessionExpiresAt = new Date(
      sessionCreatedAt.getTime() + 7 * 24 * 60 * 60 * 1000
    ); // 7 days

    await db
      .insertInto("sessions")
      .values({
        id: newSessionId,
        userId: user.id,
        createdAt: sessionCreatedAt,
        lastAccessed: sessionCreatedAt,
        expiresAt: sessionExpiresAt,
      })
      .execute();

    // Build the full User object matching the User interface exactly,
    // following the same pattern as login_with_password_POST.ts
    const isAdminOrSupport = user.role === "admin" || user.role === "support";
    const userData: User = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
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
      success: true,
    });

    // Set the session cookie with the new session ID
    await setServerSession(response, {
      id: newSessionId,
      createdAt: sessionCreatedAt.getTime(),
      lastAccessed: sessionCreatedAt.getTime(),
    });

    return response;
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
