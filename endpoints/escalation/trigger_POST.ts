import { schema, OutputType } from "./trigger_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { triggerEscalation } from "../../helpers/autoEscalation";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { generateExhaustionComplaintPackets } from "../../helpers/exhaustionComplaintPackets";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

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