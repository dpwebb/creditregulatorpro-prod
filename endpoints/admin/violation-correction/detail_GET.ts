import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { regulationRegistry, type RegulationEntry } from "../../../helpers/regulationRegistry";
import type { CanadianProvince, ViolationCategory } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import { jsonSafe, requireExtractionRun } from "../../../helpers/violationCorrectionManager";
import { schema, OutputType } from "./detail_GET.schema";
import type { SuggestedRegulationReference, ViolationReviewCorrectionDetail } from "./common";

function inferJurisdiction(entry: RegulationEntry): SuggestedRegulationReference["jurisdiction"] {
  if (entry.id.startsWith("PIPEDA") || entry.id.startsWith("BIA") || entry.id.startsWith("INVESTIGATION")) {
    return "federal";
  }
  if (entry.id.startsWith("METRO2")) {
    return "bureau_standard";
  }
  return "provincial";
}

function inferProvince(entry: RegulationEntry): CanadianProvince | null {
  const prefix = entry.id.slice(0, 2);
  const provinces: CanadianProvince[] = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
  return provinces.includes(prefix as CanadianProvince) ? (prefix as CanadianProvince) : null;
}

function suggestedReferencesForViolation(category: ViolationCategory | null): SuggestedRegulationReference[] {
  if (!category) return [];

  return regulationRegistry
    .getRegulationsForViolationCategory(category)
    .slice(0, 6)
    .map((entry) => {
      const jurisdiction = inferJurisdiction(entry);
      const province = inferProvince(entry);
      return {
        jurisdiction,
        country: "Canada",
        provinceOrTerritory: province,
        regulatorOrStandardBody:
          jurisdiction === "bureau_standard"
            ? "Credit reporting data standard"
            : jurisdiction === "federal"
              ? "Federal privacy or insolvency framework"
              : "Provincial credit reporting framework",
        regulationName: entry.statute,
        statuteOrRuleName: entry.shortLabel,
        sectionNumber: entry.citation,
        subsectionNumber: null,
        regulationTextExcerpt: entry.description,
        citationUrl: null,
        citationSource: "Internal regulation registry",
        citationConfidence: 0.75,
        adminVerifiedCitation: false,
        adminNotes: null,
        mappingStatus: "active",
      };
    });
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    await ensureViolationCorrectionSchema();

    const url = new URL(request.url);
    const input = schema.parse({
      extractionRunId: url.searchParams.get("extractionRunId"),
    });

    const run = await requireExtractionRun(input.extractionRunId);

    const tradelines = await db
      .selectFrom("tradeline")
      .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
      .leftJoin("bureau", "bureau.id", "tradeline.bureauId")
      .select([
        "tradeline.id",
        "tradeline.accountNumber",
        "tradeline.accountType",
        "tradeline.status",
        "tradeline.sourceText",
        "tradeline.reportArtifactId",
        "tradeline.bureauId",
        "tradeline.creditorId",
        "tradeline.currentBalance",
        "tradeline.balance",
        "tradeline.openedDate",
        "tradeline.lastReportedDate",
        "creditor.name as creditorName",
        "bureau.name as bureauName",
      ])
      .where("tradeline.reportArtifactId", "=", run.reportArtifactId)
      .orderBy("creditor.name", "asc")
      .orderBy("tradeline.id", "asc")
      .execute();

    const tradelineIds = tradelines.map((tradeline) => tradeline.id);
    const [violations, corrections] = await Promise.all([
      tradelineIds.length > 0
        ? db
            .selectFrom("creditorObligationTest")
            .leftJoin("creditor", "creditor.id", "creditorObligationTest.creditorId")
            .selectAll("creditorObligationTest")
            .select("creditor.name as creditorName")
            .where("tradelineId", "in", tradelineIds)
            .orderBy("detectedAt", "desc")
            .orderBy("createdAt", "desc")
            .execute()
        : Promise.resolve([]),
      db
        .selectFrom("violationCorrection")
        .selectAll()
        .where("extractionRunId", "=", input.extractionRunId)
        .orderBy("updatedAt", "desc")
        .execute(),
    ]);

    const correctionIds = corrections.map((correction) => correction.id);
    const [evidence, regulationReferences, trainingExamples] = await Promise.all([
      correctionIds.length > 0
        ? db
            .selectFrom("violationCorrectionEvidence")
            .selectAll()
            .where("correctionId", "in", correctionIds)
            .orderBy("createdAt", "asc")
            .execute()
        : Promise.resolve([]),
      correctionIds.length > 0
        ? db
            .selectFrom("violationRegulationReference")
            .selectAll()
            .where("correctionId", "in", correctionIds)
            .orderBy("createdAt", "asc")
            .execute()
        : Promise.resolve([]),
      correctionIds.length > 0
        ? db
            .selectFrom("violationTrainingExample")
            .selectAll()
            .where("correctionId", "in", correctionIds)
            .execute()
        : Promise.resolve([]),
    ]);

    const evidenceByCorrection = new Map<number, typeof evidence>();
    for (const row of evidence) {
      evidenceByCorrection.set(row.correctionId, [...(evidenceByCorrection.get(row.correctionId) ?? []), row]);
    }

    const referencesByCorrection = new Map<number, typeof regulationReferences>();
    for (const row of regulationReferences) {
      if (row.correctionId == null) continue;
      referencesByCorrection.set(row.correctionId, [...(referencesByCorrection.get(row.correctionId) ?? []), row]);
    }

    const trainingByCorrection = new Map(trainingExamples.map((example) => [example.correctionId, example] as const));

    const correctionDetails = corrections.map((correction): ViolationReviewCorrectionDetail => ({
      ...correction,
      evidence: evidenceByCorrection.get(correction.id) ?? [],
      regulationReferences: referencesByCorrection.get(correction.id) ?? [],
      trainingExample: trainingByCorrection.get(correction.id) ?? null,
    }));

    const correctionsByOriginalViolation = new Map<number, ViolationReviewCorrectionDetail[]>();
    const manualCorrectionsByTradeline = new Map<number, ViolationReviewCorrectionDetail[]>();
    for (const correction of correctionDetails) {
      if (correction.originalViolationId) {
        correctionsByOriginalViolation.set(correction.originalViolationId, [
          ...(correctionsByOriginalViolation.get(correction.originalViolationId) ?? []),
          correction,
        ]);
      } else {
        manualCorrectionsByTradeline.set(correction.tradelineId, [
          ...(manualCorrectionsByTradeline.get(correction.tradelineId) ?? []),
          correction,
        ]);
      }
    }

    const violationsByTradeline = new Map<number, typeof violations>();
    for (const violation of violations) {
      if (violation.tradelineId == null) continue;
      violationsByTradeline.set(violation.tradelineId, [
        ...(violationsByTradeline.get(violation.tradelineId) ?? []),
        violation,
      ]);
    }

    const output: OutputType = {
      run: {
        id: run.id,
        reportArtifactId: run.reportArtifactId,
        pass: run.pass,
        status: run.status,
        channelGuess: run.channelGuess,
        channelConfidence: run.channelConfidence,
        reportDate: run.reportDate,
        reportCreatedAt: run.reportCreatedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
        userId: run.userId,
        rawEvidence: run.rawEvidence,
        bureauContext: run.bureauContext,
        qualityNotes: run.qualityNotes,
        tradelineCount: tradelines.length,
        violationCount: violations.length,
        correctionCount: corrections.length,
        finalizedCorrectionCount: corrections.filter((correction) => correction.status === "finalized").length,
        needsReviewCount: Math.max(0, violations.length - corrections.filter((correction) => correction.status === "finalized").length),
      },
      tradelines: tradelines.map((tradeline) => ({
        ...tradeline,
        violations: (violationsByTradeline.get(tradeline.id) ?? []).map((violation) => ({
          ...violation,
          suggestedRegulationReferences: suggestedReferencesForViolation(violation.violationCategory),
          corrections: correctionsByOriginalViolation.get(violation.id) ?? [],
        })),
        manualCorrections: manualCorrectionsByTradeline.get(tradeline.id) ?? [],
      })),
    };

    return new Response(JSON.stringify(jsonSafe(output)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
