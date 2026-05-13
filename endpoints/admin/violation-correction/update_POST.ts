import { db } from "../../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { Json } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import {
  getCorrectionDetail,
  normalizeCorrectionTextFields,
  requireCorrection,
  requireViolationForTradeline,
  upsertTrainingExampleForCorrection,
} from "../../../helpers/violationCorrectionManager";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { deriveTrainingLabel } from "../../../helpers/violationCorrectionValidation";
import { schema, OutputType } from "./update_POST.schema";

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

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
    const current = await requireCorrection(input.id);
    if (input.status === "finalized" && current.status !== "finalized") {
      throw new BusinessRuleError(
        "Use the final review endpoint to finalize a violation correction.",
        400,
      );
    }
    const originalViolation = await requireViolationForTradeline(
      current.originalViolationId,
      current.tradelineId,
    );

    const neutralText = normalizeCorrectionTextFields(input);
    const action = input.correctionAction ?? current.correctionAction;
    const correctedViolationType =
      hasOwn(input, "correctedViolationType")
        ? nullIfEmpty(input.correctedViolationType)
        : current.correctedViolationType;
    const label =
      input.trainingLabel ??
      current.trainingLabel ??
      deriveTrainingLabel({
        action: action as any,
        originalViolationId: current.originalViolationId,
        correctedViolationType,
        originalViolationType: originalViolation?.violationCategory ?? null,
      });

    const now = new Date();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("violationCorrection")
        .set({
          correctionAction: action,
          correctedViolationType,
          correctedSummary: hasOwn(input, "correctedSummary")
            ? neutralText.correctedSummary
            : current.correctedSummary,
          correctedExplanation: hasOwn(input, "correctedExplanation")
            ? neutralText.correctedExplanation
            : current.correctedExplanation,
          correctedSeverity: hasOwn(input, "correctedSeverity")
            ? nullIfEmpty(input.correctedSeverity)
            : current.correctedSeverity,
          correctedConfidence: hasOwn(input, "correctedConfidence")
            ? input.correctedConfidence ?? null
            : current.correctedConfidence,
          correctionReason: hasOwn(input, "correctionReason")
            ? neutralText.correctionReason
            : current.correctionReason,
          adminNotes: hasOwn(input, "adminNotes") ? neutralText.adminNotes : current.adminNotes,
          status: input.status ?? current.status,
          trainingLabel: label,
          trainingNoteOnly: input.trainingNoteOnly ?? current.trainingNoteOnly,
          useForTraining: input.useForTraining ?? current.useForTraining,
          updatedAt: now,
        })
        .where("id", "=", input.id)
        .execute();

      await trx
        .insertInto("auditLog")
        .values({
          actionType: "UPDATE",
          entityType: "TRADELINE",
          entityId: current.tradelineId,
          userId: user.id,
          details: {
            action: "violation_correction_updated",
            correctionId: current.id,
            extractionRunId: current.extractionRunId,
            originalViolationId: current.originalViolationId,
          } as Json,
          status: "SUCCESS",
          timestamp: now,
          ipAddress: request.headers.get("x-forwarded-for") || "unknown",
          userAgent: request.headers.get("user-agent"),
        })
        .execute();
    });

    const updated = await getCorrectionDetail(input.id);
    if (updated.status === "finalized") {
      await upsertTrainingExampleForCorrection(input.id);
    }

    const output: OutputType = {
      correction: await getCorrectionDetail(input.id),
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
