import { schema, OutputType } from "./delete-data_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { deleteUserDataCategories } from "../../helpers/userDataDeletion";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== "user") {
      throw new BusinessRuleError("Self-service data deletion is available only for consumer accounts", 403);
    }

    const input = schema.parse(JSON.parse(await request.text()));
    const result = await deleteUserDataCategories({
      userId: user.id,
      actorUserId: user.id,
      categories: input.categories,
      request,
    });

    await logAudit({
      action: "DELETE",
      entityType: "USER_ACCOUNT",
      entityId: user.id,
      userId: user.id,
      details: {
        action: "SELF_DATA_DELETION",
        categories: input.categories,
        purgedCounts: result.purgedCounts,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
