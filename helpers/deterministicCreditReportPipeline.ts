import { sha256Hex } from "./reportBinaryUtils";
import type { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";
import { sanitizeCreditorName } from "./tradelineBasicInfoExtractors";

export const DETERMINISTIC_CREDIT_REPORT_PIPELINE_VERSION =
  "deterministic-credit-report-pipeline-v1";

export const DETERMINISTIC_PIPELINE_STAGES = [
  "UPLOAD",
  "TEXT_EXTRACTION",
  "STRUCTURAL_SEGMENTATION",
  "SEMANTIC_ZONE_DETECTION",
  "RAW_TOKENIZATION",
  "STRUCTURED_CANDIDATE_EXTRACTION",
  "DETERMINISTIC_CANONICAL_SELECTION",
  "PARSER_RULE_APPLICATION",
  "VALIDATION",
  "FIELD_RECONCILIATION",
  "VIOLATION_DETECTION",
  "EVIDENCE_LINKING",
  "PERSISTENCE",
  "FINAL_OUTPUT",
] as const;

export type DeterministicPipelineStage =
  (typeof DETERMINISTIC_PIPELINE_STAGES)[number];

export type TokenClass =
  | "amount"
  | "date"
  | "label"
  | "number"
  | "account_number"
  | "text";

export interface CanonicalFieldEvidence {
  evidenceId?: string;
  pageNumber?: number;
  textSnippet?: string;
  tokenIndexes?: number[];
  boundingBox?: object;
  sectionName?: string;
  zoneName?: string;
  ruleId?: string;
}

export interface CanonicalFieldAlternative {
  value: unknown;
  normalizedValue: unknown;
  reasonNotSelected: string;
  evidence: CanonicalFieldEvidence;
}

export interface CanonicalFieldHistoryEntry {
  stage: string;
  previousValue: unknown;
  nextValue: unknown;
  reason: string;
}

export interface CanonicalFieldObject<T = unknown> {
  fieldKey: string;
  value: T;
  normalizedValue: unknown;
  confidence: 1.0;
  deterministic: true;
  sourceStage: string;
  sourceMethod: string;
  parserRuleId?: string;
  evidence: CanonicalFieldEvidence;
  alternatives: CanonicalFieldAlternative[];
  history: CanonicalFieldHistoryEntry[];
}

export interface RawToken {
  index: number;
  text: string;
  normalizedText: string;
  tokenClass: TokenClass;
  pageNumber: number;
  lineNumber: number;
  charStart: number;
  charEnd: number;
  sectionName: string;
  zoneName: string;
}

export interface StructuralSegment {
  name: string;
  sectionName: string;
  zoneName: string;
  pageNumber: number;
  startLineNumber: number;
  endLineNumber: number;
  startTokenIndex: number;
  endTokenIndex: number;
  headerText: string | null;
}

export interface SemanticZone {
  zoneName: string;
  sectionName: string;
  pageNumbers: number[];
  tokenIndexes: number[];
}

export interface DeterministicFieldCandidate {
  candidateId: string;
  fieldKey: string;
  value: unknown;
  normalizedValue: unknown;
  sourceStage: DeterministicPipelineStage | "LLM_DIAGNOSTIC";
  sourceMethod: string;
  parserRuleId?: string;
  evidence: CanonicalFieldEvidence;
  score: number;
  scoreBreakdown: Record<string, number>;
  canonicalEligible: boolean;
  reason?: string;
  order: number;
}

export interface CandidatePool {
  fieldKey: string;
  selectionRuleId: "deterministic-score-v1";
  candidates: DeterministicFieldCandidate[];
  selectedCandidateId: string | null;
  alternatives: CanonicalFieldAlternative[];
}

export interface CanonicalEvidenceCoverage {
  totalCanonicalFields: number;
  fieldsWithEvidence: number;
  fieldsMissingEvidence: string[];
  requiredFieldKeys: string[];
  requiredFieldsWithEvidence: number;
  requiredFieldsMissingEvidence: string[];
  coveragePercent: number;
  requiredCoveragePercent: number;
}

export interface CanonicalEvidenceModel {
  fieldIndex: Record<string, CanonicalFieldEvidence>;
  coverage: CanonicalEvidenceCoverage;
}

export interface DeterministicNormalizedReport {
  version: typeof DETERMINISTIC_CREDIT_REPORT_PIPELINE_VERSION;
  fields: Record<string, CanonicalFieldObject>;
  evidence: CanonicalEvidenceModel;
  reportMetadata: Record<string, unknown>;
  consumerInfo: Record<string, unknown> | null;
  tradelines: Array<Record<string, unknown>>;
  creditScores: Array<Record<string, unknown>>;
  inquiries: Array<Record<string, unknown>>;
  publicRecords: Array<Record<string, unknown>>;
  consumerStatements: Array<Record<string, unknown>>;
  employmentInfo: Array<Record<string, unknown>>;
  paymentHistories: Array<Record<string, unknown>>;
}

export interface DeterministicPipelinePackage {
  version: typeof DETERMINISTIC_CREDIT_REPORT_PIPELINE_VERSION;
  stages: readonly DeterministicPipelineStage[];
  sourceMethod: "pdf_text";
  documentBinarySha256: string;
  rawTextSha256: string;
  canonicalResultSha256: string;
  replayHash: string;
  structuralSegmentation: {
    segments: StructuralSegment[];
  };
  semanticZoneDetection: {
    zones: SemanticZone[];
  };
  rawTokenization: {
    tokenCount: number;
    tokens: RawToken[];
  };
  candidatePools: CandidatePool[];
  finalOutput: DeterministicNormalizedReport;
  nonCanonicalDiagnostics: DeterministicFieldCandidate[];
  rules: {
    scoringRuleId: "deterministic-score-v1";
    orderingRule: string;
    nullOverwritePolicy: "reject_null_over_valid_value";
    aiCanonicalPolicy: "llm_candidates_are_diagnostic_only";
    appliedParserRuleIds: number[];
  };
}

export interface BuildDeterministicPipelineInput {
  parseResult: ComprehensiveParseResult;
  rawText: string;
  documentBinarySha256: string;
  appliedParserRuleIds?: number[];
  nonCanonicalDiagnostics?: DeterministicFieldCandidate[];
}

type TextLine = {
  pageNumber: number;
  lineNumber: number;
  text: string;
  normalizedText: string;
  tokenIndexes: number[];
  sectionName: string;
  zoneName: string;
};

const SECTION_RULES: Array<{
  sectionName: string;
  zoneName: string;
  patterns: RegExp[];
}> = [
  {
    sectionName: "consumer_identity",
    zoneName: "consumer_identity",
    patterns: [
      /\bpersonal\s+information\b/i,
      /\bconsumer\s+information\b/i,
      /\byour\s+information\b/i,
      /\bidentity\s+information\b/i,
    ],
  },
  {
    sectionName: "report_header",
    zoneName: "report_header",
    patterns: [
      /\bcredit\s+report\b/i,
      /\bcredit\s*report\s*request\s*date\b/i,
      /\bconsumer\s+disclosure\b/i,
      /\breport\s+date\b/i,
      /\bfile\s+number\b/i,
    ],
  },
  {
    sectionName: "tradeline_accounts",
    zoneName: "tradeline_accounts",
    patterns: [
      /\baccount\s+information\b/i,
      /^accounts?\s*-\s*(?:revolving|mortgage|installment|open)\b/i,
      /^account\(s\)\s*:?$/i,
      /\bcredit\s+account\b/i,
      /\btrade\s*lines?\b/i,
      /\brevolving\s+credit\b/i,
      /\binstallment\s+(?:loan|loans|credit)\b/i,
      /\bmortgage\b/i,
      /\bcollection\s+accounts?\b/i,
      /^collections\b/i,
    ],
  },
  {
    sectionName: "creditor_statement",
    zoneName: "creditor_statement",
    patterns: [
      /\baccount\s+statement\b/i,
      /\bstatement\s+date\b/i,
      /\bminimum\s+payment\b/i,
      /\bamount\s+due\b/i,
    ],
  },
  {
    sectionName: "collection_letter",
    zoneName: "collection_letter",
    patterns: [
      /\bcollection\s+notice\b/i,
      /\bdebt\s+collector\b/i,
      /\bcollection\s+agency\b/i,
      /\bamount\s+owing\b/i,
    ],
  },
  {
    sectionName: "inquiries",
    zoneName: "inquiries",
    patterns: [/\binquir(?:y|ies)\b/i, /\bcredit\s+checks?\b/i],
  },
  {
    sectionName: "consumer_statement",
    zoneName: "consumer_statement",
    patterns: [
      /\bconsumer\s+statement/i,
      /\bconsumer\s+message/i,
      /\bspecial\s+message/i,
      /\bfraud\s+alert/i,
      /\bsecurity\s+freeze/i,
    ],
  },
  {
    sectionName: "public_records",
    zoneName: "public_records",
    patterns: [/\bpublic\s+records?\b/i, /\bbankruptc(?:y|ies)\b/i],
  },
  {
    sectionName: "employment",
    zoneName: "employment",
    patterns: [/\bemployment\b/i, /\bemployer\b/i],
  },
];

const DOB_LABEL_PATTERNS = [
  /\bdate\s+of\s+birth\b/i,
  /\bbirth\s+date\b/i,
  /\bdob\b/i,
  /\bd\.o\.b\.\b/i,
  /\bdate\s+de\s+naissance\b/i,
  /\bbirth\s+day\b/i,
];

const REPORT_DATE_LABEL_PATTERNS = [
  /\breport\s+date\b/i,
  /\bdate\s+reported\b/i,
  /\bdisclosure\s+date\b/i,
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DATE_PATTERN =
  /(?:\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b|\b(?:Date)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{2,4}|\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+\d{2,4})/i;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTokenText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCanonicalValue(value: unknown): boolean {
  if (value == null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  const normalized = String(value).trim().toLowerCase();
  return Boolean(
    normalized &&
      ![
        "unknown",
        "unknown creditor",
        "not reported",
        "not provided",
        "not provided by bureau",
        "not available",
        "n/a",
        "na",
        "missing",
        "-",
        "--",
      ].includes(normalized),
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toFourDigitYear(value: number): number {
  if (value >= 100) return value;
  return value >= 30 ? 1900 + value : 2000 + value;
}

function validDateParts(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeCanonicalDate(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const raw = compactWhitespace(String(value).replace(/\./g, "")).replace(
    /^Date\s*(?=[A-Z][a-z])/,
    "",
  );

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validDateParts(year, month, day)
      ? `${year}-${pad2(month)}-${pad2(day)}`
      : null;
  }

  const numeric = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = toFourDigitYear(Number(numeric[3]));
    return validDateParts(year, month, day)
      ? `${year}-${pad2(month)}-${pad2(day)}`
      : null;
  }

  const named = raw.match(
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{2,4})$/i,
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = toFourDigitYear(Number(named[3]));
    return validDateParts(year, month, day)
      ? `${year}-${pad2(month)}-${pad2(day)}`
      : null;
  }

  const dayNamed = raw.match(
    /^(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+(\d{2,4})$/i,
  );
  if (dayNamed) {
    const day = Number(dayNamed[1]);
    const month = MONTHS[dayNamed[2].toLowerCase()];
    const year = toFourDigitYear(Number(dayNamed[3]));
    return validDateParts(year, month, day)
      ? `${year}-${pad2(month)}-${pad2(day)}`
      : null;
  }

  return null;
}

export function normalizeCanonicalAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const AMOUNT_FIELD_NAMES = new Set([
  "amount",
  "amountWrittenOff",
  "assetAmount",
  "balance",
  "balloonPayment",
  "chargeOff",
  "creditLimit",
  "exemptAmount",
  "high",
  "lastPaymentAmount",
  "liabilityAmount",
  "monthlyPayment",
  "originalBalance",
  "pastDue",
  "salary",
  "scheduledMonthlyPayment",
  "totalBalances",
  "totalCreditLimit",
]);

function canonicalFieldName(fieldKey: string): string {
  return fieldKey.replace(/\[\d+\]/g, "").split(".").at(-1) ?? fieldKey;
}

function isCreditorNameFieldKey(fieldKey: string): boolean {
  return ["creditorName", "originalCreditorName", "collectionAgencyName"].includes(canonicalFieldName(fieldKey));
}

function isAmountFieldKey(fieldKey: string): boolean {
  return AMOUNT_FIELD_NAMES.has(canonicalFieldName(fieldKey));
}

function normalizeCanonicalFieldInput(fieldKey: string, value: unknown): unknown {
  if (isCreditorNameFieldKey(fieldKey) && typeof value === "string") {
    return sanitizeCreditorName(value) ?? value.trim();
  }
  return value;
}

function normalizeCanonicalValue(fieldKey: string, value: unknown): unknown {
  value = normalizeCanonicalFieldInput(fieldKey, value);
  if (!hasCanonicalValue(value)) return null;
  if (/date|dob|opened|reported|closed|dofd|paid|assigned|posted|verified/i.test(fieldKey)) {
    return normalizeCanonicalDate(value) ?? compactWhitespace(String(value));
  }
  if (isAmountFieldKey(fieldKey)) {
    return normalizeCanonicalAmount(value);
  }
  if (value instanceof Date) return normalizeCanonicalDate(value);
  if (typeof value === "string") return compactWhitespace(value);
  if (Array.isArray(value)) return value.map((entry) => normalizeSerializableValue(entry));
  if (typeof value === "object" && value !== null) return normalizeSerializableValue(value);
  return value;
}

function normalizeSerializableValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return normalizeCanonicalDate(value);
  if (Array.isArray(value)) return value.map(normalizeSerializableValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = normalizeSerializableValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return normalizeCanonicalDate(value);
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = stableValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function stableCanonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function classifyToken(text: string): TokenClass {
  if (/^\$?-?\d[\d,]*(?:\.\d{2})?$/.test(text)) return "amount";
  if (DATE_PATTERN.test(text)) return "date";
  if (/^[*xX#-]*[A-Za-z0-9]{4,}[*xX#-]*$/.test(text) && /\d/.test(text)) {
    return "account_number";
  }
  if (/^\d+$/.test(text)) return "number";
  if (
    /^(dob|birth|date|account|balance|status|opened|closed|reported|creditor|address|name|sin)$/i.test(
      text.replace(/[:.]/g, ""),
    )
  ) {
    return "label";
  }
  return "text";
}

function detectSection(line: string): { sectionName: string; zoneName: string } | null {
  for (const rule of SECTION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(line))) {
      return { sectionName: rule.sectionName, zoneName: rule.zoneName };
    }
  }
  return null;
}

function buildTextStructure(rawText: string): {
  tokens: RawToken[];
  lines: TextLine[];
  segments: StructuralSegment[];
  zones: SemanticZone[];
} {
  const tokens: RawToken[] = [];
  const lines: TextLine[] = [];
  const segments: StructuralSegment[] = [];
  let charCursor = 0;
  let currentSection = "document_body";
  let currentZone = "document_body";
  let currentSegment: StructuralSegment | null = null;

  const pages = rawText.split(/\f|(?:\bEnd\s+of\s+Page\b[^\n]*)/i);

  pages.forEach((pageText, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const pageLines = pageText.split(/\r?\n/);

    pageLines.forEach((lineText, pageLineIndex) => {
      const trimmed = compactWhitespace(lineText);
      const lineNumber = lines.length + 1;
      if (!trimmed) {
        charCursor += lineText.length + 1;
        return;
      }

      const detected = detectSection(trimmed);
      if (detected) {
        if (currentSegment) {
          currentSegment.endLineNumber = Math.max(currentSegment.endLineNumber, lineNumber - 1);
          currentSegment.endTokenIndex = Math.max(
            currentSegment.endTokenIndex,
            tokens[tokens.length - 1]?.index ?? currentSegment.startTokenIndex,
          );
          segments.push(currentSegment);
        }

        currentSection = detected.sectionName;
        currentZone = detected.zoneName;
        currentSegment = {
          name: `${detected.sectionName}-${segments.length + 1}`,
          sectionName: detected.sectionName,
          zoneName: detected.zoneName,
          pageNumber,
          startLineNumber: lineNumber,
          endLineNumber: lineNumber,
          startTokenIndex: tokens.length,
          endTokenIndex: tokens.length,
          headerText: trimmed,
        };
      } else if (!currentSegment) {
        currentSegment = {
          name: "document_body-1",
          sectionName: currentSection,
          zoneName: currentZone,
          pageNumber,
          startLineNumber: lineNumber,
          endLineNumber: lineNumber,
          startTokenIndex: tokens.length,
          endTokenIndex: tokens.length,
          headerText: null,
        };
      }

      const tokenIndexes: number[] = [];
      const lineStart = charCursor + lineText.indexOf(trimmed);
      for (const match of trimmed.matchAll(/\S+/g)) {
        const text = match[0];
        const start = lineStart + (match.index ?? 0);
        const token: RawToken = {
          index: tokens.length,
          text,
          normalizedText: normalizeTokenText(text),
          tokenClass: classifyToken(text),
          pageNumber,
          lineNumber,
          charStart: start,
          charEnd: start + text.length,
          sectionName: currentSection,
          zoneName: currentZone,
        };
        tokenIndexes.push(token.index);
        tokens.push(token);
      }

      if (currentSegment) {
        currentSegment.endLineNumber = lineNumber;
        currentSegment.endTokenIndex =
          tokenIndexes[tokenIndexes.length - 1] ?? currentSegment.endTokenIndex;
      }

      lines.push({
        pageNumber,
        lineNumber,
        text: trimmed,
        normalizedText: normalizeTokenText(trimmed),
        tokenIndexes,
        sectionName: currentSection,
        zoneName: currentZone,
      });

      charCursor += lineText.length + (pageLineIndex === pageLines.length - 1 ? 0 : 1);
    });
  });

  if (currentSegment) {
    currentSegment.endTokenIndex = Math.max(
      currentSegment.endTokenIndex,
      tokens[tokens.length - 1]?.index ?? currentSegment.startTokenIndex,
    );
    segments.push(currentSegment);
  }

  const zonesByName = new Map<string, SemanticZone>();
  for (const token of tokens) {
    const key = `${token.zoneName}|${token.sectionName}`;
    const zone =
      zonesByName.get(key) ??
      ({
        zoneName: token.zoneName,
        sectionName: token.sectionName,
        pageNumbers: [],
        tokenIndexes: [],
      } satisfies SemanticZone);
    if (!zone.pageNumbers.includes(token.pageNumber)) zone.pageNumbers.push(token.pageNumber);
    zone.tokenIndexes.push(token.index);
    zonesByName.set(key, zone);
  }

  return {
    tokens,
    lines,
    segments,
    zones: [...zonesByName.values()].sort((a, b) =>
      a.zoneName.localeCompare(b.zoneName) || a.sectionName.localeCompare(b.sectionName),
    ),
  };
}

function lineEvidence(
  line: TextLine | null,
  ruleId?: string,
): CanonicalFieldEvidence {
  if (!line) return ruleId ? { ruleId } : {};
  return {
    pageNumber: line.pageNumber,
    textSnippet: line.text,
    tokenIndexes: line.tokenIndexes,
    sectionName: line.sectionName,
    zoneName: line.zoneName,
    ...(ruleId ? { ruleId } : {}),
  };
}

const STATUS_EVIDENCE_CODES: Record<string, string[]> = {
  "account closed": ["AC"],
  "write off": ["WO"],
  "cancelled by credit grantor": ["CG"],
  "turned over to collection": ["TC"],
  "closed at consumer request": ["CZ"],
  "charge off": ["CO"],
  repossession: ["RP"],
  "legal action": ["LS"],
  bankruptcy: ["BK"],
};

function lineContainsAmountValue(line: TextLine, value: unknown): boolean {
  const amount = normalizeCanonicalAmount(value);
  if (amount === null) return false;

  const hasAmountContext =
    /\$/.test(line.text) ||
    /\b(balance|amount|credit\s+limit|past\s+due|payment|salary|high(?:est)?\s+balance)\b/i.test(line.text);
  if (!hasAmountContext) return false;

  for (const match of line.text.matchAll(/-?\$?\s*\d[\d,]*(?:\.\d{1,2})?/g)) {
    const parsed = normalizeCanonicalAmount(match[0]);
    if (parsed !== null && Math.abs(parsed - amount) < 0.005) return true;
  }

  return false;
}

function lineContainsStatusEvidence(fieldKey: string, line: TextLine, value: unknown): boolean {
  if (!/\.status$/i.test(fieldKey) || typeof value !== "string") return false;
  const codes = STATUS_EVIDENCE_CODES[normalizeTokenText(value)] ?? [];
  return codes.some((code) => new RegExp(`\\b${code}\\b`, "i").test(line.text));
}

function findEvidenceLine(
  lines: TextLine[],
  value: unknown,
  preferredZone?: string,
  fieldKey = "",
): TextLine | null {
  if (!hasCanonicalValue(value)) return null;

  const searchValues = flattenEvidenceSearchValues(value);
  const candidates = lines.filter((line) => {
    if (preferredZone && line.zoneName !== preferredZone) return false;
    return searchValues.some((searchValue) => {
      if (isAmountFieldKey(fieldKey) && lineContainsAmountValue(line, searchValue)) return true;
      if (lineContainsStatusEvidence(fieldKey, line, searchValue)) return true;
      const normalizedDate = normalizeCanonicalDate(searchValue);
      const normalizedText = normalizeTokenText(searchValue);
      if (normalizedDate) {
        const match = line.text.match(DATE_PATTERN);
        return Boolean(match && normalizeCanonicalDate(match[0]) === normalizedDate);
      }
      return normalizedText.length > 0 && line.normalizedText.includes(normalizedText);
    });
  });

  if (candidates.length > 0) return candidates[0];
  if (preferredZone) return findEvidenceLine(lines, value, undefined, fieldKey);
  return null;
}

function flattenEvidenceSearchValues(value: unknown, limit = 12): unknown[] {
  const values: unknown[] = [];
  const visit = (entry: unknown) => {
    if (values.length >= limit || !hasCanonicalValue(entry)) return;
    if (entry instanceof Date || typeof entry !== "object") {
      values.push(entry);
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    for (const nested of Object.values(entry as Record<string, unknown>)) {
      visit(nested);
    }
  };
  visit(value);
  return values;
}

function firstDateInText(value: string): string | null {
  const match = value.match(DATE_PATTERN);
  return match?.[0] ?? null;
}

function extractLabelDateCandidates(params: {
  fieldKey: string;
  labelPatterns: RegExp[];
  lines: TextLine[];
  zoneName: string;
  sourceMethod: string;
  ruleId: string;
  orderStart: number;
}): DeterministicFieldCandidate[] {
  const candidates: DeterministicFieldCandidate[] = [];
  let order = params.orderStart;

  params.lines.forEach((line, index) => {
    if (!params.labelPatterns.some((pattern) => pattern.test(line.text))) return;

    const windowLines = params.lines.slice(index, index + 3);
    for (const candidateLine of windowLines) {
      const rawDate = firstDateInText(candidateLine.text);
      const normalized = normalizeCanonicalDate(rawDate);
      if (!rawDate || !normalized) continue;
      candidates.push(
        buildCandidate({
          fieldKey: params.fieldKey,
          value: rawDate,
          normalizedValue: normalized,
          sourceStage: "RAW_TOKENIZATION",
          sourceMethod: params.sourceMethod,
          evidence: lineEvidence(candidateLine, params.ruleId),
          order: order++,
          scoreBreakdown: {
            labelProximity: 5,
            semanticZone: candidateLine.zoneName === params.zoneName ? 10 : 0,
            validFormat: 3,
            structuredSource: 0,
            conflictingSection: candidateLine.zoneName === params.zoneName ? 0 : -10,
          },
        }),
      );
      break;
    }
  });

  return candidates;
}

function buildCandidate(params: {
  fieldKey: string;
  value: unknown;
  normalizedValue: unknown;
  sourceStage: DeterministicFieldCandidate["sourceStage"];
  sourceMethod: string;
  evidence: CanonicalFieldEvidence;
  order: number;
  scoreBreakdown: Record<string, number>;
  parserRuleId?: string;
  canonicalEligible?: boolean;
  reason?: string;
}): DeterministicFieldCandidate {
  const score = Object.values(params.scoreBreakdown).reduce((sum, value) => sum + value, 0);
  return {
    candidateId: `${params.fieldKey}|${params.sourceMethod}|${params.order}|${String(
      params.normalizedValue,
    )}`,
    fieldKey: params.fieldKey,
    value: normalizeSerializableValue(params.value),
    normalizedValue: normalizeSerializableValue(params.normalizedValue),
    sourceStage: params.sourceStage,
    sourceMethod: params.sourceMethod,
    parserRuleId: params.parserRuleId,
    evidence: params.evidence,
    score,
    scoreBreakdown: params.scoreBreakdown,
    canonicalEligible: params.canonicalEligible ?? true,
    reason: params.reason,
    order: params.order,
  };
}

function scoreForStructuredField(fieldKey: string, evidence: CanonicalFieldEvidence): Record<string, number> {
  const expectedZone = fieldKey.startsWith("consumerInfo.")
    ? "consumer_identity"
    : fieldKey.startsWith("tradelines[")
      ? "tradeline_accounts"
      : fieldKey.startsWith("inquiries[")
        ? "inquiries"
        : fieldKey.startsWith("publicRecords[")
          ? "public_records"
          : fieldKey.startsWith("employmentInfo[")
            ? "employment"
            : fieldKey.startsWith("consumerStatements[")
              ? "consumer_statement"
              : fieldKey.startsWith("paymentHistories[")
                ? "tradeline_accounts"
                : "report_header";

  return {
    labelProximity: evidence.ruleId ? 5 : 0,
    semanticZone: evidence.zoneName === expectedZone ? 10 : 0,
    validFormat: 3,
    structuredSource: 6,
    conflictingSection: evidence.zoneName && evidence.zoneName !== expectedZone ? -10 : 0,
  };
}

function addParseFieldCandidate(params: {
  pools: Map<string, DeterministicFieldCandidate[]>;
  lines: TextLine[];
  fieldKey: string;
  value: unknown;
  sourceMethod: string;
  preferredZone?: string;
  order: number;
}): number {
  const candidateValue = normalizeCanonicalFieldInput(params.fieldKey, params.value);
  const normalizedValue = normalizeCanonicalValue(params.fieldKey, candidateValue);
  if (!hasCanonicalValue(normalizedValue)) return params.order;

  const evidenceLine = findEvidenceLine(params.lines, candidateValue, params.preferredZone, params.fieldKey);
  const evidence = lineEvidence(evidenceLine, "parse-result-field-v1");
  const candidate = buildCandidate({
    fieldKey: params.fieldKey,
    value: candidateValue,
    normalizedValue,
    sourceStage: "STRUCTURED_CANDIDATE_EXTRACTION",
    sourceMethod: params.sourceMethod,
    evidence,
    order: params.order,
    scoreBreakdown: scoreForStructuredField(params.fieldKey, evidence),
  });

  const existing = params.pools.get(params.fieldKey) ?? [];
  existing.push(candidate);
  params.pools.set(params.fieldKey, existing);
  return params.order + 1;
}

function getValueAtPath(root: unknown, path: string): unknown {
  let current = root as any;
  for (const part of path.split(".")) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

const CONSUMER_FIELD_PATHS = [
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
] as const;

const REPORT_FIELD_PATHS = [
  "reportDate",
  "reportNumber",
  "fileNumber",
  "bureauFileId",
  "transUnionCaseId",
  "bureauReferenceId",
  "bureauName",
] as const;

const TRADELINE_FIELD_PATHS = [
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
  "dateVerified",
  "datePaidSettled",
  "balanceMissingFromReport",
] as const;

const CREDIT_SCORE_FIELD_PATHS = [
  "scoreType",
  "scoreValue",
  "scoreDate",
  "scoreRangeMin",
  "scoreRangeMax",
  "scoreFactors",
  "bureauName",
] as const;

const INQUIRY_FIELD_PATHS = [
  "inquiryType",
  "creditorName",
  "inquiryDate",
  "inquiryPurpose",
  "subscriberCode",
  "industryCode",
  "phone",
] as const;

const PUBLIC_RECORD_FIELD_PATHS = [
  "recordType",
  "filingDate",
  "dischargeDate",
  "amount",
  "caseNumber",
  "courtName",
  "status",
  "plaintiff",
  "assetAmount",
  "liabilityAmount",
  "exemptAmount",
  "releaseDate",
  "satisfiedDate",
  "verifiedDate",
  "trustee",
  "attorney",
  "courtLocation",
] as const;

const CONSUMER_STATEMENT_FIELD_PATHS = [
  "statementType",
  "statementText",
  "effectiveDate",
  "expirationDate",
  "addedDate",
] as const;

const EMPLOYMENT_FIELD_PATHS = [
  "employerName",
  "occupation",
  "employmentStatus",
  "salary",
  "salaryFrequency",
  "hireDate",
  "terminationDate",
  "verifiedDate",
  "employerAddress",
  "employerCity",
  "employerProvince",
  "employerPostalCode",
  "employerPhone",
  "isCurrent",
] as const;

const PAYMENT_HISTORY_FIELD_PATHS = [
  "paymentPattern",
  "responsibilityCode",
  "ecoaCode",
  "complianceConditionCode",
  "specialCommentCodes",
  "times30DaysLate",
  "times60DaysLate",
  "times90DaysLate",
  "times120DaysLate",
  "worstDelinquencyCode",
  "worstDelinquencyDate",
  "accountCondition",
  "monthlyPayment",
  "termsFrequency",
  "termsMonths",
  "lastPaymentAmount",
  "lastActivityDate",
  "lastReportedDate",
  "lastPaymentDate",
  "paymentHistorySummary",
  "monthsReviewed",
  "paymentHistoryDetails",
] as const;

const REQUIRED_EVIDENCE_FIELD_PATTERNS = [
  /^reportMetadata\.reportDate$/,
  /^consumerInfo\.(fullName|dateOfBirth|addressLine1|city|province|postalCode)$/,
  /^tradelines\[\d+\]\.(creditorName|accountNumber|accountType|balance|status|dates\.opened|dates\.reported)$/,
  /^inquiries\[\d+\]\.(creditorName|inquiryDate|inquiryType)$/,
  /^publicRecords\[\d+\]\.(recordType|filingDate|status)$/,
  /^paymentHistories\[\d+\]\.(paymentPattern|paymentHistoryDetails)$/,
] as const;

function sourceLinesFor(
  rawSectionText: unknown,
  sectionName: string,
  zoneName: string,
  fallbackLines: TextLine[],
): TextLine[] {
  if (typeof rawSectionText !== "string" || !rawSectionText.trim()) return fallbackLines;
  return buildTextStructure(rawSectionText).lines.map((line) => ({
    ...line,
    sectionName,
    zoneName,
  }));
}

function getReportMetadataValue(
  reportMetadata: ComprehensiveParseResult["reportMetadata"],
  path: string,
): unknown {
  if (path === "bureauReferenceId") {
    return (
      reportMetadata.transUnionCaseId ||
      reportMetadata.bureauFileId ||
      reportMetadata.fileNumber ||
      reportMetadata.reportNumber ||
      null
    );
  }
  return getValueAtPath(reportMetadata, path);
}

function buildCandidatePools(
  parseResult: ComprehensiveParseResult,
  lines: TextLine[],
): Map<string, DeterministicFieldCandidate[]> {
  const pools = new Map<string, DeterministicFieldCandidate[]>();
  let order = 0;

  if (parseResult.sourceBureau?.bureauName) {
    order = addParseFieldCandidate({
      pools,
      lines,
      fieldKey: "sourceBureau.bureauName",
      value: parseResult.sourceBureau.bureauName,
      sourceMethod: "parseResult.sourceBureau.bureauName",
      preferredZone: "report_header",
      order,
    });
  }

  for (const path of REPORT_FIELD_PATHS) {
    order = addParseFieldCandidate({
      pools,
      lines,
      fieldKey: `reportMetadata.${path}`,
      value: getReportMetadataValue(parseResult.reportMetadata, path),
      sourceMethod: `parseResult.reportMetadata.${path}`,
      preferredZone: "report_header",
      order,
    });
  }

  if (parseResult.consumerInfo) {
    for (const path of CONSUMER_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines,
        fieldKey: `consumerInfo.${path}`,
        value: getValueAtPath(parseResult.consumerInfo, path),
        sourceMethod: `parseResult.consumerInfo.${path}`,
        preferredZone: "consumer_identity",
        order,
      });
    }
  }

  for (const rawCandidate of extractLabelDateCandidates({
    fieldKey: "consumerInfo.dateOfBirth",
    labelPatterns: DOB_LABEL_PATTERNS,
    lines,
    zoneName: "consumer_identity",
    sourceMethod: "rawText.labelWindow.dateOfBirth",
    ruleId: "consumer-dob-label-window-v1",
    orderStart: order,
  })) {
    const existing = pools.get(rawCandidate.fieldKey) ?? [];
    existing.push(rawCandidate);
    pools.set(rawCandidate.fieldKey, existing);
    order = rawCandidate.order + 1;
  }

  for (const rawCandidate of extractLabelDateCandidates({
    fieldKey: "reportMetadata.reportDate",
    labelPatterns: REPORT_DATE_LABEL_PATTERNS,
    lines,
    zoneName: "report_header",
    sourceMethod: "rawText.labelWindow.reportDate",
    ruleId: "report-date-label-window-v1",
    orderStart: order,
  })) {
    const existing = pools.get(rawCandidate.fieldKey) ?? [];
    existing.push(rawCandidate);
    pools.set(rawCandidate.fieldKey, existing);
    order = rawCandidate.order + 1;
  }

  parseResult.tradelines.forEach((tradeline, index) => {
    const sourceLines = tradeline.sourceText
      ? buildTextStructure(tradeline.sourceText).lines.map((line) => ({
          ...line,
          sectionName: "tradeline_accounts",
          zoneName: "tradeline_accounts",
        }))
      : lines;

    for (const path of TRADELINE_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `tradelines[${index}].${path}`,
        value: getValueAtPath(tradeline, path),
        sourceMethod: `parseResult.tradelines[${index}].${path}`,
        preferredZone: "tradeline_accounts",
        order,
      });
    }
  });

  parseResult.creditScores.forEach((score, index) => {
    const sourceLines = sourceLinesFor(score.rawSectionText, "credit_score", "report_header", lines);
    for (const path of CREDIT_SCORE_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `creditScores[${index}].${path}`,
        value: getValueAtPath(score, path),
        sourceMethod: `parseResult.creditScores[${index}].${path}`,
        preferredZone: "report_header",
        order,
      });
    }
  });

  parseResult.inquiries.forEach((inquiry, index) => {
    const sourceLines = sourceLinesFor(inquiry.rawSectionText, "inquiries", "inquiries", lines);
    for (const path of INQUIRY_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `inquiries[${index}].${path}`,
        value: getValueAtPath(inquiry, path),
        sourceMethod: `parseResult.inquiries[${index}].${path}`,
        preferredZone: "inquiries",
        order,
      });
    }
  });

  parseResult.publicRecords.forEach((record, index) => {
    const sourceLines = sourceLinesFor(record.rawSectionText, "public_records", "public_records", lines);
    for (const path of PUBLIC_RECORD_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `publicRecords[${index}].${path}`,
        value: getValueAtPath(record, path),
        sourceMethod: `parseResult.publicRecords[${index}].${path}`,
        preferredZone: "public_records",
        order,
      });
    }
  });

  parseResult.consumerStatements.forEach((statement, index) => {
    const sourceLines = sourceLinesFor(statement.rawSectionText, "consumer_statement", "consumer_statement", lines);
    for (const path of CONSUMER_STATEMENT_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `consumerStatements[${index}].${path}`,
        value: getValueAtPath(statement, path),
        sourceMethod: `parseResult.consumerStatements[${index}].${path}`,
        preferredZone: "consumer_statement",
        order,
      });
    }
  });

  parseResult.employmentInfo.forEach((employment, index) => {
    const sourceLines = sourceLinesFor(employment.rawSectionText, "employment", "employment", lines);
    for (const path of EMPLOYMENT_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `employmentInfo[${index}].${path}`,
        value: getValueAtPath(employment, path),
        sourceMethod: `parseResult.employmentInfo[${index}].${path}`,
        preferredZone: "employment",
        order,
      });
    }
  });

  parseResult.paymentHistories.forEach((paymentHistory, index) => {
    const sourceLines = sourceLinesFor(paymentHistory.rawSectionText, "tradeline_accounts", "tradeline_accounts", lines);
    for (const path of PAYMENT_HISTORY_FIELD_PATHS) {
      order = addParseFieldCandidate({
        pools,
        lines: sourceLines,
        fieldKey: `paymentHistories[${index}].${path}`,
        value: getValueAtPath(paymentHistory, path),
        sourceMethod: `parseResult.paymentHistories[${index}].${path}`,
        preferredZone: "tradeline_accounts",
        order,
      });
    }
  });

  return pools;
}

function compareCandidates(a: DeterministicFieldCandidate, b: DeterministicFieldCandidate): number {
  if (a.canonicalEligible !== b.canonicalEligible) return a.canonicalEligible ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  const source = a.sourceMethod.localeCompare(b.sourceMethod);
  if (source !== 0) return source;
  const normalized = String(a.normalizedValue).localeCompare(String(b.normalizedValue));
  if (normalized !== 0) return normalized;
  return a.order - b.order;
}

function finalizeCandidates(candidates: DeterministicFieldCandidate[]): DeterministicFieldCandidate[] {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = stableCanonicalJson(candidate.normalizedValue);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return candidates.map((candidate) => {
    const repeatedConsistency = (counts.get(stableCanonicalJson(candidate.normalizedValue)) ?? 0) > 1 ? 8 : 0;
    const scoreBreakdown = {
      ...candidate.scoreBreakdown,
      repeatedConsistency,
    };
    return {
      ...candidate,
      scoreBreakdown,
      score: Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0),
    };
  });
}

export function selectDeterministicCandidate(
  candidates: DeterministicFieldCandidate[],
): DeterministicFieldCandidate | null {
  const eligible = finalizeCandidates(candidates).filter((candidate) => candidate.canonicalEligible);
  if (eligible.length === 0) return null;
  return [...eligible].sort(compareCandidates)[0];
}

function buildAlternative(
  candidate: DeterministicFieldCandidate,
  selected: DeterministicFieldCandidate,
): CanonicalFieldAlternative {
  const scoreReason =
    candidate.score === selected.score
      ? "Not selected by deterministic tie-break ordering."
      : `Not selected because deterministic score ${candidate.score} was lower than selected score ${selected.score}.`;

  return {
    value: candidate.value,
    normalizedValue: candidate.normalizedValue,
    reasonNotSelected: candidate.canonicalEligible
      ? scoreReason
      : candidate.reason ?? "Candidate is diagnostic-only and cannot become canonical.",
    evidence: attachEvidenceId(candidate.fieldKey, candidate.evidence),
  };
}

function attachEvidenceId(
  fieldKey: string,
  evidence: CanonicalFieldEvidence,
): CanonicalFieldEvidence {
  const seed = {
    fieldKey,
    pageNumber: evidence.pageNumber ?? null,
    tokenIndexes: evidence.tokenIndexes ?? [],
    textSnippet: evidence.textSnippet ?? null,
    sectionName: evidence.sectionName ?? null,
    zoneName: evidence.zoneName ?? null,
    ruleId: evidence.ruleId ?? null,
  };

  return {
    ...evidence,
    evidenceId: evidence.evidenceId ?? `evidence-${sha256Hex(stableCanonicalJson(seed)).slice(0, 16)}`,
  };
}

function buildFieldFromPool(
  fieldKey: string,
  rawCandidates: DeterministicFieldCandidate[],
): { field: CanonicalFieldObject | null; pool: CandidatePool } {
  const candidates = finalizeCandidates(rawCandidates).sort(compareCandidates);
  const selected = candidates.find((candidate) => candidate.canonicalEligible) ?? null;
  const alternatives = selected
    ? candidates
        .filter((candidate) => candidate.candidateId !== selected.candidateId)
        .map((candidate) => buildAlternative(candidate, selected))
    : candidates.map((candidate) => ({
        value: candidate.value,
        normalizedValue: candidate.normalizedValue,
        reasonNotSelected: candidate.reason ?? "No canonical-eligible deterministic candidate was available.",
        evidence: candidate.evidence,
      }));

  const pool: CandidatePool = {
    fieldKey,
    selectionRuleId: "deterministic-score-v1",
    candidates,
    selectedCandidateId: selected?.candidateId ?? null,
    alternatives,
  };

  if (!selected) return { field: null, pool };

  const field: CanonicalFieldObject = {
    fieldKey,
    value: selected.value,
    normalizedValue: selected.normalizedValue,
    confidence: 1.0,
    deterministic: true,
    sourceStage: "DETERMINISTIC_CANONICAL_SELECTION",
    sourceMethod: selected.sourceMethod,
    ...(selected.parserRuleId ? { parserRuleId: selected.parserRuleId } : {}),
    evidence: attachEvidenceId(fieldKey, selected.evidence),
    alternatives,
    history: [
      {
        stage: selected.sourceStage,
        previousValue: null,
        nextValue: selected.value,
        reason: "Candidate entered the deterministic candidate pool.",
      },
      {
        stage: "DETERMINISTIC_CANONICAL_SELECTION",
        previousValue: null,
        nextValue: selected.value,
        reason: `Selected by deterministic-score-v1 with score ${selected.score}.`,
      },
    ],
  };

  return { field, pool };
}

export function applyCanonicalFieldUpdate(
  existing: CanonicalFieldObject | null,
  next: CanonicalFieldObject | null,
  reason: string,
): CanonicalFieldObject | null {
  if (!existing) return next;
  if (!next) {
    return {
      ...existing,
      history: [
        ...existing.history,
        {
          stage: "FIELD_RECONCILIATION",
          previousValue: existing.value,
          nextValue: existing.value,
          reason: `${reason} Null update rejected because an existing canonical value is present.`,
        },
      ],
    };
  }

  const nextHasValue = hasCanonicalValue(next.value);
  const existingHasValue = hasCanonicalValue(existing.value);
  if (existingHasValue && !nextHasValue) {
    return {
      ...existing,
      alternatives: [
        ...existing.alternatives,
        {
          value: next.value,
          normalizedValue: next.normalizedValue,
          reasonNotSelected:
            "Rejected because null or missing values cannot overwrite valid canonical data.",
          evidence: next.evidence,
        },
      ],
      history: [
        ...existing.history,
        {
          stage: "FIELD_RECONCILIATION",
          previousValue: existing.value,
          nextValue: existing.value,
          reason,
        },
      ],
    };
  }

  return {
    ...next,
    history: [
      ...existing.history,
      {
        stage: "FIELD_RECONCILIATION",
        previousValue: existing.value,
        nextValue: next.value,
        reason,
      },
      ...next.history,
    ],
  };
}

export function markDiagnosticCandidateNonCanonical(
  candidate: DeterministicFieldCandidate,
  reason = "LLM or DocStrange candidates are diagnostic-only until deterministic validation creates an explicit rule.",
): DeterministicFieldCandidate {
  return {
    ...candidate,
    sourceStage: "LLM_DIAGNOSTIC",
    canonicalEligible: false,
    reason,
    score: Number.NEGATIVE_INFINITY,
  };
}

function tradelineToSerializable(tradeline: ParsedTradeline): Record<string, unknown> {
  return normalizeSerializableValue({
    ...tradeline,
    creditorName: sanitizeCreditorName(tradeline.creditorName) ?? tradeline.creditorName,
    originalCreditorName: sanitizeCreditorName(tradeline.originalCreditorName) ?? tradeline.originalCreditorName,
    collectionAgencyName: sanitizeCreditorName(tradeline.collectionAgencyName) ?? tradeline.collectionAgencyName,
  }) as Record<string, unknown>;
}

function hasSourceEvidence(evidence: CanonicalFieldEvidence | null | undefined): boolean {
  if (!evidence) return false;
  return Boolean(
    evidence.textSnippet?.trim() &&
      evidence.pageNumber != null &&
      Array.isArray(evidence.tokenIndexes) &&
      evidence.tokenIndexes.length > 0,
  );
}

function requiresEvidence(fieldKey: string): boolean {
  return REQUIRED_EVIDENCE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldKey));
}

function buildEvidenceModel(fields: Record<string, CanonicalFieldObject>): CanonicalEvidenceModel {
  const fieldIndex: Record<string, CanonicalFieldEvidence> = {};
  const fieldsMissingEvidence: string[] = [];
  const requiredFieldKeys: string[] = [];
  const requiredFieldsMissingEvidence: string[] = [];

  for (const fieldKey of Object.keys(fields).sort()) {
    const evidence = fields[fieldKey].evidence;
    fieldIndex[fieldKey] = evidence;

    const hasEvidence = hasSourceEvidence(evidence);
    if (!hasEvidence) fieldsMissingEvidence.push(fieldKey);

    if (requiresEvidence(fieldKey)) {
      requiredFieldKeys.push(fieldKey);
      if (!hasEvidence) requiredFieldsMissingEvidence.push(fieldKey);
    }
  }

  const totalCanonicalFields = Object.keys(fields).length;
  const fieldsWithEvidence = totalCanonicalFields - fieldsMissingEvidence.length;
  const requiredFieldsWithEvidence = requiredFieldKeys.length - requiredFieldsMissingEvidence.length;

  return {
    fieldIndex,
    coverage: {
      totalCanonicalFields,
      fieldsWithEvidence,
      fieldsMissingEvidence,
      requiredFieldKeys,
      requiredFieldsWithEvidence,
      requiredFieldsMissingEvidence,
      coveragePercent:
        totalCanonicalFields === 0
          ? 100
          : Math.round((fieldsWithEvidence / totalCanonicalFields) * 100),
      requiredCoveragePercent:
        requiredFieldKeys.length === 0
          ? 100
          : Math.round((requiredFieldsWithEvidence / requiredFieldKeys.length) * 100),
    },
  };
}

function buildFinalOutput(
  parseResult: ComprehensiveParseResult,
  fields: Record<string, CanonicalFieldObject>,
): DeterministicNormalizedReport {
  const reportMetadata = normalizeSerializableValue(parseResult.reportMetadata) as Record<string, unknown>;
  if (!reportMetadata.bureauReferenceId) {
    reportMetadata.bureauReferenceId =
      reportMetadata.transUnionCaseId ||
      reportMetadata.bureauFileId ||
      reportMetadata.fileNumber ||
      reportMetadata.reportNumber ||
      null;
  }

  return {
    version: DETERMINISTIC_CREDIT_REPORT_PIPELINE_VERSION,
    fields,
    evidence: buildEvidenceModel(fields),
    reportMetadata,
    consumerInfo: parseResult.consumerInfo
      ? (normalizeSerializableValue(parseResult.consumerInfo) as Record<string, unknown>)
      : null,
    tradelines: parseResult.tradelines.map(tradelineToSerializable),
    creditScores: parseResult.creditScores.map((entry) => normalizeSerializableValue(entry) as Record<string, unknown>),
    inquiries: parseResult.inquiries.map((entry) => normalizeSerializableValue(entry) as Record<string, unknown>),
    publicRecords: parseResult.publicRecords.map((entry) => normalizeSerializableValue(entry) as Record<string, unknown>),
    consumerStatements: parseResult.consumerStatements.map((entry) => normalizeSerializableValue(entry) as Record<string, unknown>),
    employmentInfo: parseResult.employmentInfo.map((entry) => normalizeSerializableValue(entry) as Record<string, unknown>),
    paymentHistories: parseResult.paymentHistories.map((entry) => normalizeSerializableValue(entry) as Record<string, unknown>),
  };
}

export function buildDeterministicCreditReportPipelinePackage(
  input: BuildDeterministicPipelineInput,
): DeterministicPipelinePackage {
  const structure = buildTextStructure(input.rawText);
  const pools = buildCandidatePools(input.parseResult, structure.lines);
  const fields: Record<string, CanonicalFieldObject> = {};
  const candidatePools: CandidatePool[] = [];

  for (const fieldKey of [...pools.keys()].sort()) {
    const { field, pool } = buildFieldFromPool(fieldKey, pools.get(fieldKey) ?? []);
    candidatePools.push(pool);
    if (field) fields[fieldKey] = field;
  }

  const finalOutput = buildFinalOutput(input.parseResult, fields);
  const canonicalResultSha256 = sha256Hex(stableCanonicalJson(finalOutput));
  const replayBase = {
    version: DETERMINISTIC_CREDIT_REPORT_PIPELINE_VERSION,
    documentBinarySha256: input.documentBinarySha256,
    rawTextSha256: sha256Hex(input.rawText),
    finalOutput,
    candidatePools,
  };
  const replayHash = sha256Hex(stableCanonicalJson(replayBase));

  return {
    version: DETERMINISTIC_CREDIT_REPORT_PIPELINE_VERSION,
    stages: DETERMINISTIC_PIPELINE_STAGES,
    sourceMethod: "pdf_text",
    documentBinarySha256: input.documentBinarySha256,
    rawTextSha256: sha256Hex(input.rawText),
    canonicalResultSha256,
    replayHash,
    structuralSegmentation: {
      segments: structure.segments,
    },
    semanticZoneDetection: {
      zones: structure.zones,
    },
    rawTokenization: {
      tokenCount: structure.tokens.length,
      tokens: structure.tokens,
    },
    candidatePools,
    finalOutput,
    nonCanonicalDiagnostics:
      input.nonCanonicalDiagnostics?.map((candidate) => markDiagnosticCandidateNonCanonical(candidate)) ?? [],
    rules: {
      scoringRuleId: "deterministic-score-v1",
      orderingRule:
        "Sort by canonical eligibility, score desc, source method asc, normalized value asc, original candidate order asc.",
      nullOverwritePolicy: "reject_null_over_valid_value",
      aiCanonicalPolicy: "llm_candidates_are_diagnostic_only",
      appliedParserRuleIds: [...(input.appliedParserRuleIds ?? [])].sort((a, b) => a - b),
    },
  };
}
