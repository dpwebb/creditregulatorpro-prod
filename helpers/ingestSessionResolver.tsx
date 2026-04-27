import { db } from "./db";
import { getServerUserSession } from "./getServerUserSession";
import { User } from "./User";

export interface ResolvedUserSession {
  user: User;
  isAuthenticatedUpload: boolean;
    userAccount: {
    id: number;
    email: string;
    region: string | null;
    fullName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    province: string | null;
    postalCode: string | null;
    phone: string | null;
    dateOfBirth: Date | null;
    [key: string]: any;
  };
}

/**
 * Resolves the user session for an ingest operation.
 * 
 * Flow:
 * 1. Try to get authenticated user session first
 * 2. If not authenticated, check if external userId was provided
 * 3. For external uploads, use UUID-based user identification (user-{uuid}@creditregulatorpro.com)
 * 4. Create or find corresponding user_account profile record
 * 
 * @param request - The incoming request (for session verification)
 * @param externalUserId - Optional external userId for unauthenticated uploads
 * @param region - Region for new user accounts
 * @returns Resolved user session with user, userAccount, and authentication status
 * @throws Error if neither authenticated session nor external userId is provided
 */
export async function resolveUserSession(
  request: Request,
  externalUserId: string | undefined,
  region: string
): Promise<ResolvedUserSession> {
  let user: User;
  let isAuthenticatedUpload = false;

  // Try to get authenticated user session first
  try {
            const sessionData = await getServerUserSession(request);
    user = { ...sessionData.user };
    isAuthenticatedUpload = true;
  } catch (sessionError) {
    // Not authenticated - check if userId was provided for external/unauthenticated flow
    if (!externalUserId) {
      throw new Error("Authentication required or userId must be provided for external uploads");
    }

    console.log(`[resolveUserSession] Unauthenticated upload with external userId: ${externalUserId}`);
    
    // External/unauthenticated flow - use UUID-based user identification
    const email = `user-${externalUserId}@creditregulatorpro.com`;
    const displayName = `User ${externalUserId}`;
    
    let existingUserRow = await db
      .selectFrom("users")
      .leftJoin("subscriptions", "subscriptions.userId", "users.id")
      .select([
        "users.id",
        "users.email",
        "users.displayName",
        "users.avatarUrl",
        "users.organizationId",
        "users.role",
        "subscriptions.plan as subscriptionPlan",
        "subscriptions.status as subscriptionStatus",
        "subscriptions.trialEnd as subscriptionTrialEnd",
      ])
      .where("users.email", "=", email)
      .executeTakeFirst();

    if (!existingUserRow) {
      console.log(`[resolveUserSession] Creating new user in users table for external userId: ${email}`);
      const newUser = await db
        .insertInto("users")
        .values({
          email: email,
          displayName: displayName,
          role: "user",
          emailVerified: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      existingUserRow = {
        ...newUser,
        subscriptionPlan: null,
        subscriptionStatus: null,
        subscriptionTrialEnd: null,
      };
    }

    user = {
      id: existingUserRow.id,
      email: existingUserRow.email,
      displayName: existingUserRow.displayName,
      avatarUrl: existingUserRow.avatarUrl,
      organizationId: existingUserRow.organizationId,
      emailVerified: false,
      role: existingUserRow.role,
      subscriptionPlan: (existingUserRow.subscriptionPlan as User["subscriptionPlan"]) ?? null,
      subscriptionStatus: (existingUserRow.subscriptionStatus as User["subscriptionStatus"]) ?? null,
            trialEnd: existingUserRow.subscriptionTrialEnd instanceof Date
        ? existingUserRow.subscriptionTrialEnd.toISOString()
        : (existingUserRow.subscriptionTrialEnd ?? null),
      termsAcceptedAt: null,
      termsAcceptedVersion: null,
      currentTermsVersion: null,
    };
    isAuthenticatedUpload = false;
  }

  // Create or find userAccount (profile table) - prefer lookup by userId, fall back to email
  let userAccount = await db
    .selectFrom("userAccount")
    .selectAll()
    .where("userId", "=", user.id)
    .executeTakeFirst();

  if (!userAccount) {
    userAccount = await db
      .selectFrom("userAccount")
      .selectAll()
      .where("email", "=", user.email)
      .executeTakeFirst();
  }

  if (!userAccount) {
    console.log(`[resolveUserSession] Creating new user account profile for email: ${user.email}`);
    userAccount = await db
      .insertInto("userAccount")
      .values({
        userId: user.id,
        email: user.email,
        region: region,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return {
    user,
    isAuthenticatedUpload,
    userAccount,
  };
}