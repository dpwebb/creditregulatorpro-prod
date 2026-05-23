import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import {
  assertLiveStagingRequest,
  BETA_READINESS_AUTHORITY,
  BETA_READINESS_COMMAND,
  buildBetaCodexPrompt,
  buildBetaIssueId,
} from "./common";
import { schema, OutputType } from "./prompt_POST.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin access required", 403);
    }
    assertLiveStagingRequest(request);

    const input = schema.parse(JSON.parse(await request.text()));
    const generatedAt = new Date().toISOString();
    const issueId = buildBetaIssueId(input, generatedAt);
    const prompt = buildBetaCodexPrompt(input, issueId, generatedAt);

    return new Response(
      JSON.stringify({
        issueId,
        generatedAt,
        prompt,
        promptSource: "deterministic-template",
        stagingOnly: true,
        readinessCommand: BETA_READINESS_COMMAND,
        readinessAuthority: BETA_READINESS_AUTHORITY,
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
