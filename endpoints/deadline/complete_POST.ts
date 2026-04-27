import { schema, OutputType } from "./complete_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { markDeadlineCompleted } from "../../helpers/deadlineCalculator";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { AccessDeniedError, getDeadlineEventWithOwnershipCheck } from "../../helpers/deadlineOwnership";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 20 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "DEADLINE_COMPLETE_POST", 20, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const { deadlineEventId, completedAt } = schema.parse(json);

    // Verify existence and ownership before marking complete
    let event: Awaited<ReturnType<typeof getDeadlineEventWithOwnershipCheck>>;
    try {
      event = await getDeadlineEventWithOwnershipCheck(deadlineEventId, user.id, user.role === "admin");
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        return new Response(JSON.stringify({ error: err.message }), { status: 403 });
      }
      throw err;
    }

    if (!event) {
      return new Response(JSON.stringify({ error: "Deadline event not found" }), { status: 404 });
    }

    const completedDate = completedAt ? new Date(completedAt) : new Date();

    await markDeadlineCompleted(deadlineEventId, completedDate);

    // Audit Log
    await logAudit({
      action: "UPDATE", // Using generic UPDATE as DEADLINE_COMPLETED isn't in AuditActionType enum, or we map it to UPDATE
      entityType: "OBLIGATION_INSTANCE", // Best approximation if linked, otherwise generic
      userId: user.id,
      details: { deadlineEventId, completedAt: completedDate },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}