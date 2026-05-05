import { db } from "../../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { Json } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import {
  getCorrectionDetail,
  requireCorrection,
  requireTradelineForRun,
} from "../../../helpers/violationCorrectionManager";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { schema, OutputType } from "./regulation-reference_POST.schema";

function nullIfEmpty(value: string | null | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

function cleanUrl(value: string | null | undefined): string | null {
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
        await requireTradelineForRun(
          input.reference.tradelineId ?? correction.tradelineId,
          input.reference.extractionRunId,
        );
        if (input.reference.extractionRunId !== correction.extractionRunId) {
          throw new BusinessRuleError("Regulation reference must match the correction extraction run", 400);
        }

        await trx
          .insertInto("violationRegulationReference")
          .values({
            violationId: input.reference.violationId ?? correction.originalViolationId ?? null,
            correctionId: correction.id,
            extractionRunId: input.reference.extractionRunId,
            tradelineId: input.reference.tradelineId ?? correction.tradelineId,
            jurisdiction: input.reference.jurisdiction,
            country: input.reference.country,
            provinceOrTerritory: nullIfEmpty(input.reference.provinceOrTerritory),
            regulatorOrStandardBody: input.reference.regulatorOrStandardBody,
            regulationName: input.reference.regulationName,
            statuteOrRuleName: input.reference.statuteOrRuleName,
            sectionNumber: input.reference.sectionNumber,
            subsectionNumber: nullIfEmpty(input.reference.subsectionNumber),
            regulationTextExcerpt: input.reference.regulationTextExcerpt,
            citationUrl: cleanUrl(input.reference.citationUrl),
            citationSource: input.reference.citationSource,
            citationConfidence: input.reference.citationConfidence ?? 0.75,
            adminVerifiedCitation: input.reference.adminVerifiedCitation ?? false,
            adminNotes: nullIfEmpty(input.reference.adminNotes),
            mappingStatus: input.reference.mappingStatus ?? "active",
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      } else if (input.action === "remove") {
        await trx
          .deleteFrom("violationRegulationReference")
          .where("id", "=", input.referenceId)
          .where("correctionId", "=", correction.id)
          .execute();
      } else {
        const existing = await trx
          .selectFrom("violationRegulationReference")
          .select(["id", "correctionId"])
          .where("id", "=", input.referenceId)
          .executeTakeFirst();
        if (!existing || existing.correctionId !== correction.id) {
          throw new BusinessRuleError("Regulation reference not found", 404);
        }

        await trx
          .updateTable("violationRegulationReference")
          .set({
            violationId: input.reference.violationId ?? undefined,
            extractionRunId: input.reference.extractionRunId ?? undefined,
            tradelineId: input.reference.tradelineId ?? undefined,
            jurisdiction: input.reference.jurisdiction ?? undefined,
            country: input.reference.country ?? undefined,
            provinceOrTerritory: Object.prototype.hasOwnProperty.call(input.reference, "provinceOrTerritory")
              ? nullIfEmpty(input.reference.provinceOrTerritory)
              : undefined,
            regulatorOrStandardBody: input.reference.regulatorOrStandardBody ?? undefined,
            regulationName: input.reference.regulationName ?? undefined,
            statuteOrRuleName: input.reference.statuteOrRuleName ?? undefined,
            sectionNumber: input.reference.sectionNumber ?? undefined,
            subsectionNumber: Object.prototype.hasOwnProperty.call(input.reference, "subsectionNumber")
              ? nullIfEmpty(input.reference.subsectionNumber)
              : undefined,
            regulationTextExcerpt: input.reference.regulationTextExcerpt ?? undefined,
            citationUrl: Object.prototype.hasOwnProperty.call(input.reference, "citationUrl")
              ? cleanUrl(input.reference.citationUrl)
              : undefined,
            citationSource: input.reference.citationSource ?? undefined,
            citationConfidence: input.reference.citationConfidence ?? undefined,
            adminVerifiedCitation: input.reference.adminVerifiedCitation ?? undefined,
            adminNotes: Object.prototype.hasOwnProperty.call(input.reference, "adminNotes")
              ? nullIfEmpty(input.reference.adminNotes)
              : undefined,
            mappingStatus: input.reference.mappingStatus ?? undefined,
            updatedAt: now,
          })
          .where("id", "=", input.referenceId)
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
            action: `violation_correction_regulation_${input.action}`,
            correctionId: correction.id,
          } as Json,
          status: "SUCCESS",
          timestamp: now,
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent"),
        })
        .execute();
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
