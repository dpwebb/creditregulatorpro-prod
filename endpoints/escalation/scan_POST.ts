import { schema, OutputType } from "./scan_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { scanForEscalation } from "../../helpers/autoEscalation";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Only admin can scan for all users, or maybe just scan for self?
    // Requirement says "Only admin role can access"
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    // Rate limiting: 5 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "ESCALATION_SCAN_POST", 5, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    // Scan for all users (pass undefined for userId) or specific logic if needed.
    // Assuming admin scans globally.
    const obligations = await scanForEscalation();

    return new Response(JSON.stringify({ obligationsReadyForEscalation: obligations } satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}