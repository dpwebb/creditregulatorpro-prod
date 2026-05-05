import type { Selectable } from "kysely";
import type { DetectedViolation } from "./complianceDetectorTypes";
import type { Tradeline, ViolationRegulationReference } from "./schema";
import {
  getCorrectionRegulationReferences,
  listFinalizedCorrectionPatterns,
  summarizeRegulationReference,
} from "./violationCorrectionManager";
import {
  sanitizeComplianceNeutralText,
  type ViolationCorrectionAction,
} from "./violationCorrectionValidation";

type PatternCorrection = Awaited<ReturnType<typeof listFinalizedCorrectionPatterns>>[number];

const REJECTING_ACTIONS = new Set<ViolationCorrectionAction>([
  "rejected",
  "irrelevant",
  "duplicate",
  "insufficient_evidence",
]);

const POSITIVE_ACTIONS = new Set<ViolationCorrectionAction>([
  "confirmed",
  "corrected",
]);

function getTechnicalDetails(violation: DetectedViolation): Record<string, any> {
  return violation.technicalDetails && typeof violation.technicalDetails === "object"
    ? violation.technicalDetails
    : {};
}

function normalizePhrase(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = new Set(normalizePhrase(left).split(/\s+/).filter((token) => token.length > 2));
  const rightTokens = new Set(normalizePhrase(right).split(/\s+/).filter((token) => token.length > 2));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function correctionMatchesViolation(
  correction: PatternCorrection,
  violation: DetectedViolation,
  tradeline: Selectable<Tradeline>
): boolean {
  const details = getTechnicalDetails(violation);
  const sameTradeline = correction.tradelineId === tradeline.id;
  const sameCategory =
    correction.correctedViolationType === violation.violationCategory ||
    normalizePhrase(correction.correctedSummary).includes(normalizePhrase(violation.violationCategory));

  if (sameTradeline && sameCategory) return true;

  const sameCreditor = tradeline.creditorId && correction.patternCreditorId === tradeline.creditorId;
  const sameBureau = tradeline.bureauId && correction.patternBureauId === tradeline.bureauId;
  const fieldName = details.fieldName ?? details.field ?? details.issue ?? "";
  const correctionReason = [
    correction.correctionReason,
    correction.correctedSummary,
    correction.correctedExplanation,
  ]
    .filter(Boolean)
    .join(" ");

  return Boolean(
    sameCategory &&
      (sameCreditor || sameBureau) &&
      (tokenOverlap(fieldName, correctionReason) >= 0.25 ||
        tokenOverlap(violation.userExplanation, correctionReason) >= 0.2)
  );
}

function referencesToTechnicalDetails(refs: Selectable<ViolationRegulationReference>[]) {
  return refs
    .filter((ref) => ref.mappingStatus !== "incorrect")
    .map((ref) => ({
      id: ref.id,
      jurisdiction: ref.jurisdiction,
      country: ref.country,
      provinceOrTerritory: ref.provinceOrTerritory,
      regulationName: ref.regulationName,
      statuteOrRuleName: ref.statuteOrRuleName,
      sectionNumber: ref.sectionNumber,
      subsectionNumber: ref.subsectionNumber,
      citationSource: ref.citationSource,
      adminVerifiedCitation: ref.adminVerifiedCitation,
      basis: `requires review under ${summarizeRegulationReference(ref)}`,
    }));
}

async function enrichWithRegulationReferences(
  violation: DetectedViolation,
  correction: PatternCorrection
): Promise<DetectedViolation> {
  const refs = await getCorrectionRegulationReferences(correction.id);
  const adminRegulationReferences = referencesToTechnicalDetails(refs);
  if (adminRegulationReferences.length === 0) return violation;

  return {
    ...violation,
    technicalDetails: {
      ...violation.technicalDetails,
      adminCorrectionReferenceIds: [
        ...new Set([
          ...((violation.technicalDetails?.adminCorrectionReferenceIds as number[] | undefined) ?? []),
          correction.id,
        ]),
      ],
      adminRegulationReferences,
      regulationIds: adminRegulationReferences.map((ref) => ref.id),
    },
  };
}

function buildCanonicalViolationFromCorrection(
  correction: PatternCorrection,
  tradeline: Selectable<Tradeline>,
  confidence: number
): DetectedViolation | null {
  if (!correction.correctedViolationType) return null;

  const explanation =
    sanitizeComplianceNeutralText(correction.correctedExplanation) ??
    sanitizeComplianceNeutralText(correction.correctedSummary) ??
    "The reviewed correction indicates a possible reporting issue associated with this account.";

  return {
    violationCategory: correction.correctedViolationType as DetectedViolation["violationCategory"],
    severity: (correction.correctedSeverity || "WARNING") as DetectedViolation["severity"],
    confidenceScore: Math.max(0, Math.min(100, confidence)),
    userExplanation: explanation,
    technicalDetails: {
      tradelineId: tradeline.id,
      reportArtifactId: tradeline.reportArtifactId ?? null,
      adminCorrectionReferenceIds: [correction.id],
      inferredFromAdminCorrection: correction.tradelineId !== tradeline.id,
      originalCorrectionTradelineId: correction.tradelineId,
      correctionReason: correction.correctionReason,
    },
    recommendedAction:
      "Review the cited report data, source documentation, and mapped reference before deciding whether a correction request is appropriate.",
    tradelineId: tradeline.id,
  };
}

export async function applyViolationCorrectionTruthLayer(
  violations: DetectedViolation[],
  tradeline: Selectable<Tradeline>
): Promise<DetectedViolation[]> {
  try {
    const categories = violations.map((violation) => violation.violationCategory);
    const corrections = await listFinalizedCorrectionPatterns({
      tradeline,
      violationCategories: categories,
      limit: 75,
    });

    if (corrections.length === 0) return violations;

    const output: DetectedViolation[] = [];

    for (const violation of violations) {
      const matches = corrections.filter((correction) =>
        correctionMatchesViolation(correction, violation, tradeline)
      );

      const sameTradelineRejection = matches.find(
        (correction) =>
          correction.tradelineId === tradeline.id &&
          REJECTING_ACTIONS.has(correction.correctionAction as ViolationCorrectionAction)
      );
      if (sameTradelineRejection) continue;

      const canonical = matches.find((correction) =>
        POSITIVE_ACTIONS.has(correction.correctionAction as ViolationCorrectionAction)
      );

      let nextViolation = violation;
      if (canonical) {
        const correctedConfidence =
          canonical.correctedConfidence === null ? null : Number(canonical.correctedConfidence);

        nextViolation = {
          ...nextViolation,
          violationCategory:
            (canonical.correctedViolationType as DetectedViolation["violationCategory"]) ||
            nextViolation.violationCategory,
          severity:
            (canonical.correctedSeverity as DetectedViolation["severity"] | null) ||
            nextViolation.severity,
          confidenceScore: Math.max(
            nextViolation.confidenceScore,
            correctedConfidence ?? Math.min(100, nextViolation.confidenceScore + 8)
          ),
          userExplanation:
            sanitizeComplianceNeutralText(canonical.correctedExplanation) ||
            sanitizeComplianceNeutralText(canonical.correctedSummary) ||
            nextViolation.userExplanation,
          technicalDetails: {
            ...nextViolation.technicalDetails,
            adminCorrectionReferenceIds: [
              ...new Set([
                ...((nextViolation.technicalDetails?.adminCorrectionReferenceIds as number[] | undefined) ?? []),
                canonical.id,
              ]),
            ],
            adminTruthApplied: true,
            correctionAgreementBoost: matches.length,
          },
        };

        nextViolation = await enrichWithRegulationReferences(nextViolation, canonical);
      }

      output.push(nextViolation);
    }

    const existingCategories = new Set(output.map((violation) => violation.violationCategory));
    const missedCanonicalCorrections = corrections.filter((correction) => {
      const action = correction.correctionAction as ViolationCorrectionAction;
      return (
        POSITIVE_ACTIONS.has(action) &&
        correction.correctedViolationType &&
        !existingCategories.has(correction.correctedViolationType as DetectedViolation["violationCategory"]) &&
        (correction.originalViolationId === null || correction.trainingLabel === "false_negative")
      );
    });

    for (const correction of missedCanonicalCorrections) {
      const sameTradeline = correction.tradelineId === tradeline.id;
      const confidence =
        correction.correctedConfidence === null
          ? sameTradeline
            ? 88
            : 74
          : Number(correction.correctedConfidence);
      let inferred = buildCanonicalViolationFromCorrection(correction, tradeline, confidence);
      if (!inferred) continue;
      inferred = await enrichWithRegulationReferences(inferred, correction);
      output.push(inferred);
    }

    return output;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : null;
    if (code === "42P01" || code === "42703") {
      return violations;
    }
    console.warn("[violationCorrectionRetrieval] correction truth layer skipped", error);
    return violations;
  }
}
