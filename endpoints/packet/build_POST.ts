import { schema, type OutputType } from "./build_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { buildDisputePacketPreview, type DisputePacketBuildInput } from "../../helpers/disputePacketService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const input = schema.parse(JSON.parse(await request.text())) as DisputePacketBuildInput;
    const { packet } = await buildDisputePacketPreview(user, input);

    return new Response(
      JSON.stringify({ packet } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
