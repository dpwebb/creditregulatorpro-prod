export const PARSER_CONFIDENCE_PACKET_READY_MIN = 85;
export const PARSER_CONFIDENCE_USER_REVIEW_MIN = 70;

export type ParserConfidenceGateStatus =
  | "confirmed"
  | "needs_user_review"
  | "parser_uncertain"
  | "unknown";

export type ViolationPacketGateBlockerCode =
  | "parser_uncertain"
  | "violation_needs_review";

export type ViolationEvidenceQualityStatus =
  | "strong"
  | "partial"
  | "missing"
  | "parser_uncertain";

export interface ParserConfidenceGate {
  deterministic: true;
  ruleId: "parser-confidence-packet-gate-v1";
  status: ParserConfidenceGateStatus;
  packetReady: boolean;
  confidenceScore: number | null;
  requiresManualReview: boolean;
  reasonCodes: string[];
  message: string;
}

export interface ViolationPacketConfidenceGate {
  deterministic: true;
  ruleId: "violation-packet-confidence-gate-v1";
  status: ParserConfidenceGateStatus;
  packetReady: boolean;
  blockerCode: ViolationPacketGateBlockerCode | null;
  confidenceScore: number | null;
  message: string;
}

export interface ViolationEvidenceQuality {
  deterministic: true;
  ruleId: "violation-evidence-quality-v1";
  status: ViolationEvidenceQualityStatus;
  hasMeaningfulEvidence: boolean;
  hasEvidenceLocation: boolean;
  hasEvidenceId: boolean;
  hasSourceLocator: boolean;
  hasTextSnippet: boolean;
  reasonCodes: string[];
  message: string;
}

type ParserIssue = {
  severity: string | null;
  code: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeParserConfidenceScore(value: unknown): number | null {
  if (value == null) return null;

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return null;

  const normalized = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function parseParserIssues(value: unknown): ParserIssue[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((issue) => {
      if (!isRecord(issue)) return null;
      const severity = typeof issue.severity === "string"
        ? issue.severity.toUpperCase()
        : null;
      const code = typeof issue.code === "string" && issue.code.trim()
        ? issue.code.trim()
        : null;

      return { severity, code };
    })
    .filter((issue): issue is ParserIssue => issue !== null);
}

function createParserGate(input: {
  status: ParserConfidenceGateStatus;
  packetReady: boolean;
  confidenceScore: number | null;
  requiresManualReview: boolean;
  reasonCodes: string[];
  message: string;
}): ParserConfidenceGate {
  return {
    deterministic: true,
    ruleId: "parser-confidence-packet-gate-v1",
    ...input,
  };
}

export function evaluateParserConfidenceGateFromArtifactData(
  data: unknown,
): ParserConfidenceGate {
  const record = isRecord(data) ? data : null;
  const parserQuality = isRecord(record?.parserQuality) ? record.parserQuality : null;
  const confidenceScore = normalizeParserConfidenceScore(
    parserQuality?.confidenceScore ??
      record?.extractionConfidence ??
      record?.parseConfidence ??
      record?.ocrConfidence,
  );
  const issues = parseParserIssues(parserQuality?.issues);
  const issueCodes = issues
    .map((issue) => issue.code)
    .filter((code): code is string => Boolean(code));
  const hasParserError = issues.some((issue) => issue.severity === "ERROR");
  const requiresManualReview = parserQuality?.requiresManualReview === true;

  if (!parserQuality && confidenceScore === null) {
    return createParserGate({
      status: "unknown",
      packetReady: true,
      confidenceScore: null,
      requiresManualReview: false,
      reasonCodes: ["PARSER_CONFIDENCE_METADATA_MISSING"],
      message: "No parser confidence metadata was available for this source report.",
    });
  }

  const reasonCodes = [...issueCodes];
  if (requiresManualReview) reasonCodes.push("PARSER_REQUIRES_MANUAL_REVIEW");
  if (hasParserError) reasonCodes.push("PARSER_ERROR_ISSUE");
  if (confidenceScore === null) reasonCodes.push("PARSER_CONFIDENCE_MISSING");

  if (
    requiresManualReview ||
    hasParserError ||
    confidenceScore === null ||
    confidenceScore < PARSER_CONFIDENCE_USER_REVIEW_MIN
  ) {
    if (confidenceScore !== null && confidenceScore < PARSER_CONFIDENCE_USER_REVIEW_MIN) {
      reasonCodes.push("PARSER_CONFIDENCE_BELOW_REVIEW_FLOOR");
    }

    return createParserGate({
      status: "parser_uncertain",
      packetReady: false,
      confidenceScore,
      requiresManualReview,
      reasonCodes: Array.from(new Set(reasonCodes)),
      message:
        "The source report extraction needs parser review before it can be used in the dispute process.",
    });
  }

  if (confidenceScore < PARSER_CONFIDENCE_PACKET_READY_MIN) {
    reasonCodes.push("PARSER_CONFIDENCE_NEEDS_USER_REVIEW");

    return createParserGate({
      status: "needs_user_review",
      packetReady: false,
      confidenceScore,
      requiresManualReview,
      reasonCodes: Array.from(new Set(reasonCodes)),
      message:
        "Review and verify this finding before it can be used in the dispute process.",
    });
  }

  return createParserGate({
    status: "confirmed",
    packetReady: true,
    confidenceScore,
    requiresManualReview,
    reasonCodes: Array.from(new Set(reasonCodes)),
    message: "The source report extraction is confirmed for dispute review.",
  });
}

export function getValidationStatusForParserConfidenceGate(
  gate: ParserConfidenceGate | null | undefined,
): "PENDING" | "NEEDS_USER_REVIEW" | "PARSER_UNCERTAIN" {
  if (gate?.status === "parser_uncertain") return "PARSER_UNCERTAIN";
  if (gate?.status === "needs_user_review") return "NEEDS_USER_REVIEW";
  return "PENDING";
}

function readStoredParserGate(technicalDetails: unknown): ParserConfidenceGate | null {
  const details = isRecord(technicalDetails) ? technicalDetails : null;
  const rawGate = isRecord(details?.extractionConfidenceGate)
    ? details.extractionConfidenceGate
    : null;
  if (!rawGate) return null;

  const status = typeof rawGate.status === "string"
    ? rawGate.status
    : "unknown";
  const normalizedStatus: ParserConfidenceGateStatus =
    status === "confirmed" ||
    status === "needs_user_review" ||
    status === "parser_uncertain" ||
    status === "unknown"
      ? status
      : "unknown";

  return createParserGate({
    status: normalizedStatus,
    packetReady: rawGate.packetReady === true,
    confidenceScore: normalizeParserConfidenceScore(rawGate.confidenceScore),
    requiresManualReview: rawGate.requiresManualReview === true,
    reasonCodes: Array.isArray(rawGate.reasonCodes)
      ? rawGate.reasonCodes.filter((code): code is string => typeof code === "string")
      : [],
    message:
      typeof rawGate.message === "string" && rawGate.message.trim()
        ? rawGate.message
      : "Parser confidence metadata is attached to this compliance finding.",
  });
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return null;
}

function hasTextValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasTextValue);
  return Boolean(textValue(value));
}

function positiveIntegerValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function evidenceRecordsFromDetails(details: Record<string, unknown>): Record<string, unknown>[] {
  const deterministicRule = isRecord(details.deterministicRule)
    ? details.deterministicRule
    : null;
  return [
    details,
    isRecord(details.evidenceLink) ? details.evidenceLink : null,
    deterministicRule && isRecord(deterministicRule.evidence)
      ? deterministicRule.evidence
      : null,
  ].filter((record): record is Record<string, unknown> => Boolean(record));
}

function hasEvidenceLocation(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasEvidenceLocation);
  if (!isRecord(value)) return false;
  if (Object.keys(value).length === 0) return false;
  return true;
}

function createEvidenceQuality(input: Omit<ViolationEvidenceQuality, "deterministic" | "ruleId">): ViolationEvidenceQuality {
  return {
    deterministic: true,
    ruleId: "violation-evidence-quality-v1",
    ...input,
  };
}

export function classifyViolationEvidenceQuality(input: {
  technicalDetails?: unknown;
  validationStatus?: string | null;
}): ViolationEvidenceQuality {
  const storedGate = readStoredParserGate(input.technicalDetails);
  const validationStatus = input.validationStatus?.toUpperCase() ?? null;
  if (
    storedGate?.status === "parser_uncertain" ||
    validationStatus === "PARSER_UNCERTAIN" ||
    validationStatus === "NEEDS_PARSER_REVIEW"
  ) {
    return createEvidenceQuality({
      status: "parser_uncertain",
      hasMeaningfulEvidence: false,
      hasEvidenceLocation: false,
      hasEvidenceId: false,
      hasSourceLocator: false,
      hasTextSnippet: false,
      reasonCodes: ["PARSER_UNCERTAIN"],
      message: "Evidence quality cannot be confirmed until parser review is complete.",
    });
  }

  const details = isRecord(input.technicalDetails) ? input.technicalDetails : {};
  const records = evidenceRecordsFromDetails(details);
  const hasEvidenceId = records.some((record) =>
    Boolean(
      hasTextValue(record.evidenceId) ||
      hasTextValue(record.evidenceIds) ||
      hasTextValue(record.canonicalEvidenceId),
    ),
  );
  const hasEvidenceLocationValue = records.some((record) =>
    hasEvidenceLocation(record.evidenceLocation) ||
    hasEvidenceLocation(record.evidenceLocations),
  );
  const hasTextSnippet = records.some((record) =>
    Boolean(
      textValue(record.textSnippet) ||
      textValue(record.evidenceSnippet) ||
      textValue(record.excerpt),
    ),
  );
  const hasSourceLocator = records.some((record) =>
    Boolean(
      textValue(record.fieldName) ||
      textValue(record.field) ||
      textValue(record.canonicalField) ||
      textValue(record.fieldKey) ||
      textValue(record.sourceField) ||
      hasTextValue(record.sourceFields) ||
      textValue(record.disputedField) ||
      positiveIntegerValue(record.reportArtifactId) ||
      positiveIntegerValue(record.sourceReportArtifactId) ||
      positiveIntegerValue(record.pageNumber) ||
      positiveIntegerValue(record.page),
    ),
  );
  const hasMeaningfulEvidence =
    hasEvidenceLocationValue ||
    hasEvidenceId ||
    (hasTextSnippet && hasSourceLocator);

  if (hasMeaningfulEvidence) {
    return createEvidenceQuality({
      status: "strong",
      hasMeaningfulEvidence: true,
      hasEvidenceLocation: hasEvidenceLocationValue,
      hasEvidenceId,
      hasSourceLocator,
      hasTextSnippet,
      reasonCodes: [],
      message: "Meaningful source-report evidence is linked to this finding.",
    });
  }

  if (hasSourceLocator || hasTextSnippet) {
    return createEvidenceQuality({
      status: "partial",
      hasMeaningfulEvidence: false,
      hasEvidenceLocation: hasEvidenceLocationValue,
      hasEvidenceId,
      hasSourceLocator,
      hasTextSnippet,
      reasonCodes: ["PARTIAL_EVIDENCE_METADATA", "MANUAL_REVIEW_REQUIRED"],
      message: "This finding has partial evidence metadata and needs review before packet creation.",
    });
  }

  return createEvidenceQuality({
    status: "missing",
    hasMeaningfulEvidence: false,
    hasEvidenceLocation: false,
    hasEvidenceId: false,
    hasSourceLocator: false,
    hasTextSnippet: false,
    reasonCodes: ["MISSING_REQUIRED_EVIDENCE", "MANUAL_REVIEW_REQUIRED"],
    message: "Required source-report evidence is missing for this finding.",
  });
}

export function evaluateViolationPacketConfidenceGate(input: {
  technicalDetails?: unknown;
  validationStatus?: string | null;
  userStatus?: string | null;
  autoGenerated?: boolean | null;
}): ViolationPacketConfidenceGate {
  const storedGate = readStoredParserGate(input.technicalDetails);
  const validationStatus = input.validationStatus?.toUpperCase() ?? null;
  const userStatus = input.userStatus?.toLowerCase() ?? null;

  const parserUncertain =
    storedGate?.status === "parser_uncertain" ||
    validationStatus === "PARSER_UNCERTAIN" ||
    validationStatus === "NEEDS_PARSER_REVIEW";

  if (parserUncertain) {
    return {
      deterministic: true,
      ruleId: "violation-packet-confidence-gate-v1",
      status: "parser_uncertain",
      packetReady: false,
      blockerCode: "parser_uncertain",
      confidenceScore: storedGate?.confidenceScore ?? null,
      message:
        storedGate?.message ||
        "The source report extraction needs parser review before it can be used in the dispute process.",
    };
  }

  const needsUserReview =
    storedGate?.status === "needs_user_review" ||
    validationStatus === "NEEDS_USER_REVIEW";

  if (needsUserReview && userStatus !== "verified") {
    return {
      deterministic: true,
      ruleId: "violation-packet-confidence-gate-v1",
      status: "needs_user_review",
      packetReady: false,
      blockerCode: "violation_needs_review",
      confidenceScore: storedGate?.confidenceScore ?? null,
      message:
        storedGate?.message ||
        "Review and verify this finding before it can be used in the dispute process.",
    };
  }

  const evidenceQuality = classifyViolationEvidenceQuality({
    technicalDetails: input.technicalDetails,
    validationStatus: input.validationStatus,
  });

  if (
    input.autoGenerated === true &&
    evidenceQuality.status !== "strong"
  ) {
    return {
      deterministic: true,
      ruleId: "violation-packet-confidence-gate-v1",
      status: "needs_user_review",
      packetReady: false,
      blockerCode: "violation_needs_review",
      confidenceScore: storedGate?.confidenceScore ?? null,
      message: evidenceQuality.message,
    };
  }

  return {
    deterministic: true,
    ruleId: "violation-packet-confidence-gate-v1",
    status: storedGate?.status ?? "unknown",
    packetReady: true,
    blockerCode: null,
    confidenceScore: storedGate?.confidenceScore ?? null,
    message: storedGate?.message ?? "This compliance finding is available for dispute review.",
  };
}
