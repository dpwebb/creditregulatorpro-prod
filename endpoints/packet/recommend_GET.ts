import { schema, type OutputType } from "./recommend_GET.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getDisputePacketCandidates } from "../../helpers/disputePacketService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const input = schema.parse({
      packetType: url.searchParams.get("packetType") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const recommendations = await getDisputePacketCandidates(user, input);

    return new Response(
      JSON.stringify({ recommendations } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
