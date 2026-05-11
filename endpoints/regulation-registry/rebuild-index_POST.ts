import { schema, OutputType } from "./rebuild-index_POST.schema";
import { rebuildRegulationIndexes } from "../../helpers/regulationRegistryService";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { logAudit } from "../../helpers/auditLogger";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    schema.parse(JSON.parse((await request.text()) || "{}"));
    const result = await rebuildRegulationIndexes();

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "REGULATORY_UPDATE",
      userId: user.id,
      details: {
        component: "regulation_registry",
        mode: "index_rebuilt",
        rebuilt: result.rebuilt,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
