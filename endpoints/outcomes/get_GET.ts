import { schema, type OutputType } from "./get_GET.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getOutcomeComparisonRun } from "../../helpers/outcomeTrackingService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));

    const comparisonRun = await getOutcomeComparisonRun(
      { comparisonRunId: input.comparisonRunId },
      { id: user.id, role: user.role },
    );

    return new Response(JSON.stringify({ comparisonRun } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
