import { schema, OutputType } from "./create_POST.schema";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { isAdmin } from "../../../helpers/userRoleUtils";
import {
  createReconciliationCandidatesFromFindings,
  type ReconciliationFindingCandidateInput,
} from "../../../helpers/regulationReconciliationCandidateService";

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
    const result = await createReconciliationCandidatesFromFindings({
      findings: input.findings as ReconciliationFindingCandidateInput[],
      reconciliationRunId: input.reconciliationRunId ?? null,
      adminUserId: user.id,
      request,
    });

    return new Response(JSON.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
