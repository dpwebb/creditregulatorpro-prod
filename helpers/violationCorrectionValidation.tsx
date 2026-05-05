import type { Json, ViolationCategory } from "./schema";

export const CORRECTION_ACTIONS = [
  "confirmed",
  "corrected",
  "rejected",
  "irrelevant",
  "duplicate",
  "insufficient_evidence",
] as const;

export type ViolationCorrectionAction = (typeof CORRECTION_ACTIONS)[number];

export const CORRECTION_STATUSES = [
  "draft",
  "in_review",
  "finalized",
] as const;

export type ViolationCorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const TRAINING_LABELS = [
  "false_positive",
  "false_negative",
  "misclassified",
  "weak_evidence",
  "irrelevant",
  "confirmed_good",
] as const;

export type ViolationTrainingLabel = (typeof TRAINING_LABELS)[number];

export const REGULATION_JURISDICTIONS = [
  "federal",
  "provincial",
  "bureau_standard",
  "internal_rule",
] as const;

export type ViolationRegulationJurisdiction = (typeof REGULATION_JURISDICTIONS)[number];

const GUARDED_TEXT_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\billegal(?:ly)?\b/gi, replacement: "requires review" },
  { pattern: /\bliab(?:le|ility)\b/gi, replacement: "requires review" },
  { pattern: /\bviolation\s+proven\b/gi, replacement: "issue requiring review" },
  { pattern: /\bbreach\s+of\s+law\b/gi, replacement: "issue associated with applicable requirements" },
  { pattern: /\bproves?\s+(?:a\s+)?violation\b/gi, replacement: "indicates a potential reporting issue" },
  { pattern: /\bviolates?\b/gi, replacement: "relates to" },
  { pattern: /\bmust\b/gi, replacement: "requires review to determine whether it should" },
];

export function sanitizeComplianceNeutralText(value: string | null | undefined): string | null {
  if (value == null) return null;

  let output = value;
  for (const rule of GUARDED_TEXT_REPLACEMENTS) {
    output = output.replace(rule.pattern, rule.replacement);
  }

  output = output
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  return output.length > 0 ? output : null;
}

export function deriveTrainingLabel(input: {
  action: ViolationCorrectionAction;
  originalViolationId: number | null | undefined;
  correctedViolationType?: string | null;
  originalViolationType?: string | null;
}): ViolationTrainingLabel {
  if (!input.originalViolationId) return "false_negative";

  switch (input.action) {
    case "confirmed":
      return "confirmed_good";
    case "rejected":
      return "false_positive";
    case "irrelevant":
      return "irrelevant";
    case "duplicate":
      return "false_positive";
    case "insufficient_evidence":
      return "weak_evidence";
    case "corrected":
      return input.correctedViolationType &&
        input.originalViolationType &&
        input.correctedViolationType !== input.originalViolationType
        ? "misclassified"
        : "confirmed_good";
    default:
      return "confirmed_good";
  }
}

export function isCanonicalViolationAction(action: ViolationCorrectionAction, originalViolationId?: number | null): boolean {
  if (!originalViolationId) return true;
  return action === "confirmed" || action === "corrected";
}

export function validateCorrectionFinalizeRequirements(input: {
  action: ViolationCorrectionAction;
  originalViolationId?: number | null;
  trainingNoteOnly?: boolean | null;
  evidenceCount: number;
  activeRegulationReferenceCount: number;
}): string[] {
  if (input.trainingNoteOnly) return [];

  const errors: string[] = [];

  if (input.evidenceCount < 1) {
    errors.push("At least one evidence link is required before final review.");
  }

  if (
    isCanonicalViolationAction(input.action, input.originalViolationId ?? null) &&
    input.activeRegulationReferenceCount < 1
  ) {
    errors.push("At least one regulation or reporting-standard reference is required for a finalized issue.");
  }

  return errors;
}

export function buildExpectedCorrectionOutput(input: {
  correctionId: number;
  action: ViolationCorrectionAction;
  correctedViolationType: string | null;
  correctedSummary: string | null;
  correctedExplanation: string | null;
  correctedSeverity: string | null;
  correctedConfidence: number | null;
  status: string;
}): Json {
  return {
    correctionId: input.correctionId,
    canonicalAction: input.action,
    canonicalStatus: input.status,
    violationType: input.correctedViolationType,
    summary: sanitizeComplianceNeutralText(input.correctedSummary),
    explanation: sanitizeComplianceNeutralText(input.correctedExplanation),
    severity: input.correctedSeverity,
    confidence: input.correctedConfidence,
  } as Json;
}

export function normalizeViolationCategory(value: string | null | undefined): ViolationCategory | null {
  return value ? (value as ViolationCategory) : null;
}
