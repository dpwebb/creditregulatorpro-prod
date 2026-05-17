import { schema, type OutputType } from "./compare_POST.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { createOutcomeComparisonRun } from "../../helpers/outcomeTrackingService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const comparisonRun = await createOutcomeComparisonRun(
      {
        previousReportArtifactId: input.previousReportArtifactId,
        laterReportArtifactId: input.laterReportArtifactId ?? null,
        packetId: input.packetId ?? null,
        comparisonScope: input.comparisonScope,
        creditorObligationTestIds: input.creditorObligationTestIds,
        disputePacketFindingIds: input.disputePacketFindingIds,
        response: input.response ?? null,
      },
      { id: user.id, role: user.role },
      request,
    );

    return new Response(JSON.stringify({ comparisonRun } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
