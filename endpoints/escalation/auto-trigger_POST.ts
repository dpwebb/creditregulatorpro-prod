import { schema, OutputType } from "./auto-trigger_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { scanForEscalation, triggerEscalation } from "../../helpers/autoEscalation";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // 1. Security Check: Only admin role can access this batch operation
    if (user.role !== 'admin') {
      return new Response(JSON.stringify({ error: "Unauthorized: Admin access required" }), { status: 403 });
    }

    // 2. Rate limiting: 5 requests per minute (similar to other admin scan endpoints)
    // This prevents accidental spamming of the batch process
    const rateLimit = await checkRateLimit(user.id.toString(), "ESCALATION_AUTO_TRIGGER_POST", 5, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    // 3. Scan for obligations ready for escalation
    // We pass undefined to scan for ALL users globally
    const obligationsToEscalate = await scanForEscalation();

    const results = {
      scannedCount: obligationsToEscalate.length,
      triggeredCount: 0,
      errors: [] as { id: number; error: string }[],
    };

    // 4. Process escalations
    // We process them sequentially to avoid overwhelming the DB with concurrent transactions
    // and to ensure audit logs are written in order.
    for (const obligation of obligationsToEscalate) {
      try {
        await triggerEscalation(obligation.id, request);
        results.triggeredCount++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error during escalation";
        console.error(`Failed to auto-escalate obligation instance ${obligation.id}:`, err);
        results.errors.push({
          id: obligation.id,
          error: errorMessage,
        });
      }
    }

    // 5. Return summary
    return new Response(JSON.stringify({ 
      success: true,
      summary: results 
    } satisfies OutputType));

  } catch (error) {
    console.error("Critical error in auto-escalation trigger:", error);
        return handleEndpointError(error);
  }
}