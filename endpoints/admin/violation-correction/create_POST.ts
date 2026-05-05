import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { Json } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import {
  getCorrectionDetail,
  normalizeCorrectionTextFields,
  requireTradelineForRun,
  requireViolationForTradeline,
} from "../../../helpers/violationCorrectionManager";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { deriveTrainingLabel } from "../../../helpers/violationCorrectionValidation";
import { schema, OutputType } from "./create_POST.schema";

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
    await requireTradelineForRun(input.tradelineId, input.extractionRunId);
    const originalViolation = await requireViolationForTradeline(
      input.originalViolationId ?? null,
      input.tradelineId,
    );

    const neutralText = normalizeCorrectionTextFields(input);
    const label =
      input.trainingLabel ??
      deriveTrainingLabel({
        action: input.correctionAction,
        originalViolationId: input.originalViolationId ?? null,
        correctedViolationType: input.correctedViolationType,
        originalViolationType: originalViolation?.violationCategory ?? null,
      });

    const now = new Date();
    const correction = await db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto("violationCorrection")
        .values({
          extractionRunId: input.extractionRunId,
          tradelineId: input.tradelineId,
          originalViolationId: input.originalViolationId ?? null,
          correctionAction: input.correctionAction,
          correctedViolationType: nullIfEmpty(input.correctedViolationType),
          correctedSummary: neutralText.correctedSummary,
          correctedExplanation: neutralText.correctedExplanation,
          correctedSeverity: nullIfEmpty(input.correctedSeverity),
          correctedConfidence: input.correctedConfidence ?? null,
          correctionReason: neutralText.correctionReason,
          adminNotes: neutralText.adminNotes,
          status: input.status ?? "draft",
          trainingLabel: label,
          trainingNoteOnly: input.trainingNoteOnly ?? false,
          useForTraining: input.useForTraining ?? true,
          createdByAdminId: user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (input.evidence?.length) {
        await trx
          .insertInto("violationCorrectionEvidence")
          .values(
            input.evidence.map((item) => ({
              correctionId: created.id,
              sourceDocumentId: item.sourceDocumentId,
              extractionRunId: item.extractionRunId,
              tradelineId: item.tradelineId,
              pageNumber: item.pageNumber,
              fieldName: nullIfEmpty(item.fieldName),
              textExcerpt: item.textExcerpt,
              normalizedValue: nullIfEmpty(item.normalizedValue),
              evidenceReason: item.evidenceReason,
              adminSelected: item.adminSelected ?? true,
              createdAt: now,
            })),
          )
          .execute();
      }

      if (input.regulationReferences?.length) {
        await trx
          .insertInto("violationRegulationReference")
          .values(
            input.regulationReferences.map((item) => ({
              violationId: item.violationId ?? input.originalViolationId ?? null,
              correctionId: created.id,
              extractionRunId: item.extractionRunId,
              tradelineId: item.tradelineId ?? input.tradelineId,
              jurisdiction: item.jurisdiction,
              country: item.country,
              provinceOrTerritory: nullIfEmpty(item.provinceOrTerritory),
              regulatorOrStandardBody: item.regulatorOrStandardBody,
              regulationName: item.regulationName,
              statuteOrRuleName: item.statuteOrRuleName,
              sectionNumber: item.sectionNumber,
              subsectionNumber: nullIfEmpty(item.subsectionNumber),
              regulationTextExcerpt: item.regulationTextExcerpt,
              citationUrl: nullIfEmpty(item.citationUrl),
              citationSource: item.citationSource,
              citationConfidence: item.citationConfidence ?? 0.75,
              adminVerifiedCitation: item.adminVerifiedCitation ?? false,
              adminNotes: nullIfEmpty(item.adminNotes),
              mappingStatus: item.mappingStatus ?? "active",
              createdAt: now,
              updatedAt: now,
            })),
          )
          .execute();
      }

      await trx
        .insertInto("auditLog")
        .values({
          actionType: "CREATE",
          entityType: "TRADELINE",
          entityId: input.tradelineId,
          userId: user.id,
          details: {
            action: "violation_correction_created",
            correctionId: created.id,
            extractionRunId: input.extractionRunId,
            originalViolationId: input.originalViolationId ?? null,
          } as Json,
          status: "SUCCESS",
          timestamp: now,
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent"),
        })
        .execute();

      return created;
    });

    const output: OutputType = {
      correction: await getCorrectionDetail(correction.id),
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
