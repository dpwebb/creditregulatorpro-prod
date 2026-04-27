import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { createDeadlineEvent, calculateDeadline } from "../../helpers/deadlineCalculator";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 20 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "DEADLINE_CREATE_POST", 20, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const isAdmin = user.role === "admin";

    // Verify ownership of the referenced resource before creating the deadline
    if (input.obligationInstanceId !== undefined) {
      const ownerCheck = await db
        .selectFrom("obligationInstance")
        .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
        .select(["tradeline.userId"])
        .where("obligationInstance.id", "=", input.obligationInstanceId)
        .executeTakeFirst();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Obligation instance not found." }), { status: 404 });
      }
      if (!isAdmin && ownerCheck.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have access to this obligation instance." }), { status: 403 });
      }
    }

    if (input.packetId !== undefined) {
      const ownerCheck = await db
        .selectFrom("packet")
        .select(["userId"])
        .where("id", "=", input.packetId)
        .executeTakeFirst();

      if (!ownerCheck) {
        return new Response(JSON.stringify({ error: "Packet not found." }), { status: 404 });
      }
      if (!isAdmin && ownerCheck.userId !== user.id) {
        return new Response(JSON.stringify({ error: "You do not have access to this packet." }), { status: 403 });
      }
    }

    let finalDeadline: Date;

    if (input.deadline) {
      finalDeadline = input.deadline;
    } else if (input.challengeSentDate) {
      // Auto-calculate based on CA policy
      const calculation = calculateDeadline(input.challengeSentDate, "CA", false);
      finalDeadline = calculation.deadline;
    } else {
      throw new Error("Cannot determine deadline date");
    }

    const deadlineEvent = await createDeadlineEvent({
      obligationInstanceId: input.obligationInstanceId,
      packetId: input.packetId,
      eventType: input.eventType,
      deadline: finalDeadline,
      title: input.title,
      description: input.description,
      region: "CA",
    });

    // Audit Log
    await logAudit({
      action: "CREATE",
      entityType: "EVIDENCE_EVENT", // Mapping to closest entity type
      entityId: deadlineEvent.id,
      userId: user.id,
      details: { 
        title: input.title, 
        deadline: finalDeadline,
        obligationInstanceId: input.obligationInstanceId 
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ deadlineEvent } satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}