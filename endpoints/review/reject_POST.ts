import { schema, OutputType } from "./reject_POST.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { logAudit } from "../../helpers/auditLogger";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const sessionData = await getServerUserSession(request);
    const user = sessionData.user;
    const isAuthenticatedRequest = true;
    console.log(`[Review/Reject] Authenticated rejection from user ${user.id} (${user.email})`);

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
