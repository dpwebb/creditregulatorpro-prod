import { schema, OutputType } from "./delete_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";
import { AccessDeniedError, getDeadlineEventWithOwnershipCheck } from "../../helpers/deadlineOwnership";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const rateLimit = await checkRateLimit(user.id.toString(), "DEADLINE_DELETE_POST", 20, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const { deadlineEventId } = schema.parse(json);

    // Verify existence and ownership
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

    // Fetch full existing record for audit log
    const existing = await db
      .selectFrom("deadlineEvent")
      .selectAll()
      .where("id", "=", deadlineEventId)
      .executeTakeFirstOrThrow();

    // Hard delete as per schema limitations (no deletedAt), but audit log preserves history
    await db
      .deleteFrom("deadlineEvent")
      .where("id", "=", deadlineEventId)
      .execute();

    // Audit Log - preserves the record of what was deleted
    await logAudit({
      action: "DELETE",
      entityType: "EVIDENCE_EVENT",
      entityId: deadlineEventId,
      userId: user.id,
      details: { 
        deletedEvent: existing
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}