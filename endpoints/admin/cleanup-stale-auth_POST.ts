import { schema, OutputType } from "./cleanup-stale-auth_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    if (user.role !== "admin") {
      throw new BusinessRuleError("Forbidden: Admin access required", 403);
    }

    const json = JSON.parse(await request.text());
    schema.parse(json);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      sessionsResult,
      oauthStatesResult,
      emailTokensResult,
      loginAttemptsResult
    ] = await Promise.all([
      db.deleteFrom("sessions")
        .where("expiresAt", "<", now)
        .executeTakeFirst(),
      
      db.deleteFrom("oauthStates")
        .where("expiresAt", "<", now)
        .executeTakeFirst(),
        
      db.deleteFrom("emailVerificationTokens")
        .where((eb) => eb.or([
          eb("verified", "=", true),
          eb("expiresAt", "<", now)
        ]))
        .executeTakeFirst(),
        
      db.deleteFrom("loginAttempts")
        .where("attemptedAt", "<", thirtyDaysAgo)
        .executeTakeFirst()
    ]);

    return new Response(
      JSON.stringify({
        deletedSessions: Number(sessionsResult.numDeletedRows),
        deletedOauthStates: Number(oauthStatesResult.numDeletedRows),
        deletedEmailTokens: Number(emailTokensResult.numDeletedRows),
        deletedLoginAttempts: Number(loginAttemptsResult.numDeletedRows)
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}