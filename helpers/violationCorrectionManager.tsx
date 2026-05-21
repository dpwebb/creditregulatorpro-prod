import type { Selectable } from "kysely";
import { db } from "./db";
import type {
  CreditorObligationTest,
  Json,
  Tradeline,
  ViolationCorrection,
  ViolationCorrectionEvidence,
  ViolationRegulationReference,
} from "./schema";
import {
  buildExpectedCorrectionOutput,
  deriveTrainingLabel,
  sanitizeComplianceNeutralText,
  validateCorrectionFinalizeRequirements,
  type ViolationCorrectionAction,
  type ViolationTrainingLabel,
} from "./violationCorrectionValidation";
import { BusinessRuleError } from "./endpointErrorHandler";
import {
  listTradelineIdsFromArtifactLinks,
  mergeTradelineArtifactLinks,
  type TradelineArtifactLink,
} from "./violationCorrectionArtifactLinks";

type CorrectionRow = Selectable<ViolationCorrection>;
type EvidenceRow = Selectable<ViolationCorrectionEvidence>;
type RegulationReferenceRow = Selectable<ViolationRegulationReference>;
type DbExecutor = Pick<typeof db, "selectFrom" | "insertInto" | "updateTable">;

export type FinalizeCorrectionAuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type { TradelineArtifactLink } from "./violationCorrectionArtifactLinks";

function toJsonSafe<T>(value: T): T {
  const seen = new WeakSet<object>();

  const visit = (input: any): any => {
    if (typeof input === "bigint") return input.toString();
    if (input === null || input === undefined) return input;
    if (input instanceof Date) return input;
    if (typeof input !== "object") return input;
    if (Array.isArray(input)) return input.map((item) => visit(item));
    if (seen.has(input)) return null;

    seen.add(input);
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      output[key] = visit(val);
    }
    return output;
  };

  return visit(value);
}

export function jsonSafe<T>(value: T): T {
  return toJsonSafe(value);
}

function uniquePositiveIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
}

export async function listTradelineArtifactLinks(reportArtifactIds: number[]): Promise<TradelineArtifactLink[]> {
  const artifactIds = uniquePositiveIds(reportArtifactIds);
  if (artifactIds.length === 0) return [];

  const [presenceRows, directRows] = await Promise.all([
    db
      .selectFrom("tradelineArtifactPresence")
      .select(["tradelineId", "reportArtifactId"])
      .where("reportArtifactId", "in", artifactIds)
      .execute(),
    db
      .selectFrom("tradeline")
      .select(["id as tradelineId", "reportArtifactId"])
      .where("reportArtifactId", "in", artifactIds)
      .execute(),
  ]);

  return mergeTradelineArtifactLinks(presenceRows, directRows);
}

export async function listTradelineIdsForReportArtifact(reportArtifactId: number): Promise<number[]> {
  const links = await listTradelineArtifactLinks([reportArtifactId]);
  return listTradelineIdsFromArtifactLinks(links, reportArtifactId);
}

export async function requireCorrection(
  correctionId: number,
  database: DbExecutor = db
): Promise<CorrectionRow> {
  const correction = await database
    .selectFrom("violationCorrection")
    .selectAll()
    .where("id", "=", correctionId)
    .executeTakeFirst();

  if (!correction) {
    throw new BusinessRuleError("Correction not found", 404);
  }

  return correction;
}

export async function requireExtractionRun(runId: number, database: DbExecutor = db) {
  const run = await database
    .selectFrom("passExtraction")
    .innerJoin("reportArtifact", "reportArtifact.id", "passExtraction.reportArtifactId")
    .select([
      "passExtraction.id",
      "passExtraction.reportArtifactId",
      "passExtraction.pass",
      "passExtraction.status",
      "passExtraction.channelGuess",
      "passExtraction.channelConfidence",
      "passExtraction.completedAt",
      "passExtraction.createdAt",
      "passExtraction.rawEvidence",
      "passExtraction.bureauContext",
      "passExtraction.qualityNotes",
      "reportArtifact.userId",
      "reportArtifact.reportDate",
      "reportArtifact.createdAt as reportCreatedAt",
    ])
    .where("passExtraction.id", "=", runId)
    .executeTakeFirst();

  if (!run) {
    throw new BusinessRuleError("Extraction run not found", 404);
  }

  return run;
}

export async function requireTradelineForRun(tradelineId: number, extractionRunId: number) {
  const run = await requireExtractionRun(extractionRunId);
  const tradeline = await db
    .selectFrom("tradeline")
    .select(["id", "reportArtifactId"])
    .where("id", "=", tradelineId)
    .executeTakeFirst();

  if (!tradeline) {
    throw new BusinessRuleError("Tradeline not found", 404);
  }

  const directlyLinked = Number(tradeline.reportArtifactId) === Number(run.reportArtifactId);
  const presenceLink = directlyLinked
    ? null
    : await db
        .selectFrom("tradelineArtifactPresence")
        .select("id")
        .where("tradelineId", "=", tradeline.id)
        .where("reportArtifactId", "=", run.reportArtifactId)
        .executeTakeFirst();

  if (!directlyLinked && !presenceLink) {
    throw new BusinessRuleError("Tradeline is not linked to this extraction run", 400);
  }

  return { run, tradeline };
}

export async function requireViolationForTradeline(
  violationId: number | null | undefined,
  tradelineId: number,
  database: DbExecutor = db
): Promise<Selectable<CreditorObligationTest> | null> {
  if (!violationId) return null;

  const violation = await database
    .selectFrom("creditorObligationTest")
    .selectAll()
    .where("id", "=", violationId)
    .executeTakeFirst();

  if (!violation) {
    throw new BusinessRuleError("Original issue not found", 404);
  }

  if (Number(violation.tradelineId) !== Number(tradelineId)) {
    throw new BusinessRuleError("Original issue is not linked to this tradeline", 400);
  }

  return violation;
}

export async function getCorrectionEvidence(
  correctionId: number,
  database: DbExecutor = db
): Promise<EvidenceRow[]> {
  return await database
    .selectFrom("violationCorrectionEvidence")
    .selectAll()
    .where("correctionId", "=", correctionId)
    .orderBy("createdAt", "asc")
    .execute();
}

export async function getCorrectionRegulationReferences(
  correctionId: number,
  database: DbExecutor = db
): Promise<RegulationReferenceRow[]> {
  return await database
    .selectFrom("violationRegulationReference")
    .selectAll()
    .where("correctionId", "=", correctionId)
    .orderBy("createdAt", "asc")
    .execute();
}

async function getTrainingExample(correctionId: number, database: DbExecutor = db) {
  return await database
    .selectFrom("violationTrainingExample")
    .selectAll()
    .where("correctionId", "=", correctionId)
    .executeTakeFirst();
}

export async function getCorrectionDetail(correctionId: number, database: DbExecutor = db) {
  const correction = await requireCorrection(correctionId, database);
  const [evidence, regulationReferences, trainingExample] = await Promise.all([
    getCorrectionEvidence(correctionId, database),
    getCorrectionRegulationReferences(correctionId, database),
    getTrainingExample(correctionId, database),
  ]);

  return {
    ...correction,
    evidence,
    regulationReferences,
    trainingExample: trainingExample ?? null,
  };
}

export function normalizeCorrectionTextFields(input: {
  correctedSummary?: string | null;
  correctedExplanation?: string | null;
  correctionReason?: string | null;
  adminNotes?: string | null;
}) {
  return {
    correctedSummary: sanitizeComplianceNeutralText(input.correctedSummary),
    correctedExplanation: sanitizeComplianceNeutralText(input.correctedExplanation),
    correctionReason: sanitizeComplianceNeutralText(input.correctionReason),
    adminNotes: sanitizeComplianceNeutralText(input.adminNotes),
  };
}

export async function buildTrainingExamplePayload(
  correctionId: number,
  database: DbExecutor = db,
  correctionOverride?: CorrectionRow
) {
  const correction = correctionOverride ?? await requireCorrection(correctionId, database);
  const [run, tradeline, originalViolation, evidence, regulationReferences] = await Promise.all([
    requireExtractionRun(correction.extractionRunId, database),
    database
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .selectAll("tradeline")
      .select(["creditor.name as creditorName", "bureau.name as bureauName"])
      .where("tradeline.id", "=", correction.tradelineId)
      .executeTakeFirst(),
    correction.originalViolationId
      ? database
          .selectFrom("creditorObligationTest")
          .selectAll()
          .where("id", "=", correction.originalViolationId)
          .executeTakeFirst()
      : Promise.resolve(null),
    getCorrectionEvidence(correctionId, database),
    getCorrectionRegulationReferences(correctionId, database),
  ]);

  if (!tradeline) {
    throw new BusinessRuleError("Tradeline not found", 404);
  }

  const label =
    (correction.trainingLabel as ViolationTrainingLabel | null) ??
    deriveTrainingLabel({
      action: correction.correctionAction as ViolationCorrectionAction,
      originalViolationId: correction.originalViolationId,
      correctedViolationType: correction.correctedViolationType,
      originalViolationType: originalViolation?.violationCategory ?? null,
    });

  const inputContext = {
    extractionRun: run,
    tradeline,
    originalViolation: originalViolation ?? null,
    evidence,
    adminNotes: correction.adminNotes,
  } as unknown as Json;

  const expectedOutput = buildExpectedCorrectionOutput({
    correctionId: correction.id,
    action: correction.correctionAction as ViolationCorrectionAction,
    correctedViolationType: correction.correctedViolationType,
    correctedSummary: correction.correctedSummary,
    correctedExplanation: correction.correctedExplanation,
    correctedSeverity: correction.correctedSeverity,
    correctedConfidence:
      correction.correctedConfidence === null ? null : Number(correction.correctedConfidence),
    status: correction.status,
  });

  const regulationMapping = regulationReferences
    .filter((ref) => ref.mappingStatus !== "incorrect")
    .map((ref) => ({
      jurisdiction: ref.jurisdiction,
      country: ref.country,
      provinceOrTerritory: ref.provinceOrTerritory,
      regulatorOrStandardBody: ref.regulatorOrStandardBody,
      regulationName: ref.regulationName,
      statuteOrRuleName: ref.statuteOrRuleName,
      sectionNumber: ref.sectionNumber,
      subsectionNumber: ref.subsectionNumber,
      citationSource: ref.citationSource,
      citationUrl: ref.citationUrl,
      citationConfidence: ref.citationConfidence,
      adminVerifiedCitation: ref.adminVerifiedCitation,
    })) as Json;

  return {
    correction,
    label,
    inputContextJson: jsonSafe(inputContext),
    expectedOutputJson: expectedOutput,
    regulationMappingJson: jsonSafe(regulationMapping),
  };
}

export async function upsertTrainingExampleForCorrection(
  correctionId: number,
  database: DbExecutor = db,
  correctionOverride?: CorrectionRow
) {
  const payload = await buildTrainingExamplePayload(correctionId, database, correctionOverride);
  const now = new Date();

  const existing = await getTrainingExample(correctionId, database);
  if (existing) {
    return await database
      .updateTable("violationTrainingExample")
      .set({
        inputContextJson: payload.inputContextJson,
        expectedOutputJson: payload.expectedOutputJson,
        regulationMappingJson: payload.regulationMappingJson,
        label: payload.label,
        useForTraining: payload.correction.useForTraining,
        updatedAt: now,
      })
      .where("correctionId", "=", correctionId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  return await database
    .insertInto("violationTrainingExample")
    .values({
      correctionId,
      inputContextJson: payload.inputContextJson,
      expectedOutputJson: payload.expectedOutputJson,
      regulationMappingJson: payload.regulationMappingJson,
      label: payload.label,
      useForTraining: payload.correction.useForTraining,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function recordFinalizationFailure(input: {
  correction: CorrectionRow | null;
  correctionId: number;
  adminUserId: number;
  error: unknown;
  audit?: FinalizeCorrectionAuditContext;
}) {
  try {
    await db
      .insertInto("auditLog")
      .values({
        actionType: "UPDATE",
        entityType: "TRADELINE",
        entityId: input.correction?.tradelineId ?? null,
        userId: input.adminUserId,
        details: {
          action: "violation_correction_finalization_failed",
          correctionId: input.correctionId,
          finalizationStatus: "failed",
          finalizedStatusApplied: false,
          rollbackExpected: true,
          error: input.error instanceof Error ? input.error.message : String(input.error),
        } as Json,
        status: "FAILURE",
        timestamp: new Date(),
        ipAddress: input.audit?.ipAddress ?? null,
        userAgent: input.audit?.userAgent ?? null,
      })
      .execute();
  } catch (auditError) {
    console.warn(JSON.stringify({
      level: "WARN",
      component: "violationCorrectionManager",
      message: "Failed to write violation correction finalization failure audit",
      correctionId: input.correctionId,
      error: auditError instanceof Error ? auditError.message : String(auditError),
      timestamp: new Date().toISOString(),
    }));
  }
}

export async function finalizeCorrection(
  correctionId: number,
  adminUserId: number,
  options: { audit?: FinalizeCorrectionAuditContext } = {}
) {
  let attemptedCorrection: CorrectionRow | null = null;

  try {
    return await db.transaction().execute(async (trx) => {
      const correction = await requireCorrection(correctionId, trx);
      attemptedCorrection = correction;
      const [evidence, regulationReferences, originalViolation] = await Promise.all([
        getCorrectionEvidence(correctionId, trx),
        getCorrectionRegulationReferences(correctionId, trx),
        requireViolationForTradeline(correction.originalViolationId, correction.tradelineId, trx),
      ]);

      const activeRegulationReferenceCount = regulationReferences.filter(
        (ref) => ref.mappingStatus !== "incorrect"
      ).length;

      const errors = validateCorrectionFinalizeRequirements({
        action: correction.correctionAction as ViolationCorrectionAction,
        originalViolationId: correction.originalViolationId,
        trainingNoteOnly: correction.trainingNoteOnly,
        evidenceCount: evidence.length,
        activeRegulationReferenceCount,
      });

      if (errors.length > 0) {
        throw new BusinessRuleError(errors.join(" "), 400);
      }

      const label =
        (correction.trainingLabel as ViolationTrainingLabel | null) ??
        deriveTrainingLabel({
          action: correction.correctionAction as ViolationCorrectionAction,
          originalViolationId: correction.originalViolationId,
          correctedViolationType: correction.correctedViolationType,
          originalViolationType: originalViolation?.violationCategory ?? null,
        });

      const now = new Date();
      const finalizationMetadata = {
        status: "finalized",
        trainingLabel: label,
        finalizedByAdminId: adminUserId,
        finalReviewedAt: now,
        updatedAt: now,
      };

      await trx
        .updateTable("violationCorrection")
        .set(finalizationMetadata)
        .where("id", "=", correctionId)
        .execute();

      const finalizedCorrection = {
        ...correction,
        ...finalizationMetadata,
      } as CorrectionRow;
      const trainingExample = await upsertTrainingExampleForCorrection(
        correctionId,
        trx,
        finalizedCorrection,
      );

      await trx
        .insertInto("auditLog")
        .values({
          actionType: "UPDATE",
          entityType: "TRADELINE",
          entityId: correction.tradelineId,
          userId: adminUserId,
          details: {
            action: "violation_correction_finalized",
            correctionId,
            trainingExampleId: trainingExample.id,
            finalizationStatus: "complete",
          } as Json,
          status: "SUCCESS",
          timestamp: now,
          ipAddress: options.audit?.ipAddress ?? null,
          userAgent: options.audit?.userAgent ?? null,
        })
        .execute();

      const detail = await getCorrectionDetail(correctionId, trx);

      return {
        correction: detail,
        trainingExample,
      };
    });
  } catch (error) {
    if (!(error instanceof BusinessRuleError)) {
      await recordFinalizationFailure({
        correction: attemptedCorrection,
        correctionId,
        adminUserId,
        audit: options.audit,
        error,
      });
    }
    throw error;
  }
}

export function summarizeRegulationReference(ref: Pick<
  Selectable<ViolationRegulationReference>,
  "regulationName" | "statuteOrRuleName" | "sectionNumber" | "subsectionNumber"
>) {
  const section = [ref.sectionNumber, ref.subsectionNumber].filter(Boolean).join(" ");
  return `${ref.regulationName}: ${ref.statuteOrRuleName}${section ? ` ${section}` : ""}`;
}

export async function getAdminRegulationBasisForCorrection(correctionId: number): Promise<string | null> {
  const refs = await getCorrectionRegulationReferences(correctionId);
  const active = refs.filter((ref) => ref.mappingStatus !== "incorrect");
  if (active.length === 0) return null;

  return active
    .slice(0, 3)
    .map((ref) => `requires review under ${summarizeRegulationReference(ref)}`)
    .join("; ");
}

export async function listFinalizedCorrectionPatterns(input: {
  tradeline: Selectable<Tradeline>;
  violationCategories?: string[];
  limit?: number;
}) {
  const categories = input.violationCategories?.filter(Boolean) ?? [];

  let query = db
    .selectFrom("violationCorrection")
    .leftJoin("tradeline", "tradeline.id", "violationCorrection.tradelineId")
    .leftJoin(
      "creditorObligationTest as originalViolation",
      "originalViolation.id",
      "violationCorrection.originalViolationId",
    )
    .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
    .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
    .selectAll("violationCorrection")
    .select([
      "originalViolation.violationCategory as originalViolationCategory",
      "tradeline.creditorId as patternCreditorId",
      "tradeline.bureauId as patternBureauId",
      "tradeline.accountNumber as patternAccountNumber",
      "creditor.name as patternCreditorName",
      "bureau.name as patternBureauName",
    ])
    .where("violationCorrection.status", "=", "finalized")
    .where("violationCorrection.trainingNoteOnly", "=", false)
    .where((eb) => {
      const clauses = [eb("violationCorrection.tradelineId", "=", input.tradeline.id)];
      if (input.tradeline.creditorId) {
        clauses.push(eb("tradeline.creditorId", "=", input.tradeline.creditorId));
      }
      if (input.tradeline.bureauId) {
        clauses.push(eb("tradeline.bureauId", "=", input.tradeline.bureauId));
      }
      return eb.or(clauses);
    })
    .orderBy("violationCorrection.finalReviewedAt", "desc")
    .limit(input.limit ?? 50);

  if (categories.length > 0) {
    query = query.where((eb) =>
      eb.or([
        eb("violationCorrection.correctedViolationType", "in", categories),
        eb("violationCorrection.originalViolationId", "in",
          db
            .selectFrom("creditorObligationTest")
            .select("id")
            .where("violationCategory", "in", categories as any)
        ),
      ])
    ) as typeof query;
  }

  return await query.execute();
}
