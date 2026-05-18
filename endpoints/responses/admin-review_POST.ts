import { schema, type OutputType } from "./admin-review_POST.schema";

import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { updateResponseDocumentAdminReview } from "../../helpers/responseDocumentService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const response = await updateResponseDocumentAdminReview(
      {
        responseId: input.responseId,
        reviewAction: input.reviewAction,
        reviewNotes: input.reviewNotes ?? null,
        packetId: input.packetId ?? null,
        disputePacketFindingId: input.disputePacketFindingId ?? null,
        comparisonRunId: input.comparisonRunId ?? null,
        findingOutcomeId: input.findingOutcomeId ?? null,
        confirmEvidenceOnly: input.confirmEvidenceOnly,
        confirmNoCanonicalChange: input.confirmNoCanonicalChange,
        confirmNoOutcomeClassification: input.confirmNoOutcomeClassification,
        explicitConfirmation: input.explicitConfirmation,
      },
      { id: user.id, role: user.role },
      request,
    );

    return new Response(JSON.stringify({ response } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
