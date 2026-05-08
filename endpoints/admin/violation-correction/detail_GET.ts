import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { authorityIssueLabel, getLegalAuthorityById } from "../../../helpers/legalAuthorityRegistry";
import { regulationRegistry, type RegulationEntry } from "../../../helpers/regulationRegistry";
import type { CanadianProvince, ViolationCategory } from "../../../helpers/schema";
import { isAdmin } from "../../../helpers/userRoleUtils";
import { ensureViolationCorrectionSchema } from "../../../helpers/violationCorrectionSchema";
import {
  jsonSafe,
  listTradelineIdsForReportArtifact,
  requireExtractionRun,
} from "../../../helpers/violationCorrectionManager";
import { schema, OutputType } from "./detail_GET.schema";
import type { SuggestedRegulationReference, ViolationReviewCorrectionDetail } from "./common";

function idKey(value: number | string | null | undefined): string | null {
  return value == null ? null : String(value);
}

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
      const authority = getLegalAuthorityById(entry.id);
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
        authorityIssueLabel: authority ? authorityIssueLabel(authority) : "Mapped internal reference",
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
    const siblingRuns = await db
      .selectFrom("passExtraction")
      .select("id")
      .where("reportArtifactId", "=", run.reportArtifactId)
      .execute();
    const correctionRunIds = Array.from(new Set([run.id, ...siblingRuns.map((sibling) => sibling.id)]));

    const linkedTradelineIds = await listTradelineIdsForReportArtifact(run.reportArtifactId);
    const tradelines = linkedTradelineIds.length > 0
      ? await db
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
          .where("tradeline.id", "in", linkedTradelineIds)
          .orderBy("creditor.name", "asc")
          .orderBy("tradeline.id", "asc")
          .execute()
      : [];

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
        .where("extractionRunId", "in", correctionRunIds)
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

    const evidenceByCorrection = new Map<string, typeof evidence>();
    for (const row of evidence) {
      const key = idKey(row.correctionId);
      if (!key) continue;
      evidenceByCorrection.set(key, [...(evidenceByCorrection.get(key) ?? []), row]);
    }

    const referencesByCorrection = new Map<string, typeof regulationReferences>();
    for (const row of regulationReferences) {
      const key = idKey(row.correctionId);
      if (!key) continue;
      referencesByCorrection.set(key, [...(referencesByCorrection.get(key) ?? []), row]);
    }

    const trainingByCorrection = new Map(
      trainingExamples.flatMap((example) => {
        const key = idKey(example.correctionId);
        return key ? [[key, example] as const] : [];
      }),
    );

    const correctionDetails = corrections.map((correction): ViolationReviewCorrectionDetail => ({
      ...correction,
      evidence: evidenceByCorrection.get(String(correction.id)) ?? [],
      regulationReferences: referencesByCorrection.get(String(correction.id)) ?? [],
      trainingExample: trainingByCorrection.get(String(correction.id)) ?? null,
    }));

    const correctionsByOriginalViolation = new Map<string, ViolationReviewCorrectionDetail[]>();
    const manualCorrectionsByTradeline = new Map<string, ViolationReviewCorrectionDetail[]>();
    for (const correction of correctionDetails) {
      const tradelineKey = idKey(correction.tradelineId);
      if (!tradelineKey) continue;

      const originalViolationKey = idKey(correction.originalViolationId);
      if (originalViolationKey) {
        correctionsByOriginalViolation.set(originalViolationKey, [
          ...(correctionsByOriginalViolation.get(originalViolationKey) ?? []),
          correction,
        ]);
      } else {
        manualCorrectionsByTradeline.set(tradelineKey, [
          ...(manualCorrectionsByTradeline.get(tradelineKey) ?? []),
          correction,
        ]);
      }
    }

    const violationsByTradeline = new Map<string, typeof violations>();
    for (const violation of violations) {
      const key = idKey(violation.tradelineId);
      if (!key) continue;
      violationsByTradeline.set(key, [
        ...(violationsByTradeline.get(key) ?? []),
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
        violations: (violationsByTradeline.get(String(tradeline.id)) ?? []).map((violation) => ({
          ...violation,
          suggestedRegulationReferences: suggestedReferencesForViolation(violation.violationCategory),
          corrections: correctionsByOriginalViolation.get(String(violation.id)) ?? [],
        })),
        manualCorrections: manualCorrectionsByTradeline.get(String(tradeline.id)) ?? [],
      })),
    };

    return new Response(JSON.stringify(jsonSafe(output)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
