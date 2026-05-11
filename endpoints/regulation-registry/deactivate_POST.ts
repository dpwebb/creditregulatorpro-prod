import { schema, OutputType } from "./deactivate_POST.schema";
import { deactivateRegulationRecord } from "../../helpers/regulationRegistryService";
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

    const input = schema.parse(JSON.parse(await request.text()));
    const regulation = await deactivateRegulationRecord({
      recordId: input.recordId,
      adminUserId: user.id,
      reason: input.reason ?? null,
    });

    await logAudit({
      action: "UPDATE",
      entityType: "REGULATORY_UPDATE",
      entityId: regulation.id,
      userId: user.id,
      details: {
        component: "regulation_registry",
        mode: "regulation_deactivated",
        regulationId: regulation.regulationId,
        reason: input.reason ?? null,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ regulation } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
