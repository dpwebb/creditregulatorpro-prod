import { OutputType } from "./data-summary_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getUserDataSummary } from "../../helpers/userDataDeletion";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const summary = await getUserDataSummary(user.id);

    return new Response(JSON.stringify(summary satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
