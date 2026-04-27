import { schema, OutputType } from "./analytics_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { 
  getOverallSuccessMetrics, 
  getSuccessRateByVector, 
  getSuccessRateByCreditor, 
  getSuccessRateByBureau, 
  getSuccessRateByViolationCategory 
} from "../../helpers/successAnalytics";
import { checkRateLimit } from "../../helpers/rateLimiter";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    // Rate limiting: 10 requests/minute
    const rateLimit = await checkRateLimit(user.id.toString(), "ANALYTICS_GET", 10, 1);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    }

    const url = new URL(request.url);
    const scopeParam = url.searchParams.get("scope");
    
        const validatedInput = schema.parse({ scope: scopeParam ?? undefined });
    
    let data: any;

    switch (validatedInput.scope) {
      case 'overall':
        data = await getOverallSuccessMetrics(user.id);
        break;
      case 'vector':
        data = await getSuccessRateByVector(user.id);
        break;
      case 'creditor':
        data = await getSuccessRateByCreditor(user.id);
        break;
      case 'bureau':
        data = await getSuccessRateByBureau(user.id);
        break;
      case 'violation':
        data = await getSuccessRateByViolationCategory(user.id);
        break;
      default:
        throw new Error("Invalid scope");
    }

    return new Response(JSON.stringify(data satisfies OutputType));
  } catch (error) {
        return handleEndpointError(error);
  }
}