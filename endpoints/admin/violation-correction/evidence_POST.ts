import { db } from "../../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { Json } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import {
  getCorrectionDetail,
  requireCorrection,
  requireTradelineForRun,
  upsertTrainingExampleForCorrection,
} from "../../../helpers/violationCorrectionManager";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { schema, OutputType } from "./evidence_POST.schema";

function nullIfEmpty(value: string | null | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    await ensureViolationCorrectionSchema();

    const input = schema.parse(JSON.parse(await request.text()));
    const correction = await requireCorrection(input.correctionId);
    const now = new Date();

    await db.transaction().execute(async (trx) => {
      if (input.action === "add") {
        await requireTradelineForRun(input.evidence.tradelineId, input.evidence.extractionRunId);
        if (
          input.evidence.extractionRunId !== correction.extractionRunId ||
          input.evidence.tradelineId !== correction.tradelineId
        ) {
          throw new BusinessRuleError("Evidence must match the correction extraction run and tradeline", 400);
        }

        await trx
          .insertInto("violationCorrectionEvidence")
          .values({
            correctionId: correction.id,
            sourceDocumentId: input.evidence.sourceDocumentId,
            extractionRunId: input.evidence.extractionRunId,
            tradelineId: input.evidence.tradelineId,
            pageNumber: input.evidence.pageNumber,
            fieldName: nullIfEmpty(input.evidence.fieldName),
            textExcerpt: input.evidence.textExcerpt,
            normalizedValue: nullIfEmpty(input.evidence.normalizedValue),
            evidenceReason: input.evidence.evidenceReason,
            adminSelected: input.evidence.adminSelected ?? true,
            createdAt: now,
          })
          .execute();
      } else {
        await trx
          .deleteFrom("violationCorrectionEvidence")
          .where("id", "=", input.evidenceId)
          .where("correctionId", "=", correction.id)
          .execute();
      }

      await trx
        .updateTable("violationCorrection")
        .set({ updatedAt: now, status: correction.status === "finalized" ? "in_review" : correction.status })
        .where("id", "=", correction.id)
        .execute();

      await trx
        .insertInto("auditLog")
        .values({
          actionType: "UPDATE",
          entityType: "TRADELINE",
          entityId: correction.tradelineId,
          userId: user.id,
          details: {
            action: input.action === "add" ? "violation_correction_evidence_added" : "violation_correction_evidence_removed",
            correctionId: correction.id,
          } as Json,
          status: "SUCCESS",
          timestamp: now,
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent"),
        })
        .execute();
    });

    const updated = await getCorrectionDetail(correction.id);
    if (updated.status === "finalized") {
      await upsertTrainingExampleForCorrection(correction.id);
    }

    const output: OutputType = {
      correction: updated,
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
