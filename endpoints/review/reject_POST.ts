import { schema, OutputType } from "./reject_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { logAudit } from "../../helpers/auditLogger";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    let user;
    let isAuthenticatedRequest = false;

    // Try to get authenticated user session first
    try {
      const sessionData = await getServerUserSession(request);
      user = sessionData.user;
      isAuthenticatedRequest = true;
      console.log(`[Review/Reject] Authenticated rejection from user ${user.id} (${user.email})`);
    } catch (sessionError) {
      // Not authenticated - check if userId was provided for external/unauthenticated flow
      if (!input.userId) {
        return new Response(
          JSON.stringify({ 
            error: "Authentication required or userId must be provided for external requests"
          }),
          { 
            status: 401,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      console.log(`[Review/Reject] Unauthenticated rejection with external userId: ${input.userId}`);
      
      // External/unauthenticated flow - find or create user
      const email = `user-${input.userId}@creditregulatorpro.com`;
      
      let existingUser = await db
        .selectFrom("users")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();

      if (!existingUser) {
        console.log(`[Review/Reject] Creating new user in users table for external userId: ${email}`);
        existingUser = await db
          .insertInto("users")
          .values({
            email: email,
            displayName: `User ${input.userId}`,
            role: "user",
            emailVerified: false,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
      }

      user = existingUser;
      isAuthenticatedRequest = false;
    }

    // Log the rejection - use user.id from users table
    await logAudit({
      action: "DELETE",
      entityType: "REPORT_ARTIFACT",
      userId: user.id,
      details: {
        reviewSessionId: input.reviewSessionId,
        reason: input.reason,
        action: "REVIEW_REJECTED",
        isAuthenticatedRequest: isAuthenticatedRequest
      },
      status: "SUCCESS",
      request
    });

    return new Response(
      JSON.stringify({ ok: true } satisfies OutputType),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error in review/reject_POST:", error);
    return handleEndpointError(error);
  }
}