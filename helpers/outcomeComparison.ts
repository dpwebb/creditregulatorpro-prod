export type OutcomeType =
  | "corrected"
  | "removed"
  | "unchanged"
  | "reinserted"
  | "partially_corrected"
  | "new_issue"
  | "unresolved"
  | "needs_review"
  | "not_comparable"
  | "response_received";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export type MatchingMethod =
  | "exact_account_creditor_date"
  | "stable_secondary_keys"
  | "packet_finding_tradeline"
  | "response_only"
  | "ambiguous"
  | "not_comparable"
  | "none";

export type ExpectedCorrectionDirection =
  | "remove_issue"
  | "field_change"
  | "tradeline_removed"
  | "any_supported_change";

export type ComparisonScope = "report_to_report" | "packet_findings" | "response_only";

export type ReportComparisonSnapshot = {
  reportArtifactId: string | number;
  userId: string | number;
  bureau?: string | null;
  reportDate?: string | null;
  reportType?: string | null;
  parserQuality?: {
    packetReady?: boolean;
    canonicalReady?: boolean;
    confidence?: number;
    reasonCodes?: string[];
  };
  tradelines: TradelineComparisonSnapshot[];
};

export type TradelineComparisonSnapshot = {
  tradelineId?: string | number | null;
  bureau?: string | null;
  creditorName?: string | null;
  originalCreditorName?: string | null;
  collectionAgencyName?: string | null;
  accountType?: string | null;
  maskedAccountNumber?: string | null;
  accountSuffix?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  status?: string | null;
  balance?: string | number | null;
  currentBalance?: string | number | null;
  amountPastDue?: string | number | null;
  creditLimit?: string | number | null;
  dateOfFirstDelinquency?: string | null;
  lastPaymentDate?: string | null;
  evidenceIds?: string[];
  evidenceLocationSnapshot?: unknown;
};

export type PacketFindingComparisonSnapshot = {
  disputePacketId?: string | number | null;
  disputePacketFindingId?: string | number | null;
  creditorObligationTestId?: string | number | null;
  previousTradelineId?: string | number | null;
  targetFields?: string[];
  expectedCorrectionDirection?: ExpectedCorrectionDirection;
  evidenceIds?: string[];
  evidenceLocationSnapshot?: unknown;
  readinessSnapshot?: unknown;
  packetItemSnapshot?: unknown;
};

export type ResponseComparisonSnapshot = {
  packetId?: string | number | null;
  responseReceivedAt?: string | null;
  responseType?: string | null;
  source?: "bureau_response" | "collection_agency_response" | "manual_record";
};

export type DeliveryComparisonSnapshot = {
  packetId?: string | number | null;
  sentAt?: string | null;
  deliveryMethod?: string | null;
  trackingNumber?: string | null;
};

export type FindingOutcomeSnapshot = {
  outcomeType: OutcomeType;
  previousTradelineId?: string | number | null;
  laterTradelineId?: string | number | null;
  creditorObligationTestId?: string | number | null;
  disputePacketFindingId?: string | number | null;
};

export type OutcomeComparisonInput = {
  userId: string | number;
  previousReport: ReportComparisonSnapshot;
  laterReport?: ReportComparisonSnapshot | null;
  packetFindings?: PacketFindingComparisonSnapshot[];
  response?: ResponseComparisonSnapshot | null;
  delivery?: DeliveryComparisonSnapshot | null;
  previousOutcomeHistory?: FindingOutcomeSnapshot[];
  comparisonScope?: ComparisonScope;
};

export type SafeTradelineSnapshot = {
  tradelineId?: string | number | null;
  bureau?: string | null;
  creditorName?: string | null;
  originalCreditorName?: string | null;
  collectionAgencyName?: string | null;
  accountType?: string | null;
  maskedAccountNumber?: string | null;
  accountSuffix?: string | null;
  openDate?: string | null;
  closeDate?: string | null;
  status?: string | null;
  balance?: string | number | null;
  currentBalance?: string | number | null;
  amountPastDue?: string | number | null;
  creditLimit?: string | number | null;
  dateOfFirstDelinquency?: string | null;
  lastPaymentDate?: string | null;
};

export type FindingOutcomeResult = {
  outcomeType: OutcomeType;
  confidenceLevel: ConfidenceLevel;
  matchingMethod: MatchingMethod;
  reasonCodes: string[];
  previousTradelineId?: string | number | null;
  laterTradelineId?: string | number | null;
  creditorObligationTestId?: string | number | null;
  disputePacketFindingId?: string | number | null;
  safePreviousSnapshot?: SafeTradelineSnapshot | null;
  safeLaterSnapshot?: SafeTradelineSnapshot | null;
  evidenceIds?: string[];
  evidenceLocationSnapshot?: unknown;
};

export type OutcomeComparisonSummary = {
  corrected: number;
  removed: number;
  unchanged: number;
  reinserted: number;
  partiallyCorrected: number;
  newIssue: number;
  unresolved: number;
  needsReview: number;
  notComparable: number;
  responseReceived: number;
};

export type OutcomeComparisonResult = {
  comparisonStatus: "completed" | "needs_review" | "unresolved" | "not_comparable";
  userId: string | number;
  previousReportArtifactId?: string | number;
  laterReportArtifactId?: string | number | null;
  summary: OutcomeComparisonSummary;
  findingOutcomes: FindingOutcomeResult[];
  warnings: string[];
};

type MatchResult = {
  method: MatchingMethod;
  confidenceLevel: ConfidenceLevel;
  laterTradeline: TradelineComparisonSnapshot | null;
  ambiguous: boolean;
  reasonCodes: string[];
};

const DEFAULT_TARGET_FIELDS = ["status", "balance", "currentBalance", "amountPastDue", "dateOfFirstDelinquency"];
const LOW_CONFIDENCE_THRESHOLD = 70;
const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERN =
  /(raw|snippet|text|pdf|packet.*body|content|storage|bucket|path|url|token|cookie|secret|api.?key|private.?key|database|authorization|accountNumber|sin|socialInsurance)/i;

const SENSITIVE_VALUE_PATTERN =
  /(\b\d{3}[- ]?\d{3}[- ]?\d{3}\b|sk-[a-z0-9_-]+|x-goog-signature|signature=|token=|session=|cookie=|postgres:\/\/|database_url|private key|api[_-]?key|raw report text|raw pdf text|storage bucket|bucket:\/\/)/i;

function idText(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return normalizeText(value);
}

function normalizeNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[^0-9.-]/g, "");
  if (!/[0-9]/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function accountSuffix(tradeline: TradelineComparisonSnapshot): string {
  const explicit = normalizeIdentifier(tradeline.accountSuffix);
  if (explicit) return explicit.slice(-4);
  const masked = normalizeIdentifier(tradeline.maskedAccountNumber);
  return masked ? masked.slice(-4) : "";
}

function accountMatches(a: TradelineComparisonSnapshot, b: TradelineComparisonSnapshot): boolean {
  const left = accountSuffix(a);
  const right = accountSuffix(b);
  return left.length >= 4 && right.length >= 4 && left === right;
}

function creditorKeys(tradeline: TradelineComparisonSnapshot): string[] {
  return [
    tradeline.creditorName,
    tradeline.originalCreditorName,
    tradeline.collectionAgencyName,
  ]
    .map(normalizeText)
    .filter(Boolean);
}

function creditorMatches(a: TradelineComparisonSnapshot, b: TradelineComparisonSnapshot): boolean {
  const left = creditorKeys(a);
  const right = new Set(creditorKeys(b));
  return left.some((key) => right.has(key));
}

function collectionPairMatches(a: TradelineComparisonSnapshot, b: TradelineComparisonSnapshot): boolean {
  const leftAgency = normalizeText(a.collectionAgencyName);
  const rightAgency = normalizeText(b.collectionAgencyName);
  const leftOriginal = normalizeText(a.originalCreditorName);
  const rightOriginal = normalizeText(b.originalCreditorName);
  return Boolean(leftAgency && rightAgency && leftAgency === rightAgency && leftOriginal && rightOriginal && leftOriginal === rightOriginal);
}

function sameBureau(a?: string | null, b?: string | null): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  return Boolean(left && right && left === right);
}

function reportBureau(report: ReportComparisonSnapshot): string | null {
  if (report.bureau) return report.bureau;
  const first = report.tradelines.find((line) => line.bureau);
  return first?.bureau ?? null;
}

function sameReportType(previous: ReportComparisonSnapshot, later: ReportComparisonSnapshot): boolean {
  const previousType = normalizeText(previous.reportType);
  const laterType = normalizeText(later.reportType);
  return !previousType || !laterType || previousType === laterType;
}

function parserQualityIsAcceptable(report: ReportComparisonSnapshot | null | undefined): boolean {
  if (!report) return false;
  const quality = report.parserQuality;
  if (!quality) return true;
  if (quality.canonicalReady === false || quality.packetReady === false) return false;
  if (typeof quality.confidence === "number" && quality.confidence < LOW_CONFIDENCE_THRESHOLD) return false;
  return true;
}

function sensitiveString(value: string): boolean {
  return SENSITIVE_VALUE_PATTERN.test(value);
}

function safeString(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  if (sensitiveString(value)) return REDACTED;
  return value;
}

function safeMaskedAccount(tradeline: TradelineComparisonSnapshot): string | null | undefined {
  const value = tradeline.maskedAccountNumber;
  if (!value) return value;
  if (sensitiveString(value)) return REDACTED;
  const digits = value.replace(/\D/g, "");
  const hasMask = /[xX*]/.test(value);
  if (!hasMask && digits.length > 4) {
    return `Account ending ${digits.slice(-4)}`;
  }
  return value;
}

export function sanitizeTradelineSnapshot(tradeline: TradelineComparisonSnapshot | null | undefined): SafeTradelineSnapshot | null {
  if (!tradeline) return null;
  const suffix = accountSuffix(tradeline);
  return {
    tradelineId: tradeline.tradelineId ?? null,
    bureau: safeString(tradeline.bureau ?? null),
    creditorName: safeString(tradeline.creditorName ?? null),
    originalCreditorName: safeString(tradeline.originalCreditorName ?? null),
    collectionAgencyName: safeString(tradeline.collectionAgencyName ?? null),
    accountType: safeString(tradeline.accountType ?? null),
    maskedAccountNumber: safeMaskedAccount(tradeline),
    accountSuffix: suffix || null,
    openDate: safeString(tradeline.openDate ?? null),
    closeDate: safeString(tradeline.closeDate ?? null),
    status: safeString(tradeline.status ?? null),
    balance: tradeline.balance ?? null,
    currentBalance: tradeline.currentBalance ?? null,
    amountPastDue: tradeline.amountPastDue ?? null,
    creditLimit: tradeline.creditLimit ?? null,
    dateOfFirstDelinquency: safeString(tradeline.dateOfFirstDelinquency ?? null),
    lastPaymentDate: safeString(tradeline.lastPaymentDate ?? null),
  };
}

function sanitizeString(value: string): string | null {
  if (sensitiveString(value)) return null;
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

export function sanitizeEvidenceLocationSnapshot(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeEvidenceLocationSnapshot(item))
      .filter((item) => item !== null && item !== undefined);
  }
  if (typeof value !== "object") return null;

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const sanitized = sanitizeEvidenceLocationSnapshot(raw);
    if (sanitized !== null && sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function uniqueEvidenceIds(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  for (const group of groups) {
    for (const value of group ?? []) {
      if (!sensitiveString(value)) seen.add(value);
    }
  }
  return Array.from(seen);
}

function matchById(
  previous: TradelineComparisonSnapshot,
  laterReport: ReportComparisonSnapshot,
): TradelineComparisonSnapshot | null {
  const previousId = idText(previous.tradelineId);
  if (!previousId) return null;
  return laterReport.tradelines.find((line) => idText(line.tradelineId) === previousId) ?? null;
}

function matchTradeline(previous: TradelineComparisonSnapshot, laterReport: ReportComparisonSnapshot): MatchResult {
  const idMatch = matchById(previous, laterReport);
  if (idMatch) {
    return {
      method: "packet_finding_tradeline",
      confidenceLevel: "high",
      laterTradeline: idMatch,
      ambiguous: false,
      reasonCodes: ["MATCHED_BY_TRADELINE_ID"],
    };
  }

  const scored = laterReport.tradelines
    .map((candidate) => {
      const account = accountMatches(previous, candidate);
      const creditor = creditorMatches(previous, candidate);
      const openDateMatch = normalizeDate(previous.openDate) && normalizeDate(previous.openDate) === normalizeDate(candidate.openDate);
      const accountTypeMatch = normalizeText(previous.accountType) && normalizeText(previous.accountType) === normalizeText(candidate.accountType);
      const collectionPair = collectionPairMatches(previous, candidate);
      const statusMatch = normalizeText(previous.status) && normalizeText(previous.status) === normalizeText(candidate.status);
      const balanceMatch =
        normalizeNumeric(previous.balance ?? previous.currentBalance) !== null &&
        normalizeNumeric(previous.balance ?? previous.currentBalance) === normalizeNumeric(candidate.balance ?? candidate.currentBalance);

      let score = 0;
      let method: MatchingMethod = "none";
      const reasonCodes: string[] = [];

      if (account && creditor && (openDateMatch || accountTypeMatch || !previous.openDate)) {
        score = 100;
        method = "exact_account_creditor_date";
        reasonCodes.push("ACCOUNT_CREDITOR_DATE_MATCH");
      } else if ((creditor && openDateMatch && accountTypeMatch) || collectionPair) {
        score = 80;
        method = "stable_secondary_keys";
        reasonCodes.push(collectionPair ? "COLLECTION_PAIR_MATCH" : "CREDITOR_OPEN_DATE_ACCOUNT_TYPE_MATCH");
      } else if (account && creditor) {
        score = 75;
        method = "stable_secondary_keys";
        reasonCodes.push("ACCOUNT_CREDITOR_MATCH");
      } else if (creditor && accountTypeMatch && (statusMatch || balanceMatch)) {
        score = 60;
        method = "stable_secondary_keys";
        reasonCodes.push("WEAK_CREDITOR_ACCOUNT_TYPE_SUPPORTING_MATCH");
      }

      return { candidate, score, method, reasonCodes };
    })
    .filter((item) => item.score >= 75)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      method: "none",
      confidenceLevel: "none",
      laterTradeline: null,
      ambiguous: false,
      reasonCodes: ["NO_LATER_MATCH"],
    };
  }

  const bestScore = scored[0].score;
  const best = scored.filter((item) => item.score === bestScore);
  if (best.length > 1) {
    return {
      method: "ambiguous",
      confidenceLevel: "low",
      laterTradeline: null,
      ambiguous: true,
      reasonCodes: ["MULTIPLE_LATER_MATCHES"],
    };
  }

  return {
    method: best[0].method,
    confidenceLevel: bestScore >= 100 ? "high" : "medium",
    laterTradeline: best[0].candidate,
    ambiguous: false,
    reasonCodes: best[0].reasonCodes,
  };
}

function normalizeStatus(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function isNegativeStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  return ["COLLECTION", "CHARGE", "BAD DEBT", "PAST DUE", "LATE", "DELINQUENT", "PROPOSAL", "REPOSSESSION"].some((token) =>
    status.includes(token),
  );
}

function fieldValue(tradeline: TradelineComparisonSnapshot, field: string): unknown {
  return (tradeline as Record<string, unknown>)[field];
}

function materiallySame(previous: unknown, later: unknown): boolean {
  if (previous === null || previous === undefined || previous === "") {
    return later === null || later === undefined || later === "";
  }
  if (later === null || later === undefined || later === "") return false;
  const previousNumber = normalizeNumeric(previous);
  const laterNumber = normalizeNumeric(later);
  if (previousNumber !== null && laterNumber !== null) return previousNumber === laterNumber;
  return normalizeText(previous) === normalizeText(later);
}

function fieldChanged(previous: TradelineComparisonSnapshot, later: TradelineComparisonSnapshot, field: string): boolean {
  return !materiallySame(fieldValue(previous, field), fieldValue(later, field));
}

function favorableFieldChange(previous: TradelineComparisonSnapshot, later: TradelineComparisonSnapshot, field: string): boolean {
  const previousValue = fieldValue(previous, field);
  const laterValue = fieldValue(later, field);
  if (!fieldChanged(previous, later, field)) return false;

  if (field === "status") {
    return isNegativeStatus(previousValue) && !isNegativeStatus(laterValue);
  }

  if (field === "balance" || field === "currentBalance" || field === "amountPastDue") {
    const previousNumber = normalizeNumeric(previousValue);
    const laterNumber = normalizeNumeric(laterValue);
    return previousNumber !== null && laterNumber !== null && laterNumber < previousNumber;
  }

  if (field === "dateOfFirstDelinquency") {
    return Boolean(previousValue) && !laterValue;
  }

  return true;
}

function targetFieldsFor(packetFinding?: PacketFindingComparisonSnapshot): string[] {
  const fields = packetFinding?.targetFields?.map((field) => field.trim()).filter(Boolean) ?? [];
  return fields.length > 0 ? fields : DEFAULT_TARGET_FIELDS;
}

function classifyMatchedTradeline(params: {
  previous: TradelineComparisonSnapshot;
  later: TradelineComparisonSnapshot;
  match: MatchResult;
  packetFinding?: PacketFindingComparisonSnapshot;
  previousOutcomeHistory?: FindingOutcomeSnapshot[];
}): Pick<FindingOutcomeResult, "outcomeType" | "reasonCodes" | "confidenceLevel" | "matchingMethod"> {
  const priorRemoved = params.previousOutcomeHistory?.some(
    (item) =>
      item.outcomeType === "removed" &&
      (idText(item.previousTradelineId) === idText(params.previous.tradelineId) ||
        idText(item.creditorObligationTestId) === idText(params.packetFinding?.creditorObligationTestId) ||
        idText(item.disputePacketFindingId) === idText(params.packetFinding?.disputePacketFindingId)),
  );

  if (priorRemoved) {
    return {
      outcomeType: "reinserted",
      reasonCodes: [...params.match.reasonCodes, "PRIOR_REMOVED_OUTCOME_PRESENT_AGAIN"],
      confidenceLevel: params.match.confidenceLevel,
      matchingMethod: params.match.method,
    };
  }

  const fields = targetFieldsFor(params.packetFinding);
  const changedFields = fields.filter((field) => fieldChanged(params.previous, params.later, field));
  const favorableFields = fields.filter((field) => favorableFieldChange(params.previous, params.later, field));
  const direction = params.packetFinding?.expectedCorrectionDirection ?? "any_supported_change";

  if (changedFields.length === 0) {
    return {
      outcomeType: "unchanged",
      reasonCodes: [...params.match.reasonCodes, "TARGET_FIELDS_UNCHANGED"],
      confidenceLevel: params.match.confidenceLevel,
      matchingMethod: params.match.method,
    };
  }

  if (direction === "field_change") {
    return {
      outcomeType: changedFields.length === fields.length ? "corrected" : "partially_corrected",
      reasonCodes: [
        ...params.match.reasonCodes,
        changedFields.length === fields.length ? "ALL_TARGET_FIELDS_CHANGED" : "SOME_TARGET_FIELDS_CHANGED",
      ],
      confidenceLevel: params.match.confidenceLevel,
      matchingMethod: params.match.method,
    };
  }

  if (favorableFields.length === fields.length || (fields.length === DEFAULT_TARGET_FIELDS.length && favorableFields.length > 0 && changedFields.length === favorableFields.length)) {
    return {
      outcomeType: "corrected",
      reasonCodes: [...params.match.reasonCodes, "SUPPORTED_FAVORABLE_CHANGE"],
      confidenceLevel: params.match.confidenceLevel,
      matchingMethod: params.match.method,
    };
  }

  if (favorableFields.length > 0 || changedFields.length > 0) {
    return {
      outcomeType: "partially_corrected",
      reasonCodes: [...params.match.reasonCodes, "PARTIAL_OR_MIXED_TARGET_FIELD_CHANGE"],
      confidenceLevel: params.match.confidenceLevel === "high" ? "medium" : params.match.confidenceLevel,
      matchingMethod: params.match.method,
    };
  }

  return {
    outcomeType: "unchanged",
    reasonCodes: [...params.match.reasonCodes, "NO_SUPPORTED_CORRECTION_CHANGE"],
    confidenceLevel: params.match.confidenceLevel,
    matchingMethod: params.match.method,
  };
}

function buildOutcome(params: {
  outcomeType: OutcomeType;
  confidenceLevel: ConfidenceLevel;
  matchingMethod: MatchingMethod;
  reasonCodes: string[];
  previous?: TradelineComparisonSnapshot | null;
  later?: TradelineComparisonSnapshot | null;
  packetFinding?: PacketFindingComparisonSnapshot;
}): FindingOutcomeResult {
  return {
    outcomeType: params.outcomeType,
    confidenceLevel: params.confidenceLevel,
    matchingMethod: params.matchingMethod,
    reasonCodes: Array.from(new Set(params.reasonCodes)),
    previousTradelineId: params.previous?.tradelineId ?? params.packetFinding?.previousTradelineId ?? null,
    laterTradelineId: params.later?.tradelineId ?? null,
    creditorObligationTestId: params.packetFinding?.creditorObligationTestId ?? null,
    disputePacketFindingId: params.packetFinding?.disputePacketFindingId ?? null,
    safePreviousSnapshot: sanitizeTradelineSnapshot(params.previous),
    safeLaterSnapshot: sanitizeTradelineSnapshot(params.later),
    evidenceIds: uniqueEvidenceIds(params.previous?.evidenceIds, params.later?.evidenceIds, params.packetFinding?.evidenceIds),
    evidenceLocationSnapshot: sanitizeEvidenceLocationSnapshot(
      params.packetFinding?.evidenceLocationSnapshot ?? params.previous?.evidenceLocationSnapshot ?? params.later?.evidenceLocationSnapshot,
    ),
  };
}

function findPreviousForPacketFinding(
  packetFinding: PacketFindingComparisonSnapshot,
  previousReport: ReportComparisonSnapshot,
): TradelineComparisonSnapshot | null {
  const previousId = idText(packetFinding.previousTradelineId);
  if (previousId) {
    const byId = previousReport.tradelines.find((line) => idText(line.tradelineId) === previousId);
    if (byId) return byId;
  }

  const itemSnapshot =
    packetFinding.packetItemSnapshot && typeof packetFinding.packetItemSnapshot === "object"
      ? (packetFinding.packetItemSnapshot as Record<string, unknown>)
      : null;
  const snapshotTradelineId = idText(itemSnapshot?.tradelineId as string | number | null | undefined);
  if (snapshotTradelineId) {
    return previousReport.tradelines.find((line) => idText(line.tradelineId) === snapshotTradelineId) ?? null;
  }

  return null;
}

function comparableReports(
  input: OutcomeComparisonInput,
  warnings: string[],
): { comparable: boolean; notComparableReason?: string } {
  if (idText(input.userId) !== idText(input.previousReport.userId)) {
    return { comparable: false, notComparableReason: "USER_MISMATCH_PREVIOUS_REPORT" };
  }

  if (!input.laterReport) {
    return { comparable: false };
  }

  if (idText(input.userId) !== idText(input.laterReport.userId)) {
    return { comparable: false, notComparableReason: "USER_MISMATCH_LATER_REPORT" };
  }

  if (!sameReportType(input.previousReport, input.laterReport)) {
    return { comparable: false, notComparableReason: "REPORT_TYPE_MISMATCH" };
  }

  const previousBureau = reportBureau(input.previousReport);
  const laterBureau = reportBureau(input.laterReport);
  if (!sameBureau(previousBureau, laterBureau)) {
    return { comparable: false, notComparableReason: "BUREAU_MISMATCH" };
  }

  if (!parserQualityIsAcceptable(input.laterReport)) {
    warnings.push("Later report parser quality is not acceptable for deterministic outcome classification.");
    return { comparable: true };
  }

  return { comparable: true };
}

function outcomeForNoLaterReport(input: OutcomeComparisonInput): FindingOutcomeResult[] {
  const hasResponse = Boolean(input.response?.responseReceivedAt || input.response?.responseType);
  const outcomeType: OutcomeType = hasResponse ? "response_received" : "unresolved";
  const method: MatchingMethod = hasResponse ? "response_only" : "none";
  const reason = hasResponse ? "RESPONSE_WITHOUT_LATER_REPORT" : "LATER_REPORT_ABSENT";
  const packetFindings = input.packetFindings ?? [];

  if (packetFindings.length > 0) {
    return packetFindings.map((packetFinding) =>
      buildOutcome({
        outcomeType,
        confidenceLevel: hasResponse ? "medium" : "none",
        matchingMethod: method,
        reasonCodes: [reason],
        previous: findPreviousForPacketFinding(packetFinding, input.previousReport),
        packetFinding,
      }),
    );
  }

  return [
    buildOutcome({
      outcomeType,
      confidenceLevel: hasResponse ? "medium" : "none",
      matchingMethod: method,
      reasonCodes: [reason],
      previous: input.previousReport.tradelines[0] ?? null,
    }),
  ];
}

function comparePacketFindings(input: OutcomeComparisonInput, warnings: string[]): FindingOutcomeResult[] {
  const laterReport = input.laterReport;
  if (!laterReport) return outcomeForNoLaterReport(input);

  const comparison = comparableReports(input, warnings);
  if (comparison.notComparableReason) {
    return (input.packetFindings ?? []).map((packetFinding) =>
      buildOutcome({
        outcomeType: "not_comparable",
        confidenceLevel: "none",
        matchingMethod: "not_comparable",
        reasonCodes: [comparison.notComparableReason],
        previous: findPreviousForPacketFinding(packetFinding, input.previousReport),
        packetFinding,
      }),
    );
  }

  if (!parserQualityIsAcceptable(laterReport)) {
    return (input.packetFindings ?? []).map((packetFinding) =>
      buildOutcome({
        outcomeType: "unresolved",
        confidenceLevel: "none",
        matchingMethod: "none",
        reasonCodes: ["LOW_LATER_REPORT_PARSER_QUALITY"],
        previous: findPreviousForPacketFinding(packetFinding, input.previousReport),
        packetFinding,
      }),
    );
  }

  return (input.packetFindings ?? []).map((packetFinding) => {
    const previous = findPreviousForPacketFinding(packetFinding, input.previousReport);
    if (!previous) {
      return buildOutcome({
        outcomeType: "unresolved",
        confidenceLevel: "none",
        matchingMethod: "none",
        reasonCodes: ["PACKET_FINDING_PREVIOUS_TRADELINE_UNAVAILABLE"],
        packetFinding,
      });
    }

    const match = matchTradeline(previous, laterReport);
    if (match.ambiguous) {
      return buildOutcome({
        outcomeType: "needs_review",
        confidenceLevel: "low",
        matchingMethod: "ambiguous",
        reasonCodes: match.reasonCodes,
        previous,
        packetFinding,
      });
    }

    if (!match.laterTradeline) {
      return buildOutcome({
        outcomeType: "removed",
        confidenceLevel: "high",
        matchingMethod: "none",
        reasonCodes: ["COMPARABLE_LATER_REPORT_WITHOUT_MATCH"],
        previous,
        packetFinding,
      });
    }

    const classified = classifyMatchedTradeline({
      previous,
      later: match.laterTradeline,
      match,
      packetFinding,
      previousOutcomeHistory: input.previousOutcomeHistory,
    });

    return buildOutcome({
      ...classified,
      previous,
      later: match.laterTradeline,
      packetFinding,
    });
  });
}

function compareReportTradelines(input: OutcomeComparisonInput, warnings: string[]): FindingOutcomeResult[] {
  const laterReport = input.laterReport;
  if (!laterReport) return outcomeForNoLaterReport(input);

  const comparison = comparableReports(input, warnings);
  if (comparison.notComparableReason) {
    return input.previousReport.tradelines.map((previous) =>
      buildOutcome({
        outcomeType: "not_comparable",
        confidenceLevel: "none",
        matchingMethod: "not_comparable",
        reasonCodes: [comparison.notComparableReason],
        previous,
      }),
    );
  }

  if (!parserQualityIsAcceptable(laterReport)) {
    return input.previousReport.tradelines.map((previous) =>
      buildOutcome({
        outcomeType: "unresolved",
        confidenceLevel: "none",
        matchingMethod: "none",
        reasonCodes: ["LOW_LATER_REPORT_PARSER_QUALITY"],
        previous,
      }),
    );
  }

  const matchedLaterIds = new Set<string>();
  const outcomes: FindingOutcomeResult[] = [];

  for (const previous of input.previousReport.tradelines) {
    const match = matchTradeline(previous, laterReport);
    if (match.ambiguous) {
      outcomes.push(
        buildOutcome({
          outcomeType: "needs_review",
          confidenceLevel: "low",
          matchingMethod: "ambiguous",
          reasonCodes: match.reasonCodes,
          previous,
        }),
      );
      continue;
    }

    if (!match.laterTradeline) {
      outcomes.push(
        buildOutcome({
          outcomeType: "removed",
          confidenceLevel: "high",
          matchingMethod: "none",
          reasonCodes: ["COMPARABLE_LATER_REPORT_WITHOUT_MATCH"],
          previous,
        }),
      );
      continue;
    }

    if (match.laterTradeline.tradelineId !== undefined && match.laterTradeline.tradelineId !== null) {
      matchedLaterIds.add(idText(match.laterTradeline.tradelineId) ?? "");
    }

    const classified = classifyMatchedTradeline({
      previous,
      later: match.laterTradeline,
      match,
      previousOutcomeHistory: input.previousOutcomeHistory,
    });
    outcomes.push(buildOutcome({ ...classified, previous, later: match.laterTradeline }));
  }

  for (const later of laterReport.tradelines) {
    const laterId = idText(later.tradelineId);
    if (laterId && matchedLaterIds.has(laterId)) continue;
    const alsoMatchedByContent = input.previousReport.tradelines.some((previous) => {
      const match = matchTradeline(previous, { ...laterReport, tradelines: [later] });
      return Boolean(match.laterTradeline);
    });
    if (alsoMatchedByContent) continue;

    outcomes.push(
      buildOutcome({
        outcomeType: "new_issue",
        confidenceLevel: "medium",
        matchingMethod: "none",
        reasonCodes: ["LATER_TRADELINE_NOT_PRESENT_IN_PREVIOUS_REPORT"],
        later,
      }),
    );
  }

  return outcomes;
}

function emptySummary(): OutcomeComparisonSummary {
  return {
    corrected: 0,
    removed: 0,
    unchanged: 0,
    reinserted: 0,
    partiallyCorrected: 0,
    newIssue: 0,
    unresolved: 0,
    needsReview: 0,
    notComparable: 0,
    responseReceived: 0,
  };
}

function summarize(outcomes: FindingOutcomeResult[]): OutcomeComparisonSummary {
  const summary = emptySummary();
  for (const outcome of outcomes) {
    if (outcome.outcomeType === "partially_corrected") summary.partiallyCorrected += 1;
    else if (outcome.outcomeType === "new_issue") summary.newIssue += 1;
    else if (outcome.outcomeType === "needs_review") summary.needsReview += 1;
    else if (outcome.outcomeType === "not_comparable") summary.notComparable += 1;
    else if (outcome.outcomeType === "response_received") summary.responseReceived += 1;
    else summary[outcome.outcomeType] += 1;
  }
  return summary;
}

function comparisonStatus(outcomes: FindingOutcomeResult[]): OutcomeComparisonResult["comparisonStatus"] {
  if (outcomes.length === 0) return "unresolved";
  if (outcomes.every((outcome) => outcome.outcomeType === "not_comparable")) return "not_comparable";
  if (outcomes.some((outcome) => outcome.outcomeType === "needs_review")) return "needs_review";
  const conclusive = outcomes.some((outcome) =>
    ["corrected", "removed", "unchanged", "reinserted", "partially_corrected", "new_issue", "response_received"].includes(outcome.outcomeType),
  );
  if (!conclusive && outcomes.some((outcome) => outcome.outcomeType === "unresolved")) return "unresolved";
  return "completed";
}

export function compareOutcomeSnapshots(input: OutcomeComparisonInput): OutcomeComparisonResult {
  const warnings: string[] = [];
  const scope = input.comparisonScope ?? (input.packetFindings && input.packetFindings.length > 0 ? "packet_findings" : "report_to_report");

  let findingOutcomes: FindingOutcomeResult[];
  if (scope === "response_only") {
    findingOutcomes = outcomeForNoLaterReport({ ...input, laterReport: null });
  } else if (scope === "packet_findings") {
    findingOutcomes = comparePacketFindings(input, warnings);
  } else {
    findingOutcomes = compareReportTradelines(input, warnings);
  }

  if (input.delivery && !input.response && !input.laterReport) {
    warnings.push("Delivery metadata alone is not an outcome.");
  }

  return {
    comparisonStatus: comparisonStatus(findingOutcomes),
    userId: input.userId,
    previousReportArtifactId: input.previousReport.reportArtifactId,
    laterReportArtifactId: input.laterReport?.reportArtifactId ?? null,
    summary: summarize(findingOutcomes),
    findingOutcomes,
    warnings,
  };
}
