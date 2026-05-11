import { schema, OutputType } from "./mapping_POST.schema";
import { upsertRegulationViolationMapping } from "../../helpers/regulationRegistryService";
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
    const mapping = await upsertRegulationViolationMapping({
      ...input,
      adminUserId: user.id,
    });

    await logAudit({
      action: input.id ? "UPDATE" : "CREATE",
      entityType: "REGULATORY_UPDATE",
      entityId: mapping.id,
      userId: user.id,
      details: {
        component: "regulation_registry",
        mode: "violation_mapping_upserted",
        violationCategory: mapping.violationCategory,
        regulationId: mapping.regulationId,
        active: mapping.active,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ mapping } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
