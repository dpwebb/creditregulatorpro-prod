import { schema, OutputType } from "./trigger_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { triggerEscalation } from "../../helpers/autoEscalation";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { generateExhaustionComplaintPackets } from "../../helpers/exhaustionComplaintPackets";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 5 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "ESCALATION_TRIGGER_POST", 5, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const json = JSON.parse(await request.text());
    const { obligationInstanceId } = schema.parse(json);

    const ownerCheck = await db
      .selectFrom("obligationInstance")
      .innerJoin("tradeline", "tradeline.id", "obligationInstance.tradelineId")
      .select([
        "tradeline.userId as tradelineUserId",
        "obligationInstance.userId as obligationUserId",
      ])
      .where("obligationInstance.id", "=", obligationInstanceId)
      .executeTakeFirst();

    if (!ownerCheck) {
      throw new BusinessRuleError("Obligation instance not found.", 404);
    }

    const isAdmin = user.role === "admin";
    const ownsTradeline = ownerCheck.tradelineUserId === user.id;
    const ownsObligation = ownerCheck.obligationUserId == null || ownerCheck.obligationUserId === user.id;
    if (!isAdmin && (!ownsTradeline || !ownsObligation)) {
      throw new BusinessRuleError("You do not have access to this obligation instance.", 403);
    }

    // Note: triggerEscalation handles audit logging internally
    const newInstance = await triggerEscalation(obligationInstanceId, request);

    let fcacPacketId: number | null = null;
    let provincialPacketId: number | null = null;

    if (newInstance.state === "PROCEDURALLY_EXHAUSTED") {
      try {
        const packets = await generateExhaustionComplaintPackets(newInstance);
        fcacPacketId = packets.fcacPacketId;
        provincialPacketId = packets.provincialPacketId;
      } catch (complaintError) {
        console.error(
          "Failed to generate exhaustion complaint packets for obligationInstance id=",
          newInstance.id,
          complaintError instanceof Error ? complaintError.message : complaintError
        );
      }
    }

    return new Response(
      JSON.stringify({
        newObligationInstance: newInstance,
        fcacPacketId,
        provincialPacketId,
      } satisfies OutputType)
    );
  } catch (error) {
        return handleEndpointError(error);
  }
}
