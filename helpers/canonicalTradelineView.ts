import type { Selectable } from "kysely";

import type {
  CanonicalFieldEvidence,
  DeterministicNormalizedReport,
} from "./deterministicCreditReportPipeline";
import type {
  ParsedPaymentHistoryDetail,
  ParsedPaymentHistorySummary,
  ParsedTradeline,
} from "./reportParserTypes";
import type { Tradeline } from "./schema";

export type CanonicalTradelineRawSourceType =
  | "parsed_tradeline"
  | "persisted_tradeline"
  | "deterministic_canonical_output";

export type CanonicalTradelinePaymentHistory =
  | string
  | ParsedPaymentHistorySummary
  | ParsedPaymentHistoryDetail[]
  | Record<string, unknown>
  | null;

export interface CanonicalTradelineEvidenceRef {
  evidenceId?: string;
  fieldKey?: string;
  sourceField?: string;
  sourceMethod?: string;
  pageNumber?: number;
  textSnippet?: string;
  reportArtifactId?: number | null;
}

export interface CanonicalTradelineView {
  sourceArtifactId: number | null;
  tradelineId: number | null;
  bureau: string | null;
  creditorName: string | null;
  accountNumberMasked: string | null;
  accountType: string | null;
  status: string | null;
  balance: number | null;
  dateOpened: string | null;
  dateClosed: string | null;
  dateOfFirstDelinquency: string | null;
  lastPaymentDate: string | null;
  lastReportedDate: string | null;
  paymentHistory: CanonicalTradelinePaymentHistory;
  remarks: string[];
  disputeStatus: string | null;
  evidenceRefs: CanonicalTradelineEvidenceRef[];
  parserConfidence: number | null;
  rawSourceType: CanonicalTradelineRawSourceType;
}

export interface CanonicalTradelineViewContext {
  sourceArtifactId?: unknown;
  tradelineId?: unknown;
  bureau?: unknown;
  disputeStatus?: unknown;
  evidenceRefs?: CanonicalTradelineEvidenceRef[];
  parserConfidence?: unknown;
}

export type ParsedTradelineViewSource = Partial<ParsedTradeline>;
export type PersistedTradelineViewSource = Partial<Selectable<Tradeline>> & {
  bureauName?: string | null;
  creditorName?: string | null;
};

export interface BuildCanonicalTradelineViewFromParsedInput extends CanonicalTradelineViewContext {
  tradeline: ParsedTradelineViewSource;
  tradelineIndex?: number | null;
}

export interface BuildCanonicalTradelineViewFromPersistedInput extends CanonicalTradelineViewContext {
  tradeline: PersistedTradelineViewSource;
}

export interface BuildCanonicalTradelineViewFromDeterministicOutputInput
  extends CanonicalTradelineViewContext {
  canonicalOutput: DeterministicNormalizedReport | null | undefined;
  tradelineIndex?: number | null;
}

const MISSING_TEXT_VALUES = new Set([
  "",
  "unknown",
  "not known",
  "not reported",
  "not provided",
  "not available",
  "not provided by bureau",
  "information not provided on report",
  "n/a",
  "na",
  "-",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || MISSING_TEXT_VALUES.has(text.toLowerCase().replace(/\s+/g, " "))) return null;
  return text;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function confidenceOrNull(value: unknown): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  const normalized = parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function dateOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const text = textOrNull(value);
  if (!text) return null;

  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if (isoDate) return isoDate[1];

  return text;
}

function maskAccountNumber(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;

  if (/[*xX]/.test(text)) return text;

  const digits = text.replace(/\D/g, "");
  if (digits.length > 4) return `****${digits.slice(-4)}`;

  return text;
}

function normalizeRemarks(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map(textOrNull)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeEvidenceRefs(
  refs: CanonicalTradelineEvidenceRef[] | undefined,
): CanonicalTradelineEvidenceRef[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((ref) => {
      const evidence: CanonicalTradelineEvidenceRef = {
        ...(textOrNull(ref.evidenceId) ? { evidenceId: textOrNull(ref.evidenceId)! } : {}),
        ...(textOrNull(ref.fieldKey) ? { fieldKey: textOrNull(ref.fieldKey)! } : {}),
        ...(textOrNull(ref.sourceField) ? { sourceField: textOrNull(ref.sourceField)! } : {}),
        ...(textOrNull(ref.sourceMethod) ? { sourceMethod: textOrNull(ref.sourceMethod)! } : {}),
        ...(positiveIntegerOrNull(ref.pageNumber) ? { pageNumber: positiveIntegerOrNull(ref.pageNumber)! } : {}),
        ...(textOrNull(ref.textSnippet) ? { textSnippet: textOrNull(ref.textSnippet)! } : {}),
      };
      const reportArtifactId = positiveIntegerOrNull(ref.reportArtifactId);
      if (reportArtifactId) evidence.reportArtifactId = reportArtifactId;
      return evidence;
    })
    .filter((ref) => Object.keys(ref).length > 0);
}

function sourceTextEvidenceRef(input: {
  sourceText?: unknown;
  sourceArtifactId: number | null;
  tradelineIndex?: number | null;
}): CanonicalTradelineEvidenceRef[] {
  const textSnippet = textOrNull(input.sourceText);
  if (!textSnippet) return [];

  return [
    {
      ...(input.tradelineIndex != null && input.tradelineIndex >= 0
        ? { fieldKey: `tradelines[${input.tradelineIndex}].sourceText` }
        : {}),
      sourceField: "ParsedTradeline.sourceText",
      textSnippet,
      ...(input.sourceArtifactId ? { reportArtifactId: input.sourceArtifactId } : {}),
    },
  ];
}

function firstKnown(...values: unknown[]): string | null {
  for (const value of values) {
    const text = textOrNull(value);
    if (text) return text;
  }
  return null;
}

function firstKnownNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function firstKnownDate(...values: unknown[]): string | null {
  for (const value of values) {
    const date = dateOrNull(value);
    if (date) return date;
  }
  return null;
}

function firstKnownPaymentHistory(...values: unknown[]): CanonicalTradelinePaymentHistory {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value as ParsedPaymentHistoryDetail[];
    if (isRecord(value) && Object.keys(value).length > 0) return value;
    const text = textOrNull(value);
    if (text) return text;
  }
  return null;
}

function getValueAtPath(root: unknown, path: string): unknown {
  return path.split(".").reduce((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, root);
}

function canonicalFieldValue(
  output: DeterministicNormalizedReport,
  index: number,
  fieldPath: string,
): unknown {
  return output.fields[`tradelines[${index}].${fieldPath}`]?.value;
}

function evidenceRefFromCanonicalField(input: {
  fieldKey: string;
  evidence: CanonicalFieldEvidence | null | undefined;
  sourceField?: unknown;
  reportArtifactId: number | null;
}): CanonicalTradelineEvidenceRef | null {
  const evidence = input.evidence;
  if (!evidence) return null;

  const ref: CanonicalTradelineEvidenceRef = {
    fieldKey: input.fieldKey,
    ...(textOrNull(evidence.evidenceId) ? { evidenceId: textOrNull(evidence.evidenceId)! } : {}),
    ...(textOrNull(input.sourceField) ? { sourceField: textOrNull(input.sourceField)! } : {}),
    ...(textOrNull(evidence.sourceMethod) ? { sourceMethod: textOrNull(evidence.sourceMethod)! } : {}),
    ...(positiveIntegerOrNull(evidence.pageNumber) ? { pageNumber: positiveIntegerOrNull(evidence.pageNumber)! } : {}),
    ...(textOrNull(evidence.textSnippet) ? { textSnippet: textOrNull(evidence.textSnippet)! } : {}),
    ...(input.reportArtifactId ? { reportArtifactId: input.reportArtifactId } : {}),
  };

  return Object.keys(ref).length > 1 ? ref : null;
}

function deterministicEvidenceRefs(
  output: DeterministicNormalizedReport,
  index: number,
  sourceArtifactId: number | null,
): CanonicalTradelineEvidenceRef[] {
  const prefix = `tradelines[${index}].`;
  return Object.entries(output.fields)
    .filter(([fieldKey]) => fieldKey.startsWith(prefix))
    .map(([fieldKey, field]) =>
      evidenceRefFromCanonicalField({
        fieldKey,
        evidence: field.evidence,
        sourceField: field.sourceMethod,
        reportArtifactId: sourceArtifactId,
      }),
    )
    .filter((ref): ref is CanonicalTradelineEvidenceRef => Boolean(ref));
}

export function buildCanonicalTradelineViewFromParsedTradeline(
  input: BuildCanonicalTradelineViewFromParsedInput,
): CanonicalTradelineView {
  const sourceArtifactId = positiveIntegerOrNull(input.sourceArtifactId);
  const tradeline = input.tradeline ?? {};

  return {
    sourceArtifactId,
    tradelineId: positiveIntegerOrNull(input.tradelineId),
    bureau: textOrNull(input.bureau),
    creditorName: textOrNull(tradeline.creditorName),
    accountNumberMasked: maskAccountNumber(tradeline.accountNumber),
    accountType: textOrNull(tradeline.accountType),
    status: textOrNull(tradeline.status),
    balance: numberOrNull(tradeline.balance),
    dateOpened: dateOrNull(tradeline.dates?.opened),
    dateClosed: dateOrNull(tradeline.dates?.closed),
    dateOfFirstDelinquency: dateOrNull(tradeline.dates?.dofd),
    lastPaymentDate: dateOrNull(tradeline.lastPaymentDate),
    lastReportedDate: dateOrNull(tradeline.dates?.reported),
    paymentHistory: firstKnownPaymentHistory(
      tradeline.paymentHistoryDetails,
      tradeline.paymentHistory,
      tradeline.paymentHistoryProfile,
      tradeline.paymentPattern,
    ),
    remarks: normalizeRemarks([tradeline.remarkCodes, tradeline.notes]),
    disputeStatus: textOrNull(input.disputeStatus),
    evidenceRefs: [
      ...normalizeEvidenceRefs(input.evidenceRefs),
      ...sourceTextEvidenceRef({
        sourceText: tradeline.sourceText,
        sourceArtifactId,
        tradelineIndex: input.tradelineIndex,
      }),
    ],
    parserConfidence: confidenceOrNull(input.parserConfidence),
    rawSourceType: "parsed_tradeline",
  };
}

export function buildCanonicalTradelineViewFromPersistedTradeline(
  input: BuildCanonicalTradelineViewFromPersistedInput,
): CanonicalTradelineView {
  const tradeline = input.tradeline ?? {};
  const sourceArtifactId = positiveIntegerOrNull(input.sourceArtifactId ?? tradeline.reportArtifactId);

  return {
    sourceArtifactId,
    tradelineId: positiveIntegerOrNull(input.tradelineId ?? tradeline.id),
    bureau: firstKnown(input.bureau, tradeline.bureauName),
    creditorName: textOrNull(tradeline.creditorName),
    accountNumberMasked: maskAccountNumber(tradeline.accountNumber),
    accountType: textOrNull(tradeline.accountType),
    status: textOrNull(tradeline.status),
    balance: firstKnownNumber(tradeline.currentBalance, tradeline.balance),
    dateOpened: dateOrNull(tradeline.openedDate),
    dateClosed: dateOrNull(tradeline.dateClosed),
    dateOfFirstDelinquency: dateOrNull(tradeline.dateOfFirstDelinquency),
    lastPaymentDate: dateOrNull(tradeline.dateOfLastPayment),
    lastReportedDate: dateOrNull(tradeline.lastReportedDate),
    paymentHistory: firstKnownPaymentHistory(
      tradeline.paymentHistoryProfile,
      tradeline.paymentPattern,
    ),
    remarks: normalizeRemarks([tradeline.notes, tradeline.ratingCode, tradeline.ratingCodeDescription]),
    disputeStatus: textOrNull(input.disputeStatus),
    evidenceRefs: normalizeEvidenceRefs(input.evidenceRefs),
    parserConfidence: confidenceOrNull(input.parserConfidence),
    rawSourceType: "persisted_tradeline",
  };
}

export function buildCanonicalTradelineViewFromDeterministicOutput(
  input: BuildCanonicalTradelineViewFromDeterministicOutputInput,
): CanonicalTradelineView | null {
  const output = input.canonicalOutput;
  const index = Number(input.tradelineIndex ?? 0);
  if (!output || !Number.isInteger(index) || index < 0) return null;

  const tradeline = output.tradelines[index];
  if (!isRecord(tradeline)) return null;

  const sourceArtifactId = positiveIntegerOrNull(input.sourceArtifactId);
  const field = (fieldPath: string) => canonicalFieldValue(output, index, fieldPath);

  return {
    sourceArtifactId,
    tradelineId: positiveIntegerOrNull(input.tradelineId),
    bureau: firstKnown(input.bureau, output.reportMetadata?.bureauName),
    creditorName: firstKnown(tradeline.creditorName, field("creditorName")),
    accountNumberMasked: maskAccountNumber(firstKnown(tradeline.accountNumber, field("accountNumber"))),
    accountType: firstKnown(tradeline.accountType, field("accountType")),
    status: firstKnown(tradeline.status, field("status")),
    balance: firstKnownNumber(tradeline.balance, field("balance")),
    dateOpened: firstKnownDate(getValueAtPath(tradeline, "dates.opened"), field("dates.opened")),
    dateClosed: firstKnownDate(getValueAtPath(tradeline, "dates.closed"), field("dates.closed")),
    dateOfFirstDelinquency: firstKnownDate(getValueAtPath(tradeline, "dates.dofd"), field("dates.dofd")),
    lastPaymentDate: firstKnownDate(tradeline.lastPaymentDate, field("lastPaymentDate")),
    lastReportedDate: firstKnownDate(getValueAtPath(tradeline, "dates.reported"), field("dates.reported")),
    paymentHistory: firstKnownPaymentHistory(
      tradeline.paymentHistoryDetails,
      field("paymentHistoryDetails"),
      tradeline.paymentHistory,
      field("paymentHistory"),
      tradeline.paymentHistoryProfile,
      field("paymentHistoryProfile"),
      tradeline.paymentPattern,
      field("paymentPattern"),
    ),
    remarks: normalizeRemarks([tradeline.remarkCodes, tradeline.notes]),
    disputeStatus: textOrNull(input.disputeStatus),
    evidenceRefs: [
      ...normalizeEvidenceRefs(input.evidenceRefs),
      ...deterministicEvidenceRefs(output, index, sourceArtifactId),
    ],
    parserConfidence: confidenceOrNull(input.parserConfidence),
    rawSourceType: "deterministic_canonical_output",
  };
}

export function buildCanonicalTradelineViewsFromDeterministicOutput(
  input: Omit<BuildCanonicalTradelineViewFromDeterministicOutputInput, "tradelineIndex" | "tradelineId">,
): CanonicalTradelineView[] {
  return (input.canonicalOutput?.tradelines ?? [])
    .map((_, index) =>
      buildCanonicalTradelineViewFromDeterministicOutput({
        ...input,
        tradelineIndex: index,
      }),
    )
    .filter((view): view is CanonicalTradelineView => Boolean(view));
}
