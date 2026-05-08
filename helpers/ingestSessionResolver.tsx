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
 * 1. Require an authenticated user session
 * 2. Create or find corresponding user_account profile record
 * 
 * @param request - The incoming request (for session verification)
 * @param region - Region for new user accounts
 * @returns Resolved user session with user, userAccount, and authentication status
 * @throws NotAuthenticatedError if no authenticated session is present
 */
export async function resolveUserSession(
  request: Request,
  region: string
): Promise<ResolvedUserSession> {
  const sessionData = await getServerUserSession(request);
  const user: User = { ...sessionData.user };

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
    isAuthenticatedUpload: true,
    userAccount,
  };
}
