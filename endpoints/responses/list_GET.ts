import { schema, type OutputType } from "./list_GET.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { listResponseDocuments } from "../../helpers/responseDocumentService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));

    const result = await listResponseDocuments(
      {
        packetId: input.packetId,
        disputePacketFindingId: input.disputePacketFindingId,
        findingOutcomeId: input.findingOutcomeId,
        comparisonRunId: input.comparisonRunId,
        bureauId: input.bureauId,
        agencyId: input.agencyId,
        responseChannel: input.responseChannel,
        responseDocumentType: input.responseDocumentType,
        responseStatus: input.responseStatus,
        startDate: input.startDate,
        endDate: input.endDate,
        limit: input.limit,
        offset: input.offset,
      },
      { id: user.id, role: user.role },
    );

    return new Response(JSON.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
