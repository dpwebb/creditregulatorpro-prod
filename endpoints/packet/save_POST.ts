import { schema, type OutputType } from "./save_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { createDisputePacketRecord, type DisputePacketBuildInput } from "../../helpers/disputePacketService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const input = schema.parse(JSON.parse(await request.text())) as DisputePacketBuildInput;
    const created = await createDisputePacketRecord(user, input);

    return new Response(
      JSON.stringify({ success: true, ...created } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}
