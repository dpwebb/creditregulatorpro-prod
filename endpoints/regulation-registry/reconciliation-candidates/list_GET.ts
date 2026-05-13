import { schema, OutputType } from "./list_GET.schema";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { listRegulationReconciliationCandidates } from "../../../helpers/regulationReconciliationCandidateService";

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
      candidateType: url.searchParams.get("candidateType") || undefined,
      severity: url.searchParams.get("severity") || undefined,
      reviewStatus: url.searchParams.get("reviewStatus") || undefined,
      staticReferenceId: url.searchParams.get("staticReferenceId") || undefined,
      dbRegulationId: url.searchParams.get("dbRegulationId") || undefined,
      deterministicRuleId: url.searchParams.get("deterministicRuleId") || undefined,
      reconciliationRunId: url.searchParams.get("reconciliationRunId") || undefined,
      includeSnapshotData: url.searchParams.get("includeSnapshotData") || undefined,
    });

    const candidates = await listRegulationReconciliationCandidates(input);

    return new Response(JSON.stringify({ candidates } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
