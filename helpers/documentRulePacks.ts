import { normalizeCanonicalAmount, normalizeCanonicalDate } from "./deterministicCreditReportPipeline";
import { sha256Hex } from "./reportBinaryUtils";

export const DOCUMENT_RULE_PACK_VERSION = "document-rule-packs-v1";

export type DocumentRulePackType = "creditor_statement" | "collection_letter";

export interface DocumentRulePackEvidence {
  sourceMethod: "deterministic_document_rule_pack";
  rulePackId: string;
  ruleId: string;
  pageNumber: number;
  lineNumber: number;
  textSnippet: string;
}

export interface DocumentRulePackFact {
  factId: string;
  documentType: DocumentRulePackType;
  fieldKey: string;
  value: string | number;
  normalizedValue: string | number;
  deterministic: true;
  canonicalEligible: false;
  reason: string;
  evidence: DocumentRulePackEvidence;
}

export interface DocumentRulePackResult {
  version: typeof DOCUMENT_RULE_PACK_VERSION;
  documentType: DocumentRulePackType;
  rulePackId: string;
  matched: boolean;
  matchedIndicators: string[];
  facts: DocumentRulePackFact[];
  diagnostics: string[];
}

interface TextLine {
  pageNumber: number;
  lineNumber: number;
  text: string;
}

interface IndicatorRule {
  id: string;
  pattern: RegExp;
}

interface ExtractedValue {
  value: string | number;
  normalizedValue: string | number;
}

interface FieldRule {
  fieldKey: string;
  ruleId: string;
  extract(line: string): ExtractedValue | null;
}

interface DocumentRulePackDefinition {
  documentType: DocumentRulePackType;
  rulePackId: string;
  minimumIndicatorMatches: number;
  indicators: IndicatorRule[];
  fieldRules: FieldRule[];
}

const DATE_PATTERN_SOURCE =
  String.raw`(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{2,4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+\d{2,4})`;
const AMOUNT_PATTERN_SOURCE = String.raw`(?:CA\$|\$)?\s*-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?`;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedDocumentText(lines: TextLine[]): string {
  return lines.map((line) => line.text).join("\n").toLowerCase();
}

function splitTextLines(rawText: string): TextLine[] {
  const lines: TextLine[] = [];
  let lineNumber = 0;

  rawText.split("\f").forEach((pageText, pageIndex) => {
    for (const rawLine of pageText.split(/\r?\n/)) {
      lineNumber += 1;
      const text = compactWhitespace(rawLine);
      if (!text) continue;
      lines.push({
        pageNumber: pageIndex + 1,
        lineNumber,
        text,
      });
    }
  });

  return lines;
}

function isBureauCreditReportLike(lines: TextLine[]): boolean {
  const text = normalizedDocumentText(lines);
  const hasBureauReportSignal =
    /\b(?:transunion|equifax)\s+canada\b/.test(text) ||
    /\bconsumer\s+disclosure\b/.test(text) ||
    /\bcredit\s+report\b/.test(text);
  const hasCreditReportStructure =
    /\b(?:personal|consumer)\s+information\b/.test(text) &&
    /\b(?:account\s+information|tradelines?|credit\s+account)\b/.test(text);
  return hasBureauReportSignal && hasCreditReportStructure;
}

function lineLabelPattern(labels: string[], valuePattern: string): RegExp {
  return new RegExp(String.raw`^\s*(?:${labels.join("|")})\s*(?::|-)?\s*(${valuePattern})\b`, "i");
}

function textLabelPattern(labels: string[]): RegExp {
  return new RegExp(String.raw`^\s*(?:${labels.join("|")})\s*(?::|-)?\s*(.+)$`, "i");
}

function extractDate(line: string, labels: string[]): ExtractedValue | null {
  const match = line.match(lineLabelPattern(labels, DATE_PATTERN_SOURCE));
  if (!match) return null;
  const value = compactWhitespace(match[1]);
  const normalizedValue = normalizeCanonicalDate(value);
  return normalizedValue ? { value, normalizedValue } : null;
}

function extractAmount(line: string, labels: string[]): ExtractedValue | null {
  const match = line.match(lineLabelPattern(labels, AMOUNT_PATTERN_SOURCE));
  if (!match) return null;
  const value = compactWhitespace(match[1]);
  const normalizedValue = normalizeCanonicalAmount(value);
  return normalizedValue === null ? null : { value: normalizedValue, normalizedValue };
}

function cleanLabelValue(value: string): string | null {
  const cleaned = compactWhitespace(value)
    .replace(/[.;,]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned;
}

function extractText(line: string, labels: string[]): ExtractedValue | null {
  const match = line.match(textLabelPattern(labels));
  if (!match) return null;
  const cleaned = cleanLabelValue(match[1]);
  return cleaned ? { value: cleaned, normalizedValue: cleaned } : null;
}

function normalizeAccountReference(value: string): string | null {
  const normalized = compactWhitespace(value);
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 2) return `ending in ${digits.slice(-4)}`;
  const masked = normalized.match(/(?:[*xX-]+\s*)+\d{2,4}/);
  if (masked) return compactWhitespace(masked[0]);
  return null;
}

function extractAccountReference(line: string): ExtractedValue | null {
  const match = line.match(
    /^\s*(?:account(?:\s+number)?|account\s+reference|reference)\s*(?::|#|-)?\s*(.+)$/i,
  );
  if (!match) return null;
  const normalizedValue = normalizeAccountReference(match[1]);
  return normalizedValue ? { value: normalizedValue, normalizedValue } : null;
}

function maskSensitiveNumbers(value: string): string {
  return value.replace(/\d[\d\s-]{7,}\d/g, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 9 ? `********${digits.slice(-4)}` : match;
  });
}

function factIdFor(params: {
  documentType: DocumentRulePackType;
  rulePackId: string;
  fieldKey: string;
  normalizedValue: string | number;
  pageNumber: number;
  lineNumber: number;
}): string {
  const hash = sha256Hex(
    [
      DOCUMENT_RULE_PACK_VERSION,
      params.documentType,
      params.rulePackId,
      params.fieldKey,
      String(params.normalizedValue),
      String(params.pageNumber),
      String(params.lineNumber),
    ].join("|"),
  );
  return `docfact-${hash.slice(0, 16)}`;
}

function buildFact(params: {
  documentType: DocumentRulePackType;
  rulePackId: string;
  fieldRule: FieldRule;
  extracted: ExtractedValue;
  line: TextLine;
}): DocumentRulePackFact {
  return {
    factId: factIdFor({
      documentType: params.documentType,
      rulePackId: params.rulePackId,
      fieldKey: params.fieldRule.fieldKey,
      normalizedValue: params.extracted.normalizedValue,
      pageNumber: params.line.pageNumber,
      lineNumber: params.line.lineNumber,
    }),
    documentType: params.documentType,
    fieldKey: params.fieldRule.fieldKey,
    value: params.extracted.value,
    normalizedValue: params.extracted.normalizedValue,
    deterministic: true,
    canonicalEligible: false,
    reason:
      "Document-type rule-pack facts are isolated from credit-report canonical truth until an explicit reviewed comparison path consumes them.",
    evidence: {
      sourceMethod: "deterministic_document_rule_pack",
      rulePackId: params.rulePackId,
      ruleId: params.fieldRule.ruleId,
      pageNumber: params.line.pageNumber,
      lineNumber: params.line.lineNumber,
      textSnippet: maskSensitiveNumbers(params.line.text),
    },
  };
}

export const DOCUMENT_RULE_PACKS: readonly DocumentRulePackDefinition[] = [
  {
    documentType: "creditor_statement",
    rulePackId: "creditor-statement-v1",
    minimumIndicatorMatches: 2,
    indicators: [
      { id: "account_statement", pattern: /\baccount\s+statement\b/i },
      { id: "statement_date", pattern: /\bstatement\s+date\b/i },
      { id: "minimum_payment", pattern: /\bminimum\s+payment\b/i },
      { id: "payment_due_date", pattern: /\bpayment\s+due\s+date\b/i },
      { id: "amount_due", pattern: /\bamount\s+due\b/i },
    ],
    fieldRules: [
      {
        fieldKey: "creditorStatements[0].creditorName",
        ruleId: "creditor-statement-creditor-name-v1",
        extract: (line) => extractText(line, ["creditor(?:\\s+name)?", "issuer", "statement\\s+from"]),
      },
      {
        fieldKey: "creditorStatements[0].statementDate",
        ruleId: "creditor-statement-statement-date-v1",
        extract: (line) => extractDate(line, ["statement\\s+date"]),
      },
      {
        fieldKey: "creditorStatements[0].paymentDueDate",
        ruleId: "creditor-statement-payment-due-date-v1",
        extract: (line) => extractDate(line, ["payment\\s+due\\s+date", "due\\s+date"]),
      },
      {
        fieldKey: "creditorStatements[0].amountDue",
        ruleId: "creditor-statement-amount-due-v1",
        extract: (line) => extractAmount(line, ["amount\\s+due", "total\\s+amount\\s+due", "new\\s+balance"]),
      },
      {
        fieldKey: "creditorStatements[0].minimumPaymentDue",
        ruleId: "creditor-statement-minimum-payment-due-v1",
        extract: (line) => extractAmount(line, ["minimum\\s+payment(?:\\s+due)?"]),
      },
      {
        fieldKey: "creditorStatements[0].accountReferenceMasked",
        ruleId: "creditor-statement-account-reference-v1",
        extract: extractAccountReference,
      },
    ],
  },
  {
    documentType: "collection_letter",
    rulePackId: "collection-letter-v1",
    minimumIndicatorMatches: 2,
    indicators: [
      { id: "collection_notice", pattern: /\bcollection\s+notice\b/i },
      { id: "debt_collector", pattern: /\bdebt\s+collector\b/i },
      { id: "collection_agency", pattern: /\bcollection\s+agency\b/i },
      { id: "amount_owing", pattern: /\bamount\s+owing\b/i },
      { id: "original_creditor", pattern: /\boriginal\s+creditor\b/i },
    ],
    fieldRules: [
      {
        fieldKey: "collectionLetters[0].collectionAgencyName",
        ruleId: "collection-letter-agency-name-v1",
        extract: (line) => extractText(line, ["debt\\s+collector", "collection\\s+agency"]),
      },
      {
        fieldKey: "collectionLetters[0].originalCreditorName",
        ruleId: "collection-letter-original-creditor-v1",
        extract: (line) => extractText(line, ["original\\s+creditor"]),
      },
      {
        fieldKey: "collectionLetters[0].noticeDate",
        ruleId: "collection-letter-notice-date-v1",
        extract: (line) => extractDate(line, ["notice\\s+date", "letter\\s+date"]),
      },
      {
        fieldKey: "collectionLetters[0].amountOwing",
        ruleId: "collection-letter-amount-owing-v1",
        extract: (line) =>
          extractAmount(line, ["amount\\s+owing", "amount\\s+now\\s+due", "amount\\s+due", "balance\\s+due", "you\\s+owe"]),
      },
      {
        fieldKey: "collectionLetters[0].accountReferenceMasked",
        ruleId: "collection-letter-account-reference-v1",
        extract: extractAccountReference,
      },
    ],
  },
];

function evaluateDefinition(
  definition: DocumentRulePackDefinition,
  lines: TextLine[],
): DocumentRulePackResult {
  const text = normalizedDocumentText(lines);
  const matchedIndicators = definition.indicators
    .filter((indicator) => indicator.pattern.test(text))
    .map((indicator) => indicator.id)
    .sort();
  const matched = matchedIndicators.length >= definition.minimumIndicatorMatches;
  const factsByField = new Map<string, DocumentRulePackFact>();

  if (matched) {
    for (const line of lines) {
      for (const fieldRule of definition.fieldRules) {
        if (factsByField.has(fieldRule.fieldKey)) continue;
        const extracted = fieldRule.extract(line.text);
        if (!extracted) continue;
        factsByField.set(
          fieldRule.fieldKey,
          buildFact({
            documentType: definition.documentType,
            rulePackId: definition.rulePackId,
            fieldRule,
            extracted,
            line,
          }),
        );
      }
    }
  }

  return {
    version: DOCUMENT_RULE_PACK_VERSION,
    documentType: definition.documentType,
    rulePackId: definition.rulePackId,
    matched,
    matchedIndicators,
    facts: [...factsByField.values()].sort((left, right) => left.fieldKey.localeCompare(right.fieldKey)),
    diagnostics: matched
      ? []
      : [`Requires at least ${definition.minimumIndicatorMatches} deterministic document-type indicators.`],
  };
}

export function evaluateDocumentRulePack(
  rawText: string,
  documentType: DocumentRulePackType,
): DocumentRulePackResult {
  const lines = splitTextLines(rawText);
  const definition = DOCUMENT_RULE_PACKS.find((candidate) => candidate.documentType === documentType);
  if (!definition) {
    throw new Error(`Unsupported document rule pack: ${documentType}`);
  }
  if (lines.length === 0 || isBureauCreditReportLike(lines)) {
    return {
      version: DOCUMENT_RULE_PACK_VERSION,
      documentType: definition.documentType,
      rulePackId: definition.rulePackId,
      matched: false,
      matchedIndicators: [],
      facts: [],
      diagnostics: ["Document rule packs are isolated from bureau credit-report parser inputs."],
    };
  }
  return evaluateDefinition(definition, lines);
}

export function extractDocumentRulePackFacts(rawText: string): DocumentRulePackResult[] {
  const lines = splitTextLines(rawText);
  if (lines.length === 0 || isBureauCreditReportLike(lines)) return [];
  return DOCUMENT_RULE_PACKS.map((definition) => evaluateDefinition(definition, lines)).filter(
    (result) => result.matched,
  );
}
