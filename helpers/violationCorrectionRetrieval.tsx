import type { Selectable } from "kysely";
import type { DetectedViolation } from "./complianceDetectorTypes";
import type { Tradeline, ViolationCorrectionEvidence, ViolationRegulationReference } from "./schema";
import {
  getCorrectionEvidence,
  getCorrectionRegulationReferences,
  listFinalizedCorrectionPatterns,
  summarizeRegulationReference,
} from "./violationCorrectionManager";
import {
  sanitizeComplianceNeutralText,
  type ViolationCorrectionAction,
} from "./violationCorrectionValidation";

type PatternCorrection = Awaited<ReturnType<typeof listFinalizedCorrectionPatterns>>[number];
type CorrectionEvidenceForMatch = Pick<Selectable<ViolationCorrectionEvidence>, "fieldName">[];

export type AdminCorrectionMatchKind =
  | "same_tradeline_exact_category"
  | "same_account_exact_field"
  | "same_account_exact_identity";

export interface AdminCorrectionMatchResult {
  applies: boolean;
  kind: AdminCorrectionMatchKind | null;
  reason: string;
}

export interface AdminCorrectionPatternForMatch {
  id: number;
  tradelineId: number;
  correctionAction: string;
  correctedViolationType: string | null;
  correctedSummary?: string | null;
  originalViolationCategory?: string | null;
  patternCreditorId?: number | null;
  patternBureauId?: number | null;
  patternAccountNumber?: string | null;
}

export interface TradelineForAdminCorrectionMatch {
  id: number;
  creditorId?: number | null;
  bureauId?: number | null;
  accountNumber?: string | null;
}

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

function normalizeCategory(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeFieldName(value: unknown): string | null {
  const normalized = normalizePhrase(value).replace(/\s+/g, "");
  return normalized || null;
}

function normalizeAccountNumber(value: unknown): string | null {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (
    !normalized ||
    [
      "unknown",
      "notreported",
      "notprovided",
      "notprovidedbybureau",
      "notavailable",
      "na",
      "n/a",
    ].includes(normalized)
  ) {
    return null;
  }

  return normalized;
}

function correctionCategoryMatches(
  correction: AdminCorrectionPatternForMatch,
  violation: DetectedViolation,
): boolean {
  const category = normalizeCategory(violation.violationCategory);
  if (!category) return false;

  return (
    normalizeCategory(correction.correctedViolationType) === category ||
    normalizeCategory(correction.originalViolationCategory) === category
  );
}

function violationFieldNames(violation: DetectedViolation): Set<string> {
  const details = getTechnicalDetails(violation);
  const rawFields = [
    details.fieldName,
    details.field,
    details.matchedField,
    details.evidenceLink && typeof details.evidenceLink === "object"
      ? (details.evidenceLink as Record<string, unknown>).fieldName
      : null,
    ...(Array.isArray(details.sourceFields) ? details.sourceFields : []),
    ...(details.deterministicRule &&
    typeof details.deterministicRule === "object" &&
    Array.isArray((details.deterministicRule as Record<string, unknown>).sourceFields)
      ? (details.deterministicRule as { sourceFields: unknown[] }).sourceFields
      : []),
  ];

  return new Set(
    rawFields
      .map(normalizeFieldName)
      .filter((field): field is string => Boolean(field)),
  );
}

function correctionEvidenceFieldNames(evidence: CorrectionEvidenceForMatch): Set<string> {
  return new Set(
    evidence
      .map((entry) => normalizeFieldName(entry.fieldName))
      .filter((field): field is string => Boolean(field)),
  );
}

function hasExactFieldEvidenceMatch(
  correctionEvidence: CorrectionEvidenceForMatch,
  violation: DetectedViolation,
): boolean {
  const correctionFields = correctionEvidenceFieldNames(correctionEvidence);
  if (correctionFields.size === 0) return false;

  const fields = violationFieldNames(violation);
  for (const field of fields) {
    if (correctionFields.has(field)) return true;
  }

  return false;
}

function hasExactAccountIdentity(
  correction: AdminCorrectionPatternForMatch,
  tradeline: TradelineForAdminCorrectionMatch,
): boolean {
  const correctionAccount = normalizeAccountNumber(correction.patternAccountNumber);
  const tradelineAccount = normalizeAccountNumber(tradeline.accountNumber);
  if (!correctionAccount || !tradelineAccount || correctionAccount !== tradelineAccount) {
    return false;
  }

  if (!correction.patternCreditorId || !tradeline.creditorId) return false;
  if (Number(correction.patternCreditorId) !== Number(tradeline.creditorId)) return false;

  if (correction.patternBureauId && tradeline.bureauId) {
    return Number(correction.patternBureauId) === Number(tradeline.bureauId);
  }

  return true;
}

export function getDeterministicAdminCorrectionMatch(
  correction: AdminCorrectionPatternForMatch,
  correctionEvidence: CorrectionEvidenceForMatch,
  violation: DetectedViolation,
  tradeline: TradelineForAdminCorrectionMatch,
): AdminCorrectionMatchResult {
  if (!correctionCategoryMatches(correction, violation)) {
    return {
      applies: false,
      kind: null,
      reason: "category_mismatch",
    };
  }

  if (Number(correction.tradelineId) === Number(tradeline.id)) {
    return {
      applies: true,
      kind: "same_tradeline_exact_category",
      reason: "same_tradeline_and_exact_violation_category",
    };
  }

  if (
    hasExactAccountIdentity(correction, tradeline) &&
    hasExactFieldEvidenceMatch(correctionEvidence, violation)
  ) {
    return {
      applies: true,
      kind: "same_account_exact_field",
      reason: "same_creditor_account_bureau_and_exact_evidence_field",
    };
  }

  return {
    applies: false,
    kind: null,
    reason: "no_exact_admin_truth_scope",
  };
}

function getDeterministicMissedCorrectionMatch(
  correction: AdminCorrectionPatternForMatch,
  tradeline: TradelineForAdminCorrectionMatch,
): AdminCorrectionMatchResult {
  if (Number(correction.tradelineId) === Number(tradeline.id)) {
    return {
      applies: true,
      kind: "same_tradeline_exact_category",
      reason: "same_tradeline_false_negative_correction",
    };
  }

  if (hasExactAccountIdentity(correction, tradeline)) {
    return {
      applies: true,
      kind: "same_account_exact_identity",
      reason: "same_creditor_account_bureau_false_negative_correction",
    };
  }

  return {
    applies: false,
    kind: null,
    reason: "no_exact_admin_truth_scope",
  };
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
  confidence: number,
  match: AdminCorrectionMatchResult,
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
      adminTruthMatchKind: match.kind,
      adminTruthMatchReason: match.reason,
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

    const evidenceByCorrectionId = new Map<number, CorrectionEvidenceForMatch>();
    await Promise.all(
      corrections.map(async (correction) => {
        evidenceByCorrectionId.set(correction.id, await getCorrectionEvidence(correction.id));
      }),
    );

    const output: DetectedViolation[] = [];

    for (const violation of violations) {
      const matches = corrections
        .map((correction) => ({
          correction,
          match: getDeterministicAdminCorrectionMatch(
            correction,
            evidenceByCorrectionId.get(correction.id) ?? [],
            violation,
            tradeline,
          ),
        }))
        .filter((entry) => entry.match.applies);

      const sameTradelineRejection = matches.find(
        ({ correction }) =>
          correction.tradelineId === tradeline.id &&
          REJECTING_ACTIONS.has(correction.correctionAction as ViolationCorrectionAction)
      );
      if (sameTradelineRejection) continue;

      const canonicalEntry = matches.find(({ correction }) =>
        POSITIVE_ACTIONS.has(correction.correctionAction as ViolationCorrectionAction)
      );

      let nextViolation = violation;
      if (canonicalEntry) {
        const { correction: canonical, match } = canonicalEntry;
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
            adminTruthMatchKind: match.kind,
            adminTruthMatchReason: match.reason,
            correctionAgreementBoost: matches.length,
          },
        };

        nextViolation = await enrichWithRegulationReferences(nextViolation, canonical);
      }

      output.push(nextViolation);
    }

    const existingCategories = new Set(output.map((violation) => violation.violationCategory));
    const missedCanonicalCorrections = corrections
      .map((correction) => ({
        correction,
        match: getDeterministicMissedCorrectionMatch(correction, tradeline),
      }))
      .filter(({ correction, match }) => {
        const action = correction.correctionAction as ViolationCorrectionAction;
        return (
          match.applies &&
          POSITIVE_ACTIONS.has(action) &&
          correction.correctedViolationType &&
          !existingCategories.has(correction.correctedViolationType as DetectedViolation["violationCategory"]) &&
          (correction.originalViolationId === null || correction.trainingLabel === "false_negative")
        );
      });

    for (const { correction, match } of missedCanonicalCorrections) {
      const sameTradeline = correction.tradelineId === tradeline.id;
      const confidence =
        correction.correctedConfidence === null
          ? sameTradeline
            ? 88
            : 74
          : Number(correction.correctedConfidence);
      let inferred = buildCanonicalViolationFromCorrection(correction, tradeline, confidence, match);
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
