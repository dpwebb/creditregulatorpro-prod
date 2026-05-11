import { createHash } from "crypto";
import type {
  RegulationCategory,
  RegulationChangeClassification,
} from "./schema";

export const REGULATION_CATEGORIES: RegulationCategory[] = [
  "credit_reporting",
  "collection_activity",
  "dispute_investigation",
  "privacy",
  "identity_verification",
  "stale_reporting",
  "disclosure_requirements",
  "debt_validation",
  "record_accuracy",
  "consumer_access_rights",
];

const AUTHORITATIVE_HOST_SUFFIXES = [
  ".gc.ca",
  ".canada.ca",
  ".gov.bc.ca",
  ".alberta.ca",
  ".ontario.ca",
  ".gnb.ca",
  ".gov.mb.ca",
  ".gov.sk.ca",
  ".novascotia.ca",
  ".princeedwardisland.ca",
  ".assembly.nl.ca",
  ".legisquebec.gouv.qc.ca",
  ".justice.gov.nt.ca",
  ".nunavutlegislation.ca",
  ".laws.yukon.ca",
  ".bclaws.gov.bc.ca",
  ".laws-lois.justice.gc.ca",
  ".priv.gc.ca",
  ".fcac-acfc.gc.ca",
  ".canlii.org",
  ".equifax.ca",
  ".transunion.ca",
];

const DISALLOWED_PROVENANCE_TERMS = [
  "ai generated",
  "ai-generated",
  "chatgpt",
  "gemini",
  "llm",
  "language model",
  "model inferred",
  "inferred by ai",
  "synthetic law",
  "hallucinated",
];

export interface RegulationDraft {
  regulationId: string;
  jurisdiction: string;
  authoritySource: string;
  regulationTitle: string;
  sectionNumber: string;
  subsection?: string | null;
  shortTitle: string;
  fullText: string;
  plainLanguageSummary: string;
  officialSourceUrl: string;
  publicationDate?: Date | string | null;
  effectiveDate?: Date | string | null;
  repealSupersededStatus?: string | null;
  regulationCategory: RegulationCategory;
  tags?: string[];
  citationFormat: string;
  sourceDocumentUrl?: string | null;
}

export interface ExistingRegulationSnapshot {
  id: number;
  regulationId: string;
  regulationTitle: string;
  sectionNumber: string;
  subsection: string | null;
  fullText: string;
  parserSafeNormalizedText: string;
  updateVersion: number;
  officialSourceUrl: string;
}

export interface CandidateClassificationInput {
  candidate: RegulationDraft;
  existing?: ExistingRegulationSnapshot | null;
  possibleDuplicateCount?: number;
}

export interface RegulationDiffReport {
  hasTextChange: boolean;
  summary: string;
  oldSnippet: string | null;
  newSnippet: string | null;
  firstChangedWordIndex: number | null;
  changedWordCount: number;
}

export interface ConfidenceAssessment {
  confidenceScore: number;
  reasons: string[];
  ambiguityReasons: string[];
}

export interface ApprovalSafetyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function compact(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeRegulationText(value: string | null | undefined): string {
  return compact(value)
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

export function parserSafeNormalizeText(value: string | null | undefined): string {
  return normalizeRegulationText(value)
    .replace(/[^a-z0-9\s.,;:()[\]/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashRegulationText(value: string | null | undefined): string {
  return createHash("sha256").update(parserSafeNormalizeText(value)).digest("hex");
}

export function isAuthoritativeSourceUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return AUTHORITATIVE_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
  } catch {
    return false;
  }
}

export function hasDisallowedRegulatoryProvenance(input: Pick<RegulationDraft, "authoritySource" | "officialSourceUrl" | "sourceDocumentUrl">): boolean {
  const provenanceText = [
    input.authoritySource,
    input.officialSourceUrl,
    input.sourceDocumentUrl,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return DISALLOWED_PROVENANCE_TERMS.some((term) => provenanceText.includes(term));
}

export function assessRegulationConfidence(input: RegulationDraft): ConfidenceAssessment {
  const reasons: string[] = [];
  const ambiguityReasons: string[] = [];
  let score = 0;

  if (isAuthoritativeSourceUrl(input.officialSourceUrl)) {
    score += 0.35;
    reasons.push("authoritative HTTPS source URL");
  } else {
    ambiguityReasons.push("official source URL is missing or not on the authoritative-source allowlist");
  }

  if (compact(input.authoritySource).length >= 3) {
    score += 0.15;
    reasons.push("authority/source named");
  } else {
    ambiguityReasons.push("authority/source is missing");
  }

  if (compact(input.fullText).length >= 50) {
    score += 0.2;
    reasons.push("full regulation text supplied");
  } else {
    ambiguityReasons.push("full text is too short to verify");
  }

  if (compact(input.citationFormat).length > 0 && compact(input.sectionNumber).length > 0) {
    score += 0.1;
    reasons.push("citation and section supplied");
  } else {
    ambiguityReasons.push("citation or section is missing");
  }

  if (input.publicationDate || input.effectiveDate) {
    score += 0.1;
    reasons.push("publication or effective date supplied");
  }

  if (REGULATION_CATEGORIES.includes(input.regulationCategory)) {
    score += 0.1;
    reasons.push("recognized regulation category");
  }

  if (hasDisallowedRegulatoryProvenance(input)) {
    score = Math.min(score, 0.2);
    ambiguityReasons.push("source provenance references AI or synthetic legal content");
  }

  return {
    confidenceScore: Number(Math.max(0, Math.min(1, score)).toFixed(2)),
    reasons,
    ambiguityReasons,
  };
}

export function buildRegulationDiff(oldText: string | null | undefined, newText: string | null | undefined): RegulationDiffReport {
  const oldNormalized = parserSafeNormalizeText(oldText);
  const newNormalized = parserSafeNormalizeText(newText);

  if (!oldNormalized && newNormalized) {
    return {
      hasTextChange: true,
      summary: "New regulation text supplied.",
      oldSnippet: null,
      newSnippet: newNormalized.slice(0, 500),
      firstChangedWordIndex: 0,
      changedWordCount: newNormalized.split(/\s+/).filter(Boolean).length,
    };
  }

  if (oldNormalized === newNormalized) {
    return {
      hasTextChange: false,
      summary: "No wording change detected after normalization.",
      oldSnippet: null,
      newSnippet: null,
      firstChangedWordIndex: null,
      changedWordCount: 0,
    };
  }

  const oldWords = oldNormalized.split(/\s+/).filter(Boolean);
  const newWords = newNormalized.split(/\s+/).filter(Boolean);
  let firstChangedWordIndex = 0;

  while (
    firstChangedWordIndex < oldWords.length &&
    firstChangedWordIndex < newWords.length &&
    oldWords[firstChangedWordIndex] === newWords[firstChangedWordIndex]
  ) {
    firstChangedWordIndex++;
  }

  let oldTail = oldWords.length - 1;
  let newTail = newWords.length - 1;
  while (
    oldTail >= firstChangedWordIndex &&
    newTail >= firstChangedWordIndex &&
    oldWords[oldTail] === newWords[newTail]
  ) {
    oldTail--;
    newTail--;
  }

  const oldChanged = oldWords.slice(firstChangedWordIndex, oldTail + 1);
  const newChanged = newWords.slice(firstChangedWordIndex, newTail + 1);
  const changedWordCount = Math.max(oldChanged.length, newChanged.length);

  return {
    hasTextChange: true,
    summary: `Wording changed around word ${firstChangedWordIndex + 1}; approximately ${changedWordCount} word${changedWordCount === 1 ? "" : "s"} changed.`,
    oldSnippet: oldChanged.slice(0, 80).join(" ") || null,
    newSnippet: newChanged.slice(0, 80).join(" ") || null,
    firstChangedWordIndex,
    changedWordCount,
  };
}

export function classifyRegulationCandidate(input: CandidateClassificationInput): RegulationChangeClassification {
  const confidence = assessRegulationConfidence(input.candidate);
  if (confidence.ambiguityReasons.length > 0) {
    return "ambiguous";
  }

  const status = compact(input.candidate.repealSupersededStatus).toLowerCase();
  if (status.includes("repeal") || status.includes("revoked")) {
    return "repealed";
  }

  if (!input.existing) {
    return (input.possibleDuplicateCount ?? 0) > 0 ? "possible_duplicate" : "new";
  }

  const diff = buildRegulationDiff(input.existing.fullText, input.candidate.fullText);
  if (!diff.hasTextChange) {
    return "unchanged";
  }

  return "modified";
}

export function validateRegulationApprovalSafety(input: RegulationDraft & { changeClassification?: RegulationChangeClassification | null }): ApprovalSafetyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const confidence = assessRegulationConfidence(input);

  if (!compact(input.regulationId)) errors.push("regulationId is required");
  if (compact(input.regulationId).toUpperCase().startsWith("SOURCE_CHANGE_")) {
    errors.push("source-scan placeholders must be converted to canonical regulationIds before approval");
  }
  if (!compact(input.jurisdiction)) errors.push("jurisdiction is required");
  if (!compact(input.authoritySource)) errors.push("authority/source is required");
  if (!compact(input.regulationTitle)) errors.push("regulation title is required");
  if (!compact(input.sectionNumber)) errors.push("section number is required");
  if (!compact(input.fullText) || compact(input.fullText).length < 50) errors.push("full text from the source is required before approval");
  if (!compact(input.plainLanguageSummary)) errors.push("plain-language summary is required");
  if (!compact(input.citationFormat)) errors.push("citation format is required");
  if (!REGULATION_CATEGORIES.includes(input.regulationCategory)) errors.push("regulation category is not supported");
  if (!isAuthoritativeSourceUrl(input.officialSourceUrl)) errors.push("official source URL must be authoritative HTTPS source");
  if (hasDisallowedRegulatoryProvenance(input)) errors.push("AI or synthetic legal provenance cannot be approved as regulatory truth");

  if (confidence.confidenceScore < 0.75) {
    warnings.push("confidence score is below the normal approval threshold; manual review notes should explain why this source is acceptable");
  }

  if (input.changeClassification === "ambiguous" || input.changeClassification === "possible_duplicate") {
    warnings.push(`candidate is marked ${input.changeClassification}; approving it requires deliberate admin review`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function stripHtmlToText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
