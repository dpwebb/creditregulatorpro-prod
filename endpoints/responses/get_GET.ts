import { schema, type OutputType } from "./get_GET.schema";

import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getResponseDocument } from "../../helpers/responseDocumentService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));

    const response = await getResponseDocument(
      { responseId: input.responseId },
      { id: user.id, role: user.role },
    );

    return new Response(JSON.stringify({ response } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
