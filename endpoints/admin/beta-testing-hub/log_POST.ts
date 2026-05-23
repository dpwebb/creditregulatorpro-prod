import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { appendBetaTestingHubReportLog, assertLiveStagingRequest } from "./common";
import { schema, OutputType } from "./log_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin access required", 403);
    }
    assertLiveStagingRequest(request);

    const input = schema.parse(JSON.parse(await request.text()));
    const { logId, loggedAt } = await appendBetaTestingHubReportLog({
      input,
      request,
      userId: user.id,
    });

    return new Response(
      JSON.stringify({
        logId,
        loggedAt,
        stored: true,
        logTarget: "server-jsonl",
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
