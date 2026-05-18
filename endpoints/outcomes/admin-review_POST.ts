import { schema, type OutputType } from "./admin-review_POST.schema";

import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { updateOutcomeAdminReview } from "../../helpers/outcomeTrackingService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const comparisonRun = await updateOutcomeAdminReview(
      {
        comparisonRunId: input.comparisonRunId,
        findingOutcomeId: input.findingOutcomeId ?? null,
        reviewAction: input.reviewAction,
        reviewNotes: input.reviewNotes ?? null,
        evidenceIds: input.evidenceIds,
        confirmNoCanonicalChange: input.confirmNoCanonicalChange,
        confirmNoRuntimeActivation: input.confirmNoRuntimeActivation,
        confirmNoPacketMutation: input.confirmNoPacketMutation,
        explicitConfirmation: input.explicitConfirmation,
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
