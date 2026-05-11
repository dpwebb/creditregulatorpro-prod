import { schema, OutputType } from "./review_POST.schema";
import {
  approveRegulationCandidate,
  rejectRegulationCandidate,
} from "../../helpers/regulationRegistryService";
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

    if (input.decision === "reject") {
      const candidate = await rejectRegulationCandidate({
        candidateId: input.candidateId,
        adminUserId: user.id,
        reviewNotes: input.reviewNotes ?? null,
      });

      await logAudit({
        action: "UPDATE",
        entityType: "REGULATORY_UPDATE",
        entityId: candidate.id,
        userId: user.id,
        details: {
          component: "regulation_registry",
          mode: "candidate_rejected",
          candidateRegulationId: candidate.candidateRegulationId,
          reviewNotes: input.reviewNotes ?? null,
        },
        status: "SUCCESS",
        request,
      });

      return new Response(JSON.stringify({ decision: "reject", candidate } satisfies OutputType), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const regulationRecord = await approveRegulationCandidate({
      candidateId: input.candidateId,
      adminUserId: user.id,
      reviewNotes: input.reviewNotes ?? null,
    });

    await logAudit({
      action: "UPDATE",
      entityType: "REGULATORY_UPDATE",
      entityId: regulationRecord.id,
      userId: user.id,
      details: {
        component: "regulation_registry",
        mode: "candidate_approved",
        regulationId: regulationRecord.regulationId,
        updateVersion: regulationRecord.updateVersion,
        activeStatus: regulationRecord.activeStatus,
      },
      status: "SUCCESS",
      request,
    });

    return new Response(JSON.stringify({ decision: "approve", regulationRecord } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
