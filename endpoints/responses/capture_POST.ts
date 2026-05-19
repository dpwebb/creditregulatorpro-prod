import { schema, type OutputType } from "./capture_POST.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { captureResponseDocument } from "../../helpers/responseDocumentService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const response = await captureResponseDocument(
      {
        userId: input.userId,
        packetId: input.packetId ?? null,
        disputePacketFindingId: input.disputePacketFindingId ?? null,
        findingOutcomeId: input.findingOutcomeId ?? null,
        comparisonRunId: input.comparisonRunId ?? null,
        bureauId: input.bureauId ?? null,
        agencyId: input.agencyId ?? null,
        responseChannel: input.responseChannel,
        responseDocumentType: input.responseDocumentType,
        responseReceivedAt: input.responseReceivedAt,
        responseSource: input.responseSource ?? null,
        responseSubject: input.responseSubject ?? null,
        responseSenderDomain: input.responseSenderDomain ?? null,
        responseReferenceId: input.responseReferenceId ?? null,
        attachmentEvidenceId: input.attachmentEvidenceId ?? null,
        evidenceAttachmentId: input.evidenceAttachmentId ?? null,
        normalizedResponseHash: input.normalizedResponseHash ?? null,
        responseSummary: input.responseSummary ?? null,
        responseStatus: input.responseStatus,
        rawArtifactMetadata: input.rawArtifactMetadata ?? null,
        normalizedResponseMetadata: input.normalizedResponseMetadata ?? null,
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
