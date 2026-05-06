import { detectBureauFromText } from "./bureauDetector";
import { extractConsumerInfo } from "./consumerInfoExtractor";
import { extractEquifaxTradelines } from "./equifaxPdfExtractor";
import { isEquifaxFormat } from "./equifaxReportParser";
import { extractReportMetadata } from "./reportMetadataExtractor";
import { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";
import { extractTradelines } from "./transunionPdfExtractor";

export type ParserPipelineAuditStatus =
  | "preserved"
  | "backfilled_from_raw_extractor"
  | "mapped_differently"
  | "raw_only"
  | "final_only";

export interface ParserPipelineFieldAuditEntry {
  fieldPath: string;
  entityType: "report" | "consumerInfo" | "tradeline";
  status: ParserPipelineAuditStatus;
  rawExtractedValue: unknown;
  normalizedValue: unknown;
  mappedValue: unknown;
  finalBeforeValue: unknown;
  finalAfterValue: unknown;
  persistedValue?: unknown;
  finalApiValue?: unknown;
  action: "none" | "backfilled" | "not_overwritten" | "unmatched_raw";
  reason: string;
}

export interface ParserPipelineFieldAudit {
  version: "parser-pipeline-field-reconciliation-v1";
  comparedAt: string;
  summary: {
    totalFieldsCompared: number;
    preservedFields: string[];
    backfilledFields: string[];
    mappedDifferentlyFields: string[];
    rawOnlyFields: string[];
    finalOnlyFields: string[];
  };
  entries: ParserPipelineFieldAuditEntry[];
}

export interface ParserFieldBaseline {
  rawText: string;
  sourceBureau: ComprehensiveParseResult["sourceBureau"];
  reportMetadata: ComprehensiveParseResult["reportMetadata"];
  consumerInfo: ComprehensiveParseResult["consumerInfo"];
  tradelines: ParsedTradeline[];
}

export interface ParserFieldReconciliationResult {
  parseResult: ComprehensiveParseResult;
  audit: ParserPipelineFieldAudit;
  changed: boolean;
}

const CONSUMER_FIELDS = [
  "fullName",
  "addressLine1",
  "addressLine2",
  "city",
  "province",
  "postalCode",
  "dateOfBirth",
  "dateOfBirthRaw",
  "phone",
  "phoneSecondary",
  "sinLastDigits",
  "previousAddresses",
] as const;

const REPORT_METADATA_FIELDS = [
  "reportDate",
  "reportNumber",
  "fileNumber",
  "bureauFileId",
  "transUnionCaseId",
  "bureauName",
] as const;

const TRADELINE_FIELDS = [
  "creditorName",
  "accountNumber",
  "accountType",
  "balance",
  "status",
  "dates.opened",
  "dates.reported",
  "dates.closed",
  "dates.dofd",
  "amounts.high",
  "amounts.pastDue",
  "remarkCodes",
  "responsibilityCode",
  "collectionAgencyName",
  "originalCreditorName",
  "dateAssignedToCollection",
  "originalBalance",
  "creditLimit",
  "monthlyPayment",
  "scheduledMonthlyPayment",
  "paymentFrequency",
  "lastActivityDate",
  "lastPaymentDate",
  "postedDate",
  "chargeOffDate",
  "balloonPaymentDate",
  "mop",
  "terms",
  "paymentPattern",
  "paymentHistoryProfile",
  "monthsReviewed",
  "paymentHistory",
  "paymentHistoryDetails",
  "creditorPhone",
  "memberNumber",
  "ratingCode",
  "ratingCodeDescription",
  "amountWrittenOff",
  "notes",
  "dateVerified",
  "datePaidSettled",
  "sourceText",
] as const;

const MISSING_TEXT_VALUES = new Set([
  "unknown",
  "unknown creditor",
  "n/a",
  "na",
  "missing",
  "not reported",
  "not available",
  "not parsed",
  "blank",
  "blank / not parsed",
  "-",
  "--",
  "none",
]);

function cloneDateLike<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  return value;
}

function cloneTradeline(tradeline: ParsedTradeline): ParsedTradeline {
  return {
    ...tradeline,
    dates: { ...(tradeline.dates ?? {}) },
    amounts: { ...(tradeline.amounts ?? {}) },
    remarkCodes: [...(tradeline.remarkCodes ?? [])],
    paymentHistory: tradeline.paymentHistory ? { ...tradeline.paymentHistory } : tradeline.paymentHistory,
    paymentHistoryDetails: tradeline.paymentHistoryDetails?.map((detail) => ({ ...detail })) ?? tradeline.paymentHistoryDetails,
  };
}

function cloneParseResult(parseResult: ComprehensiveParseResult): ComprehensiveParseResult {
  return {
    ...parseResult,
    sourceBureau: parseResult.sourceBureau ? { ...parseResult.sourceBureau } : null,
    reportMetadata: { ...parseResult.reportMetadata },
    consumerInfo: parseResult.consumerInfo
      ? {
          ...parseResult.consumerInfo,
          dateOfBirth: cloneDateLike(parseResult.consumerInfo.dateOfBirth),
          previousAddresses: parseResult.consumerInfo.previousAddresses?.map((address) => ({ ...address })) ?? [],
        }
      : null,
    tradelines: parseResult.tradelines.map(cloneTradeline),
    creditScores: parseResult.creditScores.map((score) => ({ ...score })),
    inquiries: parseResult.inquiries.map((inquiry) => ({ ...inquiry })),
    publicRecords: parseResult.publicRecords.map((record) => ({ ...record })),
    consumerStatements: parseResult.consumerStatements.map((statement) => ({ ...statement })),
    employmentInfo: parseResult.employmentInfo.map((employment) => ({ ...employment })),
    paymentHistories: parseResult.paymentHistories.map((history) => ({ ...history })),
  };
}

function defaultConsumerInfo(): NonNullable<ComprehensiveParseResult["consumerInfo"]> {
  return {
    fullName: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    dateOfBirth: null,
    dateOfBirthRaw: null,
    phone: null,
    phoneSecondary: null,
    sinLastDigits: null,
    previousAddresses: [],
    confidence: 0,
  };
}

function normalizePath(path: string): Array<string | number> {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function getParserPipelineValue(root: unknown, fieldPath: string): unknown {
  let current = root as any;
  for (const segment of normalizePath(fieldPath)) {
    if (current == null) return undefined;
    current = current[segment as any];
  }
  return current;
}

function getPathValue(root: unknown, path: string): unknown {
  return getParserPipelineValue(root, path);
}

function setPathValue(root: any, path: string, value: unknown): void {
  const segments = normalizePath(path);
  let current = root;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    if (current[segment as any] == null) {
      current[segment as any] = typeof nextSegment === "number" ? [] : {};
    }
    current = current[segment as any];
  }

  current[segments[segments.length - 1] as any] = value;
}

function isMissingText(value: string): boolean {
  return MISSING_TEXT_VALUES.has(value.trim().toLowerCase());
}

function isMissingFinalValue(value: unknown): boolean {
  if (value == null) return true;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return !trimmed || isMissingText(trimmed);
  }
  return false;
}

function hasRecoverableRawValue(value: unknown): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasRecoverableRawValue);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasRecoverableRawValue);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return Boolean(trimmed && !isMissingText(trimmed));
  }
  return true;
}

function isDateLikeField(fieldPath: string): boolean {
  return /date|dob|opened|reported|closed|dofd/i.test(fieldPath);
}

function isoDateOnly(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as any);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeForComparison(value: unknown, fieldPath: string): unknown {
  if (!hasRecoverableRawValue(value)) return null;

  if (isDateLikeField(fieldPath)) {
    const dateOnly = isoDateOnly(value);
    if (dateOnly) return dateOnly;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForComparison(entry, fieldPath)).filter((entry) => entry !== null);
  }

  if (typeof value === "object" && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const normalizedNested = normalizeForComparison(nestedValue, `${fieldPath}.${key}`);
      if (normalizedNested !== null) normalized[key] = normalizedNested;
    }
    return normalized;
  }

  const asText = String(value).replace(/\s+/g, " ").trim();
  if (!asText || isMissingText(asText)) return null;

  const numeric = Number(asText.replace(/[$,\s]/g, ""));
  if (/amount|balance|credit|payment|limit|pastDue|high/i.test(fieldPath) && Number.isFinite(numeric)) {
    return numeric;
  }

  return asText.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function toAuditValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map(toAuditValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result[key] = toAuditValue(nestedValue);
    }
    return result;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 300 ? `${normalized.slice(0, 300)}...` : normalized;
  }
  return value;
}

function valuesEquivalent(left: unknown, right: unknown, fieldPath: string): boolean {
  return JSON.stringify(normalizeForComparison(left, fieldPath)) === JSON.stringify(normalizeForComparison(right, fieldPath));
}

function buildEntry(params: {
  fieldPath: string;
  entityType: ParserPipelineFieldAuditEntry["entityType"];
  status: ParserPipelineAuditStatus;
  rawValue: unknown;
  finalBeforeValue: unknown;
  finalAfterValue: unknown;
  action: ParserPipelineFieldAuditEntry["action"];
  reason: string;
}): ParserPipelineFieldAuditEntry {
  return {
    fieldPath: params.fieldPath,
    entityType: params.entityType,
    status: params.status,
    rawExtractedValue: toAuditValue(params.rawValue),
    normalizedValue: toAuditValue(normalizeForComparison(params.rawValue, params.fieldPath)),
    mappedValue: toAuditValue(params.finalBeforeValue),
    finalBeforeValue: toAuditValue(params.finalBeforeValue),
    finalAfterValue: toAuditValue(params.finalAfterValue),
    action: params.action,
    reason: params.reason,
  };
}

function normalizeAccountNumber(value: string | null | undefined): string | null {
  const normalized = (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized || ["UNKNOWN", "NA", "NOTREPORTED", "NOTAVAILABLE"].includes(normalized)) return null;
  return normalized;
}

function accountNumbersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeAccountNumber(a);
  const right = normalizeAccountNumber(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const minLength = Math.min(left.length, right.length);
  return minLength >= 4 && (left.endsWith(right) || right.endsWith(left));
}

function textLooksSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeForComparison(a, "text");
  const right = normalizeForComparison(b, "text");
  if (typeof left !== "string" || typeof right !== "string") return false;
  return left === right || left.includes(right) || right.includes(left);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function amountsClose(a: unknown, b: unknown, tolerance = 0.1): boolean {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left === null || right === null) return false;
  const max = Math.max(Math.abs(left), Math.abs(right));
  if (max === 0) return true;
  return Math.abs(left - right) / max <= tolerance;
}

function scoreTradelineMatch(raw: ParsedTradeline, final: ParsedTradeline, rawIndex: number, finalIndex: number): number {
  let score = rawIndex === finalIndex ? 10 : 0;
  if (accountNumbersMatch(raw.accountNumber, final.accountNumber)) score += 45;
  if (textLooksSimilar(raw.creditorName, final.creditorName)) score += 25;
  if (textLooksSimilar(raw.accountType, final.accountType)) score += 10;
  if (textLooksSimilar(raw.status, final.status)) score += 5;
  if (amountsClose(raw.balance, final.balance)) score += 8;
  if (valuesEquivalent(raw.dates?.opened, final.dates?.opened, "dates.opened")) score += 10;
  if (valuesEquivalent(raw.dates?.reported, final.dates?.reported, "dates.reported")) score += 5;
  return score;
}

function matchRawTradelines(rawTradelines: ParsedTradeline[], finalTradelines: ParsedTradeline[]): Map<number, number> {
  const matches = new Map<number, number>();
  const usedRawIndexes = new Set<number>();

  finalTradelines.forEach((finalTradeline, finalIndex) => {
    let best: { rawIndex: number; score: number } | null = null;
    rawTradelines.forEach((rawTradeline, rawIndex) => {
      if (usedRawIndexes.has(rawIndex)) return;
      const score = scoreTradelineMatch(rawTradeline, finalTradeline, rawIndex, finalIndex);
      if (!best || score > best.score) best = { rawIndex, score };
    });

    if (best && best.score >= 25) {
      matches.set(finalIndex, best.rawIndex);
      usedRawIndexes.add(best.rawIndex);
      return;
    }

    if (
      rawTradelines.length === finalTradelines.length &&
      rawTradelines[finalIndex] &&
      !usedRawIndexes.has(finalIndex)
    ) {
      matches.set(finalIndex, finalIndex);
      usedRawIndexes.add(finalIndex);
    }
  });

  return matches;
}

export function extractRawParserFieldBaseline(rawText: string): ParserFieldBaseline {
  const sourceBureau = detectBureauFromText(rawText);
  const reportMetadata = extractReportMetadata(rawText);
  const consumerInfo = extractConsumerInfo(rawText);
  const useEquifax = isEquifaxFormat(rawText) || sourceBureau?.bureauName === "Equifax Canada";

  return {
    rawText,
    sourceBureau: sourceBureau
      ? { bureauName: sourceBureau.bureauName, confidence: sourceBureau.confidence }
      : null,
    reportMetadata,
    consumerInfo,
    tradelines: useEquifax ? extractEquifaxTradelines(rawText) : extractTradelines(rawText),
  };
}

function baselineFromParseResult(parseResult: ComprehensiveParseResult): ParserFieldBaseline {
  return {
    rawText: parseResult.rawText,
    sourceBureau: parseResult.sourceBureau,
    reportMetadata: parseResult.reportMetadata,
    consumerInfo: parseResult.consumerInfo,
    tradelines: parseResult.tradelines,
  };
}

function pushSummary(audit: ParserPipelineFieldAudit, entry: ParserPipelineFieldAuditEntry): void {
  audit.entries.push(entry);
  audit.summary.totalFieldsCompared += 1;

  if (entry.status === "preserved") audit.summary.preservedFields.push(entry.fieldPath);
  if (entry.status === "backfilled_from_raw_extractor") audit.summary.backfilledFields.push(entry.fieldPath);
  if (entry.status === "mapped_differently") audit.summary.mappedDifferentlyFields.push(entry.fieldPath);
  if (entry.status === "raw_only") audit.summary.rawOnlyFields.push(entry.fieldPath);
  if (entry.status === "final_only") audit.summary.finalOnlyFields.push(entry.fieldPath);
}

function compareAndMaybeBackfill(params: {
  audit: ParserPipelineFieldAudit;
  parseResult: ComprehensiveParseResult;
  entityType: ParserPipelineFieldAuditEntry["entityType"];
  fieldPath: string;
  rawValue: unknown;
  finalBeforeValue: unknown;
  setFinalValue: (value: unknown) => void;
}): boolean {
  const rawHasValue = hasRecoverableRawValue(params.rawValue);
  const finalHasValue = !isMissingFinalValue(params.finalBeforeValue);

  if (!rawHasValue && !finalHasValue) return false;

  if (rawHasValue && !finalHasValue) {
    params.setFinalValue(params.rawValue);
    const finalAfterValue = getParserPipelineValue(params.parseResult, params.fieldPath);
    pushSummary(
      params.audit,
      buildEntry({
        fieldPath: params.fieldPath,
        entityType: params.entityType,
        status: "backfilled_from_raw_extractor",
        rawValue: params.rawValue,
        finalBeforeValue: params.finalBeforeValue,
        finalAfterValue,
        action: "backfilled",
        reason: "Raw deterministic extraction had a value while the mapped production result was missing.",
      }),
    );
    return true;
  }

  if (rawHasValue && finalHasValue) {
    const equivalent = valuesEquivalent(params.rawValue, params.finalBeforeValue, params.fieldPath);
    pushSummary(
      params.audit,
      buildEntry({
        fieldPath: params.fieldPath,
        entityType: params.entityType,
        status: equivalent ? "preserved" : "mapped_differently",
        rawValue: params.rawValue,
        finalBeforeValue: params.finalBeforeValue,
        finalAfterValue: params.finalBeforeValue,
        action: equivalent ? "none" : "not_overwritten",
        reason: equivalent
          ? "Raw deterministic extraction and mapped production value are equivalent after normalization."
          : "Mapped production value was non-empty, so reconciliation did not overwrite it.",
      }),
    );
    return false;
  }

  pushSummary(
    params.audit,
    buildEntry({
      fieldPath: params.fieldPath,
      entityType: params.entityType,
      status: "final_only",
      rawValue: params.rawValue,
      finalBeforeValue: params.finalBeforeValue,
      finalAfterValue: params.finalBeforeValue,
      action: "none",
      reason: "Mapped production value was present and raw deterministic extraction did not expose this field.",
    }),
  );
  return false;
}

export function reconcileParserPipelineFields(
  finalParseResult: ComprehensiveParseResult,
  rawBaselineOrParseResult: ParserFieldBaseline | ComprehensiveParseResult,
): ParserFieldReconciliationResult {
  const rawBaseline =
    "reportMetadata" in rawBaselineOrParseResult && "rawText" in rawBaselineOrParseResult && "creditScores" in rawBaselineOrParseResult
      ? baselineFromParseResult(rawBaselineOrParseResult)
      : rawBaselineOrParseResult;

  const parseResult = cloneParseResult(finalParseResult);
  const audit: ParserPipelineFieldAudit = {
    version: "parser-pipeline-field-reconciliation-v1",
    comparedAt: new Date().toISOString(),
    summary: {
      totalFieldsCompared: 0,
      preservedFields: [],
      backfilledFields: [],
      mappedDifferentlyFields: [],
      rawOnlyFields: [],
      finalOnlyFields: [],
    },
    entries: [],
  };

  let changed = false;

  const rawConsumerHasValues =
    rawBaseline.consumerInfo &&
    CONSUMER_FIELDS.some((field) => hasRecoverableRawValue((rawBaseline.consumerInfo as any)?.[field]));

  if (rawBaseline.consumerInfo && rawConsumerHasValues) {
    if (!parseResult.consumerInfo) {
      parseResult.consumerInfo = defaultConsumerInfo();
    }

    for (const field of CONSUMER_FIELDS) {
      const fieldPath = `consumerInfo.${field}`;
      const rawValue = (rawBaseline.consumerInfo as any)?.[field];
      const finalBeforeValue = (parseResult.consumerInfo as any)?.[field];
      changed =
        compareAndMaybeBackfill({
          audit,
          parseResult,
          entityType: "consumerInfo",
          fieldPath,
          rawValue,
          finalBeforeValue,
          setFinalValue: (value) => {
            (parseResult.consumerInfo as any)[field] = value;
          },
        }) || changed;
    }
  }

  for (const field of REPORT_METADATA_FIELDS) {
    const fieldPath = `reportMetadata.${field}`;
    const rawValue = (rawBaseline.reportMetadata as any)?.[field];
    const finalBeforeValue = (parseResult.reportMetadata as any)?.[field];
    changed =
      compareAndMaybeBackfill({
        audit,
        parseResult,
        entityType: "report",
        fieldPath,
        rawValue,
        finalBeforeValue,
        setFinalValue: (value) => {
          (parseResult.reportMetadata as any)[field] = value;
        },
      }) || changed;
  }

  if (rawBaseline.sourceBureau?.bureauName) {
    const rawValue = rawBaseline.sourceBureau.bureauName;
    const fieldPath = "sourceBureau.bureauName";
    if (!parseResult.sourceBureau) {
      parseResult.sourceBureau = {
        bureauName: "",
        confidence: rawBaseline.sourceBureau.confidence,
      };
    }
    const finalBeforeValue = parseResult.sourceBureau.bureauName;
    changed =
      compareAndMaybeBackfill({
        audit,
        parseResult,
        entityType: "report",
        fieldPath,
        rawValue,
        finalBeforeValue,
        setFinalValue: (value) => {
          parseResult.sourceBureau = {
            bureauName: String(value),
            confidence: parseResult.sourceBureau?.confidence ?? rawBaseline.sourceBureau?.confidence ?? 0,
          };
        },
      }) || changed;
  }

  const tradelineMatches = matchRawTradelines(rawBaseline.tradelines, parseResult.tradelines);
  const matchedRawIndexes = new Set(tradelineMatches.values());

  for (const [finalIndex, rawIndex] of tradelineMatches.entries()) {
    const rawTradeline = rawBaseline.tradelines[rawIndex];
    const finalTradeline = parseResult.tradelines[finalIndex];
    if (!rawTradeline || !finalTradeline) continue;

    for (const field of TRADELINE_FIELDS) {
      const fieldPath = `tradelines[${finalIndex}].${field}`;
      const rawValue = getPathValue(rawTradeline, field);
      const finalBeforeValue = getPathValue(finalTradeline, field);
      changed =
        compareAndMaybeBackfill({
          audit,
          parseResult,
          entityType: "tradeline",
          fieldPath,
          rawValue,
          finalBeforeValue,
          setFinalValue: (value) => {
            setPathValue(finalTradeline, field, value);
          },
        }) || changed;
    }
  }

  rawBaseline.tradelines.forEach((rawTradeline, rawIndex) => {
    if (matchedRawIndexes.has(rawIndex)) return;
    const fieldPath = `rawTradelines[${rawIndex}].creditorName`;
    const rawValue = rawTradeline.creditorName || rawTradeline.accountNumber || rawTradeline.sourceText;
    if (!hasRecoverableRawValue(rawValue)) return;
    pushSummary(
      audit,
      buildEntry({
        fieldPath,
        entityType: "tradeline",
        status: "raw_only",
        rawValue,
        finalBeforeValue: null,
        finalAfterValue: null,
        action: "unmatched_raw",
        reason: "Raw deterministic extraction found a tradeline that could not be matched to the mapped production result.",
      }),
    );
  });

  return { parseResult, audit, changed };
}

export function attachRuntimeValuesToParserPipelineAudit(params: {
  audit: ParserPipelineFieldAudit;
  persistedRoot?: unknown;
  finalApiRoot?: unknown;
}): ParserPipelineFieldAudit {
  return {
    ...params.audit,
    entries: params.audit.entries.map((entry) => ({
      ...entry,
      ...(params.persistedRoot ? { persistedValue: toAuditValue(getParserPipelineValue(params.persistedRoot, entry.fieldPath)) } : {}),
      ...(params.finalApiRoot ? { finalApiValue: toAuditValue(getParserPipelineValue(params.finalApiRoot, entry.fieldPath)) } : {}),
    })),
  };
}
