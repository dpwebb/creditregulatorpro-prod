import { schema, OutputType } from "./overdue_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getOverdueDeadlines } from "../../helpers/deadlineCalculator";
import { checkRateLimit } from "../../helpers/rateLimiter";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 10 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "DEADLINE_OVERDUE_GET", 10, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const validatedInput = schema.parse({ limit });

    // Admins pass null to bypass userId filtering and see all deadlines
    const effectiveUserId = user.role === 'admin' ? null : user.id;
    const deadlines = await getOverdueDeadlines(effectiveUserId, validatedInput.limit);

    return new Response(JSON.stringify(deadlines satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}