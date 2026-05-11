import { schema, OutputType } from "./create-candidate_POST.schema";
import { createRegulationCandidate } from "../../helpers/regulationRegistryService";
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
    const result = await createRegulationCandidate(input, { allowUnchanged: true });

    await logAudit({
      action: "CREATE",
      entityType: "REGULATORY_UPDATE",
      entityId: result.candidate?.id ?? null,
      userId: user.id,
      details: {
        component: "regulation_registry",
        mode: "candidate_created",
        regulationId: input.regulationId,
        skippedReason: result.skippedReason,
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
