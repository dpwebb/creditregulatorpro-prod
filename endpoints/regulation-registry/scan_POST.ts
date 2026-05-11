import { schema, OutputType } from "./scan_POST.schema";
import { runRegulationUpdateScan } from "../../helpers/regulationRegistryService";
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

    const input = schema.parse(JSON.parse((await request.text()) || "{}"));
    const result = await runRegulationUpdateScan({
      mode: input.mode,
      triggeredByUserId: user.id,
      sourceDocuments: input.sourceDocuments,
      fetchConfiguredSources: input.fetchConfiguredSources,
    });

    await logAudit({
      action: "SYSTEM_CHANGE",
      entityType: "REGULATORY_UPDATE",
      userId: user.id,
      details: {
        component: "regulation_registry",
        mode: "admin_scan",
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
      },
      status: result.errors.length > 0 ? "FAILURE" : "SUCCESS",
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
