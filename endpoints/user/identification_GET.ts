import { OutputType } from "./identification_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getConsumerIdentificationMetadata } from "../../helpers/consumerIdentification";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const identification = await getConsumerIdentificationMetadata(user.id);

    return new Response(JSON.stringify({ identification } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
