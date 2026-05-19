import { regulationRegistry } from "./regulationRegistry";
import type {
  BureauResponseChannel,
  BureauResponseDocumentType,
  BureauResponseStatus,
  Json,
  ViolationCategory,
} from "./schema";

export const RESPONSE_CLASSIFIER_RULE_ID = "response-document-classifier-v1" as const;
export const RESPONSE_CLASSIFIER_PARSER_VERSION = "response-document-parser-2026-05-19" as const;
export const RESPONSE_CLASSIFIER_CONFIDENCE_THRESHOLD = 0.8;

export type ResponseClassification =
  | "verified_deleted"
  | "updated"
  | "remains"
  | "frivolous"
  | "unable_to_verify"
  | "duplicate"
  | "suspicious_non_compliant"
  | "unknown_manual_review";

export type ResponseProcessingStatus = "completed" | "manual_review" | "dead_letter" | "failed" | "skipped";
export type ResponseExtractionSource = "deterministic" | "ai_fallback" | "manual_admin_review";

export type ResponseProcessingRelationshipContext = {
  userId: number;
  packetId: number | null;
  disputePacketFindingId: number | null;
  findingOutcomeId: number | null;
  comparisonRunId: number | null;
  bureauId: number | null;
  agencyId: number | null;
  tradelineId: number | null;
  violationId: number | null;
};

export type ResponseClassificationInput = {
  responseEventId?: number;
  responseChannel: BureauResponseChannel;
  responseDocumentType: BureauResponseDocumentType;
  responseStatus?: BureauResponseStatus;
  responseReceivedAt: Date | string;
  responseSource: string | null;
  responseSubject: string | null;
  responseSenderDomain: string | null;
  responseReferenceId: string | null;
  responseSummary: string | null;
  normalizedResponseHash: string | null;
  attachmentEvidenceId?: number | null;
  evidenceAttachmentId?: number | null;
  rawArtifactMetadata?: Record<string, Json>;
  normalizedResponseMetadata?: Record<string, Json>;
  relationships: ResponseProcessingRelationshipContext;
};

export type ResponseFieldProvenance = {
  field: string;
  sourceField: string;
  evidenceType: "response_metadata" | "response_summary" | "response_relationship" | "artifact_metadata";
  responseEventId: number | null;
  attachmentEvidenceId: number | null;
  evidenceAttachmentId: number | null;
  valueHash: string | null;
  confidence: number;
};

export type ResponseRationale = {
  code: string;
  message: string;
  sourceField: string;
  confidence: number;
  regulationCategory?: ViolationCategory;
};

export type ResponseRegulationReference = {
  category: ViolationCategory;
  regulationId: string;
  title: string;
  statute: string;
  citation: string;
  supportLevel?: string;
  sourceQuality?: string;
};

export type DeterministicResponseExtraction = {
  responseReceivedAt: string;
  responseChannel: BureauResponseChannel;
  responseDocumentType: BureauResponseDocumentType;
  responseStatus: BureauResponseStatus;
  responseSource: string;
  responseSubjectPresent: boolean;
  responseSummaryPresent: boolean;
  responseSenderDomainPresent: boolean;
  responseReferencePresent: boolean;
  attachmentEvidenceId: number | null;
  evidenceAttachmentId: number | null;
  linkedPacketId: number | null;
  linkedViolationId: number | null;
  linkedTradelineId: number | null;
  classifierSignals: string[];
};

export type ResponseProcessingResult = {
  processingKind: "deterministic_response_classification";
  processingStatus: ResponseProcessingStatus;
  extractionSource: ResponseExtractionSource;
  classifierRuleId: typeof RESPONSE_CLASSIFIER_RULE_ID;
  parserVersion: typeof RESPONSE_CLASSIFIER_PARSER_VERSION;
  classification: ResponseClassification;
  classificationConfidence: number;
  confidenceThreshold: typeof RESPONSE_CLASSIFIER_CONFIDENCE_THRESHOLD;
  requiresManualReview: boolean;
  uncertaintyCodes: string[];
  deterministicExtraction: DeterministicResponseExtraction;
  fieldProvenance: ResponseFieldProvenance[];
  rationale: ResponseRationale[];
  regulationReferences: ResponseRegulationReference[];
  readinessImpact: {
    readinessGateMutated: false;
    readinessRegression: boolean;
    notes: string;
  };
  violationImpact: {
    violationTruthMutated: false;
    linkedViolationId: number | null;
    notes: string;
  };
  idempotencyKey: string;
  normalizedResponseHash: string | null;
  originalEvidenceHash: string | null;
  fallbackRequested: boolean;
  fallbackAllowed: boolean;
  fallbackReason: string | null;
  deadLetterReason: string | null;
};

type RuleMatch = {
  id: string;
  classification: ResponseClassification;
  confidence: number;
  signals: string[];
  rationale: ResponseRationale[];
  manualReview?: boolean;
  uncertaintyCodes?: string[];
  regulationCategories?: ViolationCategory[];
};

const RULES: Array<{
  id: string;
  classification: ResponseClassification;
  confidence: number;
  patterns: RegExp[];
  excludePatterns?: RegExp[];
  message: string;
  sourceField: string;
  manualReview?: boolean;
  uncertaintyCodes?: string[];
  regulationCategories?: ViolationCategory[];
}> = [
  {
    id: "response-duplicate",
    classification: "duplicate",
    confidence: 0.88,
    patterns: [
      /\bduplicate\b/,
      /\balready (?:investigated|reviewed|submitted)\b/,
      /\bpreviously investigated\b/,
      /\bsame dispute\b/,
    ],
    message: "Response indicates the sender treated the item as a duplicate or previously handled dispute.",
    sourceField: "responseSummary",
    manualReview: true,
    uncertaintyCodes: ["DUPLICATE_RESPONSE_REQUIRES_REVIEW"],
    regulationCategories: ["RESPONSE_INCOMPLETE"],
  },
  {
    id: "response-frivolous",
    classification: "frivolous",
    confidence: 0.87,
    patterns: [
      /\bfrivolous\b/,
      /\birrelevant\b/,
      /\bwill not investigate\b/,
      /\bdeclin(?:e|ed|ing) to investigate\b/,
      /\brefus(?:e|ed|ing) to investigate\b/,
      /\binsufficient basis\b/,
    ],
    message: "Response indicates a frivolous or investigation refusal position.",
    sourceField: "responseSummary",
    manualReview: true,
    uncertaintyCodes: ["FRIVOLOUS_RESPONSE_REQUIRES_REVIEW"],
    regulationCategories: ["RESPONSE_INCOMPLETE"],
  },
  {
    id: "response-unable-to-verify",
    classification: "unable_to_verify",
    confidence: 0.9,
    patterns: [
      /\bunable to verify\b/,
      /\bcannot verify\b/,
      /\bcould not verify\b/,
      /\bnot verified\b/,
      /\bnot able to verify\b/,
      /\bunable to validate\b/,
    ],
    message: "Response states the item could not be verified.",
    sourceField: "responseSummary",
  },
  {
    id: "response-deleted",
    classification: "verified_deleted",
    confidence: 0.9,
    patterns: [
      /\bdelete(?:d|tion)?\b/,
      /\bremove(?:d|al)?\b/,
      /\bno longer appears\b/,
      /\bwill be (?:deleted|removed)\b/,
    ],
    excludePatterns: [
      /\bnot (?:be )?(?:deleted|removed)\b/,
      /\bwill not be (?:deleted|removed)\b/,
      /\bno (?:deletion|removal)\b/,
      /\bnot (?:eligible|sufficient) for (?:deletion|removal)\b/,
    ],
    message: "Response states the item was deleted or removed.",
    sourceField: "responseSummary",
  },
  {
    id: "response-updated",
    classification: "updated",
    confidence: 0.84,
    patterns: [
      /\bupdate(?:d)?\b/,
      /\bcorrect(?:ed|ion)?\b/,
      /\bmodif(?:y|ied|ication)\b/,
      /\bamend(?:ed|ment)?\b/,
      /\brevis(?:e|ed|ion)\b/,
    ],
    excludePatterns: [
      /\bnot (?:be )?(?:updated|corrected|modified|amended|revised)\b/,
      /\bwill not be (?:updated|corrected|modified|amended|revised)\b/,
      /\bno (?:update|correction|modification|amendment|revision)\b/,
    ],
    message: "Response states the item was updated or corrected.",
    sourceField: "responseSummary",
  },
  {
    id: "response-remains",
    classification: "remains",
    confidence: 0.83,
    patterns: [
      /\bverified as accurate\b/,
      /\baccurate as reported\b/,
      /\bpreviously verified\b/,
      /\bverified\b/,
      /\bconfirmed\b/,
      /\bno change\b/,
      /\bremains\b/,
      /\bwill remain\b/,
      /\bremain(?:s)? as reported\b/,
      /\bremain(?:s)? unchanged\b/,
    ],
    excludePatterns: [
      /\bnot verified\b/,
      /\bunable to verify\b/,
      /\bcannot verify\b/,
      /\bcould not verify\b/,
      /\bnot able to verify\b/,
      /\bverified by you\b/,
    ],
    message: "Response states the item remains verified or unchanged.",
    sourceField: "responseSummary",
    manualReview: true,
    uncertaintyCodes: ["ADVERSE_RESPONSE_REQUIRES_REVIEW"],
  },
  {
    id: "response-suspicious-non-compliant",
    classification: "suspicious_non_compliant",
    confidence: 0.86,
    patterns: [
      /\bno method of verification\b/,
      /\bmethod of verification (?:missing|not provided|unavailable)\b/,
      /\bwithout (?:supporting )?documents?\b/,
      /\bno (?:supporting )?documents?\b/,
      /\bwithout evidence\b/,
      /\bno evidence\b/,
      /\brubber stamp\b/,
      /\bdoes not match\b/,
      /\bwrong account\b/,
      /\bnot enough information\b/,
      /\bunable to locate\b/,
      /\bno reinvestigation\b/,
      /\bwithout reinvestigation\b/,
      /\bautomated verification\b/,
      /\belectronically verified without documents?\b/,
      /\brefus(?:e|ed|ing) to provide (?:the )?method of verification\b/,
      /\bnot required to provide (?:the )?method of verification\b/,
      /\bcontact (?:the )?(?:creditor|furnisher) directly\b/,
      /\bcontacted (?:the )?(?:creditor|furnisher)\b/,
      /\bthird[- ]party authorization (?:is )?(?:missing|required|not provided)\b/,
      /\bauthorization (?:is )?(?:missing|required|not provided)\b/,
    ],
    message: "Response contains a deterministic signal that may require compliance review.",
    sourceField: "responseSummary",
    manualReview: true,
    uncertaintyCodes: ["SUSPICIOUS_RESPONSE_PATTERN"],
    regulationCategories: ["RESPONSE_MOV_MISSING", "RESPONSE_NO_DOCUMENTATION", "INVESTIGATION_RUBBER_STAMP"],
  },
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function stableHash(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function includesArtifactOcrFallback(metadata: Record<string, Json> | undefined): boolean {
  return metadata?.ocrFallbackUsed === true || metadata?.ocrFallbackUsed === "true";
}

const OUTCOME_CLASSIFICATIONS = new Set<ResponseClassification>([
  "verified_deleted",
  "updated",
  "remains",
  "unable_to_verify",
]);

const VAGUE_UPDATE_PATTERN =
  /\b(?:updated|corrected|revised|modified|amended) (?:the )?(?:information|account information|reported information|file|credit file|record|records)\b/;
const FIELD_DETAIL_PATTERN =
  /\b(?:balance|status|date|limit|payment|account number|account no|opened|closed|past due|creditor|furnisher|name|address|amount|rating|remark|late|delinquency|collection)\b/;
const REMAINS_ADVERSE_LANGUAGE_PATTERN =
  /\b(?:will remain|remain(?:s)? as reported|remain(?:s)? unchanged|account remains unchanged|no change)\b/;

function mergeRegulationCategories(matches: RuleMatch[]): ViolationCategory[] {
  return Array.from(new Set(matches.flatMap((match) => match.regulationCategories ?? [])));
}

function collectRuleMatches(text: string): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(text))) continue;
    if (rule.excludePatterns?.some((pattern) => pattern.test(text))) continue;
    matches.push({
      id: rule.id,
      classification: rule.classification,
      confidence: rule.confidence,
      signals: [rule.id],
      rationale: [
        {
          code: rule.id,
          message: rule.message,
          sourceField: rule.sourceField,
          confidence: rule.confidence,
          regulationCategory: rule.regulationCategories?.[0],
        },
      ],
      manualReview: rule.manualReview,
      uncertaintyCodes: rule.uncertaintyCodes,
      regulationCategories: rule.regulationCategories,
    });
  }
  return matches;
}

function combineManualReviewMatch(primary: RuleMatch, matches: RuleMatch[], extraUncertainty: string[]): RuleMatch {
  const signals = Array.from(new Set(matches.flatMap((match) => match.signals)));
  return {
    ...primary,
    signals,
    rationale: matches.flatMap((match) => match.rationale),
    manualReview: true,
    uncertaintyCodes: Array.from(new Set([
      ...(primary.uncertaintyCodes ?? []),
      ...matches.flatMap((match) => match.uncertaintyCodes ?? []),
      ...extraUncertainty,
    ])),
    regulationCategories: mergeRegulationCategories(matches),
  };
}

function contradictoryMatch(matches: RuleMatch[]): RuleMatch {
  return {
    id: "response-contradictory",
    classification: "unknown_manual_review",
    confidence: 0.45,
    signals: Array.from(new Set(matches.flatMap((match) => match.signals))),
    rationale: [
      {
        code: "response-contradictory",
        message: "Response text contains mixed or contradictory deterministic outcome signals and requires manual review.",
        sourceField: "responseSummary",
        confidence: 0.45,
        regulationCategory: "RESPONSE_INCOMPLETE",
      },
      ...matches.flatMap((match) => match.rationale),
    ],
    manualReview: true,
    uncertaintyCodes: ["CONTRADICTORY_RESPONSE_LANGUAGE", "LOW_DETERMINISTIC_CONFIDENCE"],
    regulationCategories: ["RESPONSE_INCOMPLETE"],
  };
}

function vagueUpdatedMatch(match: RuleMatch): RuleMatch {
  return {
    ...match,
    confidence: 0.62,
    manualReview: true,
    rationale: [
      {
        code: "response-updated-without-field-detail",
        message: "Response says information was updated but does not provide enough field-level detail for automatic outcome handling.",
        sourceField: "responseSummary",
        confidence: 0.62,
        regulationCategory: "RESPONSE_INCOMPLETE",
      },
      ...match.rationale,
    ],
    uncertaintyCodes: Array.from(new Set([
      ...(match.uncertaintyCodes ?? []),
      "UPDATED_WITHOUT_FIELD_DETAIL",
    ])),
    regulationCategories: Array.from(new Set([
      ...(match.regulationCategories ?? []),
      "RESPONSE_INCOMPLETE" as ViolationCategory,
    ])),
  };
}

function selectRuleMatch(matches: RuleMatch[], text: string): RuleMatch | null {
  if (matches.length === 0) return null;

  const suspicious = matches.find((match) => match.classification === "suspicious_non_compliant");
  if (suspicious) {
    return combineManualReviewMatch(suspicious, matches, matches.length > 1 ? ["MIXED_RESPONSE_SIGNALS"] : []);
  }

  const procedural = matches.find((match) => match.classification === "duplicate" || match.classification === "frivolous");
  if (procedural) {
    return combineManualReviewMatch(procedural, matches, matches.length > 1 ? ["MIXED_RESPONSE_SIGNALS"] : []);
  }

  const outcomeMatches = matches.filter((match) => OUTCOME_CLASSIFICATIONS.has(match.classification));
  const unableToVerify = outcomeMatches.find((match) => match.classification === "unable_to_verify");
  if (unableToVerify && REMAINS_ADVERSE_LANGUAGE_PATTERN.test(text)) {
    return contradictoryMatch([
      unableToVerify,
      {
        id: "response-remains-conflicting-language",
        classification: "remains",
        confidence: 0.83,
        signals: ["response-remains-conflicting-language"],
        rationale: [
          {
            code: "response-remains-conflicting-language",
            message: "Response also states the item will remain or remain unchanged.",
            sourceField: "responseSummary",
            confidence: 0.83,
            regulationCategory: "RESPONSE_INCOMPLETE",
          },
        ],
        manualReview: true,
        uncertaintyCodes: ["ADVERSE_RESPONSE_REQUIRES_REVIEW"],
        regulationCategories: ["RESPONSE_INCOMPLETE"],
      },
    ]);
  }
  const outcomeClassifications = new Set(outcomeMatches.map((match) => match.classification));
  if (outcomeClassifications.size > 1) {
    return contradictoryMatch(outcomeMatches);
  }

  const selected = matches[0];
  if (
    selected.classification === "updated" &&
    VAGUE_UPDATE_PATTERN.test(text) &&
    !FIELD_DETAIL_PATTERN.test(text)
  ) {
    return vagueUpdatedMatch(selected);
  }

  return selected;
}

function regulationReferences(categories: ViolationCategory[] = []): ResponseRegulationReference[] {
  const seen = new Set<string>();
  const references: ResponseRegulationReference[] = [];

  for (const category of categories) {
    for (const entry of regulationRegistry.getRegulationsForViolationCategory(category)) {
      const key = `${category}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({
        category,
        regulationId: entry.id,
        title: entry.shortLabel,
        statute: entry.statute,
        citation: entry.citation,
        supportLevel: entry.supportLevel,
        sourceQuality: entry.sourceQuality,
      });
    }
  }

  return references.slice(0, 8);
}

function provenance(input: ResponseClassificationInput, confidence: number): ResponseFieldProvenance[] {
  const responseEventId = input.responseEventId ?? null;
  const attachmentEvidenceId = input.attachmentEvidenceId ?? null;
  const evidenceAttachmentId = input.evidenceAttachmentId ?? null;
  return [
    {
      field: "classification",
      sourceField: "responseSummary",
      evidenceType: "response_summary",
      responseEventId,
      attachmentEvidenceId,
      evidenceAttachmentId,
      valueHash: stableHash(input.responseSummary),
      confidence,
    },
    {
      field: "responseReceivedAt",
      sourceField: "responseReceivedAt",
      evidenceType: "response_metadata",
      responseEventId,
      attachmentEvidenceId,
      evidenceAttachmentId,
      valueHash: stableHash(toIsoString(input.responseReceivedAt)),
      confidence: 1,
    },
    {
      field: "packetLink",
      sourceField: "packetId",
      evidenceType: "response_relationship",
      responseEventId,
      attachmentEvidenceId,
      evidenceAttachmentId,
      valueHash: stableHash(input.relationships.packetId),
      confidence: input.relationships.packetId ? 1 : 0,
    },
    {
      field: "violationLink",
      sourceField: "violationId",
      evidenceType: "response_relationship",
      responseEventId,
      attachmentEvidenceId,
      evidenceAttachmentId,
      valueHash: stableHash(input.relationships.violationId),
      confidence: input.relationships.violationId ? 1 : 0,
    },
  ];
}

export function classifyResponseDocument(input: ResponseClassificationInput): ResponseProcessingResult {
  const searchableText = normalizeText([
    input.responseSubject,
    input.responseSummary,
  ].filter(Boolean).join(" "));

  const match = searchableText ? selectRuleMatch(collectRuleMatches(searchableText), searchableText) : null;
  const defaultRationale: ResponseRationale = {
    code: "response-unknown",
    message: "Response metadata does not contain enough deterministic signal for a confident classification.",
    sourceField: "responseSummary",
    confidence: 0.35,
  };
  const classification = match?.classification ?? "unknown_manual_review";
  const confidence = match?.confidence ?? 0.35;
  const isLowConfidence = confidence < RESPONSE_CLASSIFIER_CONFIDENCE_THRESHOLD;
  const requiresManualReview =
    classification === "unknown_manual_review" ||
    match?.manualReview === true ||
    isLowConfidence;
  const uncertaintyCodes = Array.from(new Set([
    ...(match?.uncertaintyCodes ?? []),
    ...(isLowConfidence ? ["LOW_DETERMINISTIC_CONFIDENCE"] : []),
    ...(input.relationships.packetId ? [] : ["NO_PACKET_LINK"]),
    ...(input.relationships.violationId ? [] : ["NO_VIOLATION_LINK"]),
    ...(input.relationships.tradelineId ? [] : ["NO_TRADELINE_LINK"]),
    ...(includesArtifactOcrFallback(input.rawArtifactMetadata) ? ["OCR_FALLBACK_USED"] : []),
  ]));
  const processingStatus: ResponseProcessingStatus =
    uncertaintyCodes.includes("NO_PACKET_LINK") && uncertaintyCodes.includes("NO_VIOLATION_LINK")
      ? "manual_review"
      : requiresManualReview
        ? "manual_review"
        : "completed";
  const classifierSignals = match?.signals ?? ["response-unknown"];
  const rationale = match?.rationale ?? [defaultRationale];
  const categories = match?.regulationCategories ?? (classification === "unknown_manual_review" ? ["RESPONSE_INCOMPLETE"] : []);

  return {
    processingKind: "deterministic_response_classification",
    processingStatus,
    extractionSource: "deterministic",
    classifierRuleId: RESPONSE_CLASSIFIER_RULE_ID,
    parserVersion: RESPONSE_CLASSIFIER_PARSER_VERSION,
    classification,
    classificationConfidence: confidence,
    confidenceThreshold: RESPONSE_CLASSIFIER_CONFIDENCE_THRESHOLD,
    requiresManualReview,
    uncertaintyCodes,
    deterministicExtraction: {
      responseReceivedAt: toIsoString(input.responseReceivedAt),
      responseChannel: input.responseChannel,
      responseDocumentType: input.responseDocumentType,
      responseStatus: input.responseStatus ?? "received",
      responseSource: input.responseSource ?? "manual_record",
      responseSubjectPresent: Boolean(input.responseSubject),
      responseSummaryPresent: Boolean(input.responseSummary),
      responseSenderDomainPresent: Boolean(input.responseSenderDomain),
      responseReferencePresent: Boolean(input.responseReferenceId),
      attachmentEvidenceId: input.attachmentEvidenceId ?? null,
      evidenceAttachmentId: input.evidenceAttachmentId ?? null,
      linkedPacketId: input.relationships.packetId,
      linkedViolationId: input.relationships.violationId,
      linkedTradelineId: input.relationships.tradelineId,
      classifierSignals,
    },
    fieldProvenance: provenance(input, confidence),
    rationale,
    regulationReferences: regulationReferences(categories),
    readinessImpact: {
      readinessGateMutated: false,
      readinessRegression: false,
      notes: requiresManualReview
        ? "Response intake is recorded for review only; packet readiness remains fail-closed until deterministic downstream evidence supports a change."
        : "Response intake is recorded without changing packet readiness gates.",
    },
    violationImpact: {
      violationTruthMutated: false,
      linkedViolationId: input.relationships.violationId,
      notes: "Response classification does not create, dismiss, verify, or rewrite violation truth.",
    },
    idempotencyKey: [
      input.relationships.userId,
      input.relationships.packetId ?? "packet-null",
      input.relationships.violationId ?? "violation-null",
      input.normalizedResponseHash ?? stableHash(searchableText) ?? "response-null",
      RESPONSE_CLASSIFIER_PARSER_VERSION,
    ].join(":"),
    normalizedResponseHash: input.normalizedResponseHash,
    originalEvidenceHash: input.normalizedResponseHash,
    fallbackRequested: false,
    fallbackAllowed: false,
    fallbackReason: "AI fallback disabled: deterministic confidence gating requires explicit operator-approved fallback integration.",
    deadLetterReason: null,
  };
}
