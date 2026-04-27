import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized access" }), {
        status: 403,
      });
    }

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    await db
      .deleteFrom("dynamicScanningRule")
      .where("id", "=", result.id)
      .execute();

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "SYSTEM",
      entityId: result.id,
      userId: user.id,
      details: { id: result.id },
      status: "SUCCESS",
      request,
    });

    return new Response(
      JSON.stringify({
        success: true,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}