import { schema, type OutputType } from "./metrics_GET.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getResponseProcessingMetrics } from "../../helpers/responseProcessingMetrics";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));
    const metrics = await getResponseProcessingMetrics(input, { id: user.id, role: user.role });

    return new Response(JSON.stringify({ metrics } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
