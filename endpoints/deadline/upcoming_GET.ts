import { schema, OutputType } from "./upcoming_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getUpcomingDeadlines } from "../../helpers/deadlineCalculator";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 10 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "DEADLINE_UPCOMING_GET", 10, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    // Parse query params manually since GET requests don't have body
    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const validatedInput = schema.parse({ limit });

    // Admins pass null to bypass userId filtering and see all deadlines
    const effectiveUserId = user.role === 'admin' ? null : user.id;
    const deadlines = await getUpcomingDeadlines(effectiveUserId, validatedInput.limit);

    return new Response(JSON.stringify(deadlines satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}