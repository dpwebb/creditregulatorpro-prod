import { schema, OutputType } from "./update-status_POST.schema";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { updateRegulationReconciliationCandidateStatus } from "../../../helpers/regulationReconciliationCandidateService";

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
    const candidate = await updateRegulationReconciliationCandidateStatus({
      candidateId: input.candidateId,
      reviewStatus: input.reviewStatus,
      reviewNotes: input.reviewNotes ?? null,
      rejectedReason: input.rejectedReason ?? null,
      supersedesCandidateId: input.supersedesCandidateId ?? null,
      adminUserId: user.id,
      request,
    });

    return new Response(JSON.stringify({ candidate } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
