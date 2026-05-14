import { schema, type OutputType } from "./list_GET.schema";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { listRuntimeBridgeMappings } from "../../../helpers/regulationRuntimeBridgeMappingService";
import { isAdmin } from "../../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const input = schema.parse({
      bridgeMode: url.searchParams.get("bridgeMode") || undefined,
      activationStatus: url.searchParams.get("activationStatus") || undefined,
      deterministicRuleId: url.searchParams.get("deterministicRuleId") || undefined,
      violationCategory: url.searchParams.get("violationCategory") || undefined,
      staticReferenceId: url.searchParams.get("staticReferenceId") || undefined,
      dbRegulationId: url.searchParams.get("dbRegulationId") || undefined,
      dbMappingId: url.searchParams.get("dbMappingId") || undefined,
      referenceClass: url.searchParams.get("referenceClass") || undefined,
      consumerWordingMode: url.searchParams.get("consumerWordingMode") || undefined,
      includeTestManifest: url.searchParams.get("includeTestManifest") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    const mappings = await listRuntimeBridgeMappings(input);

    return new Response(JSON.stringify({ mappings } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
