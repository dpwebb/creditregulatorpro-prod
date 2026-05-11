import { OutputType } from "./delete_POST.schema";

import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { deleteConsumerIdentificationDocument } from "../../../helpers/consumerIdentification";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { logAudit } from "../../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const deleted = await deleteConsumerIdentificationDocument(user.id);

    if (deleted) {
      await logAudit({
        action: "DELETE",
        entityType: "USER_ACCOUNT",
        entityId: user.id,
        userId: user.id,
        details: { documentType: "consumer_identification" },
        status: "SUCCESS",
        request,
      });
    }

    return new Response(JSON.stringify({ deleted } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
