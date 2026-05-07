import { ParsedTradeline } from "./reportParser";
import { ExtractedConsumerInfo } from "./consumerInfoExtractorTypes";
import { FieldExpectation, ValidationMode, validateFieldValue } from "./parserValidationModes";

export interface FieldComparisonResult {
  fieldName: string;
  expected: any;
  actual: any;
  passed: boolean;
  mode: ValidationMode;
  expectation?: FieldExpectation;
  suggestion?: string;
}

export interface TradelineComparisonResult {
  accountNumber: string;
  creditorName?: string;
  actualIndex?: number;
  passed: boolean;
  fieldResults: FieldComparisonResult[];
}

export interface ComparisonSummary {
  passed: boolean;
  hasExpectations: boolean;
  needsReview: boolean;
  consumerInfoResults: FieldComparisonResult[];
  tradelineResults: TradelineComparisonResult[];
  patternSuggestions: Record<string, string[]>;
  actualConsumerInfo?: any;
  actualTradelines?: any[];
  pipelineAudit?: unknown;
}

/**
 * Checks if a value is a FieldExpectation object or a legacy plain value.
 */
function isFieldExpectation(value: any): value is FieldExpectation {
  return value !== null && typeof value === 'object' && 'mode' in value;
}

function unwrapExpectedValue(value: any): any {
  return isFieldExpectation(value) ? value.value : value;
}

function normalizeAccountNumber(value: string | null | undefined): string | null {
  const normalized = (value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (
    !normalized ||
    normalized === "UNKNOWN" ||
    normalized === "NA" ||
    normalized === "NOTREPORTED" ||
    normalized === "NOTPROVIDED" ||
    normalized === "NOTPROVIDEDBYBUREAU" ||
    normalized === "NOTAVAILABLE"
  ) return null;
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
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function amountsClose(a: unknown, b: unknown, tolerance = 0.1): boolean {
  const left = Number(String(a ?? "").replace(/[^0-9.-]/g, ""));
  const right = Number(String(b ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const max = Math.max(Math.abs(left), Math.abs(right));
  if (max === 0) return true;
  return Math.abs(left - right) / max <= tolerance;
}

function daysApart(a: unknown, b: unknown): number | null {
  if (!a || !b) return null;
  const left = new Date(a as any).getTime();
  const right = new Date(b as any).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(left - right) / (1000 * 60 * 60 * 24);
}

function scoreTradelineIdentity(expected: ParsedTradeline, actual: ParsedTradeline): number {
  let score = 0;

  if (accountNumbersMatch(expected.accountNumber, actual.accountNumber)) score += 40;
  if (textLooksSimilar(unwrapExpectedValue(expected.creditorName), actual.creditorName)) score += 25;
  if (textLooksSimilar(unwrapExpectedValue(expected.accountType), actual.accountType)) score += 10;
  if (textLooksSimilar(unwrapExpectedValue(expected.status), actual.status)) score += 5;
  if (amountsClose(unwrapExpectedValue(expected.balance), actual.balance, 0.1)) score += 8;
  if (amountsClose(unwrapExpectedValue(expected.amounts?.high), actual.amounts?.high, 0.05)) score += 8;
  if (amountsClose(unwrapExpectedValue(expected.amounts?.pastDue), actual.amounts?.pastDue, 0.05)) score += 5;

  const openedDiff = daysApart(unwrapExpectedValue(expected.dates?.opened), actual.dates?.opened);
  if (openedDiff !== null) {
    if (openedDiff <= 31) score += 15;
    else if (openedDiff <= 90) score += 7;
  }

  return score;
}

function findBestTradelineMatch(
  expected: ParsedTradeline,
  actual: ParsedTradeline[],
  usedIndexes: Set<number>
): { tradeline: ParsedTradeline; index: number } | null {
  let best: { tradeline: ParsedTradeline; index: number; score: number } | null = null;

  actual.forEach((candidate, index) => {
    if (usedIndexes.has(index)) return;
    const score = scoreTradelineIdentity(expected, candidate);
    if (!best || score > best.score) {
      best = { tradeline: candidate, index, score };
    }
  });

  if (!best || best.score < 25) {
    return null;
  }

  usedIndexes.add(best.index);
  return { tradeline: best.tradeline, index: best.index };
}

/**
 * Checks if there is extracted data that doesn't have corresponding expected values.
 * Returns true when:
 * 1. Consumer info fields are extracted but not set in expectedConsumerInfo
 * 2. More tradelines are extracted than expected (or no expected tradelines but actual ones exist)
 */
export function hasUnapprovedData(
  expectedConsumerInfo: Partial<ExtractedConsumerInfo> | null,
  actualConsumerInfo: ExtractedConsumerInfo | null,
  expectedTradelines: ParsedTradeline[] | null,
  actualTradelines: ParsedTradeline[]
): boolean {
  // Check consumer info fields
  if (actualConsumerInfo) {
    const fields: (keyof ExtractedConsumerInfo)[] = [
      "fullName",
      "addressLine1",
      "addressLine2",
      "city",
      "province",
      "postalCode",
      "dateOfBirth",
    ];
    
    for (const field of fields) {
      const actualValue = actualConsumerInfo[field];
      const expectedValue = expectedConsumerInfo?.[field];
      
      // If actual value exists but expected is not set (undefined or null), needs review
      if (actualValue !== null && actualValue !== undefined && 
          (expectedValue === undefined || expectedValue === null)) {
        return true;
      }
    }
  }
  
  // Check tradelines - if we have actual tradelines but no expectations or fewer expected than actual
  const actualCount = actualTradelines.length;
  const expectedCount = expectedTradelines?.length ?? 0;
  
  if (actualCount > expectedCount) {
    return true;
  }
  
  return false;
}

/**
 * Checks if any expectations are defined for the test case.
 * Returns true if at least one expected value is set in either consumer info or tradelines.
 */
export function hasAnyExpectations(
  expectedConsumerInfo: Partial<ExtractedConsumerInfo> | null,
  expectedTradelines: ParsedTradeline[] | null
): boolean {
  // Check if consumer info has any defined fields (not null/undefined)
  if (expectedConsumerInfo) {
    const fields: (keyof ExtractedConsumerInfo)[] = [
      "fullName",
      "addressLine1",
      "addressLine2",
      "city",
      "province",
      "postalCode",
      "dateOfBirth",
    ];
    
    for (const field of fields) {
      const value = expectedConsumerInfo[field];
      if (value !== undefined && value !== null) {
        return true;
      }
    }
  }
  
  // Check if tradelines array has any elements
  if (expectedTradelines && expectedTradelines.length > 0) {
    return true;
  }
  
  return false;
}

/**
 * Analyzes a specific field failure and suggests a regex pattern.
 */
export function analyzeFieldFailure(
  fieldName: string,
  rawText: string,
  expected: string,
  actual: string | null
): string | null {
  if (!expected) return null;

  // Simple heuristic: if expected value exists in raw text but wasn't captured
  if (rawText.includes(expected)) {
    return generatePatternSuggestion(fieldName, rawText, expected);
  }

  return null;
}

/**
 * Generates a regex pattern suggestion based on the context of the expected value in the raw text.
 */
export function generatePatternSuggestion(
  fieldName: string,
  rawText: string,
  expectedValue: string
): string | null {
  // Find the expected value in the text
  const index = rawText.indexOf(expectedValue);
  if (index === -1) return null;

  // Get context (some chars before)
  const contextStart = Math.max(0, index - 20);
  const prefix = rawText.substring(contextStart, index);

  // Look for potential labels in the prefix
  // e.g. "Balance: " -> /Balance:\s*([$0-9.,]+)/
  const labelMatch = prefix.match(/([A-Za-z\s]+)[:\s]+$/);
  
  if (labelMatch) {
    const label = labelMatch[1].trim();
    // Escape special regex chars in label
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Construct a suggestion based on value type
    if (/^\d+$/.test(expectedValue)) {
      return `/${escapedLabel}[\\s:]+(\\d+)/i`;
    } else if (/^[\d.,]+$/.test(expectedValue)) {
      return `/${escapedLabel}[\\s:]+([\\d.,]+)/i`;
    } else if (/^\$\d+/.test(expectedValue)) {
      return `/${escapedLabel}[\\s:]+(\\$[\\d.,]+)/i`;
    } else {
      return `/${escapedLabel}[\\s:]+(.+?)(?:\\n|$)/i`;
    }
  }

  return null;
}

/**
 * Compares expected vs actual consumer info.
 * Supports both legacy plain values and new FieldExpectation format.
 */
export function compareConsumerInfo(
  expected: Partial<ExtractedConsumerInfo> | null,
  actual: ExtractedConsumerInfo | null,
  rawText: string
): FieldComparisonResult[] {
  const results: FieldComparisonResult[] = [];
  if (!expected) return results;

  const fields: (keyof ExtractedConsumerInfo)[] = [
    "fullName",
    "addressLine1",
    "city",
    "province",
    "postalCode",
    "dateOfBirth",
  ];

  for (const field of fields) {
    const expVal = expected[field];
    // Skip if expected is not defined/null, we don't test it
    if (expVal === undefined || expVal === null) continue;

    const actVal = actual ? actual[field] : null;
    
    let passed = false;
    let mode: ValidationMode;
    let expectation: FieldExpectation | undefined;
    let suggestion: string | undefined;

    // Check if this is a FieldExpectation object or legacy plain value
    if (isFieldExpectation(expVal)) {
      // New validation mode system
      expectation = expVal;
      mode = expVal.mode;
      const validationResult = validateFieldValue(actVal, expVal);
      passed = validationResult.passed;
      
      if (!passed) {
        // For exact mode, try to suggest a pattern
        if (mode === 'exact' && typeof expVal.value === 'string') {
          suggestion = analyzeFieldFailure(field, rawText, expVal.value, String(actVal)) || undefined;
        }
      }
    } else {
      // Legacy plain value - treat as exact match for backwards compatibility
      mode = 'exact';
      
      if (field === "dateOfBirth") {
        // Date comparison logic
        const expDate = new Date(expVal as any);
        const actDate = actVal ? new Date(actVal as any) : null;
        passed = !!(actDate && expDate.getTime() === actDate.getTime());
      } else {
        passed = String(expVal).trim() === String(actVal || "").trim();
      }

      if (!passed && typeof expVal === 'string') {
        suggestion = analyzeFieldFailure(field, rawText, expVal, String(actVal)) || undefined;
      }
    }

    results.push({
      fieldName: field,
      expected: isFieldExpectation(expVal) ? expVal.value : expVal,
      actual: actVal,
      passed,
      mode,
      expectation,
      suggestion,
    });
  }

  return results;
}

/**
 * Compares expected vs actual tradelines.
 * Matches by account number when present, with fallback to creditor/type/date/amount
 * identity signals for bureau reports that omit account numbers.
 * Supports both legacy plain values and new FieldExpectation format.
 */
export function compareTradelines(
  expected: ParsedTradeline[] | null,
  actual: ParsedTradeline[],
  rawText: string
): TradelineComparisonResult[] {
  const results: TradelineComparisonResult[] = [];
  if (!expected || expected.length === 0) return results;

  const usedActualIndexes = new Set<number>();

  for (const expTl of expected) {
    const match = findBestTradelineMatch(expTl, actual, usedActualIndexes);
    const actTl = match?.tradeline ?? null;

    const fieldResults: FieldComparisonResult[] = [];
    let tlPassed = true;

    if (!actTl) {
      tlPassed = false;
      fieldResults.push({
        fieldName: "Tradeline Found",
        expected: "Found",
        actual: "Not Found",
        passed: false,
        mode: 'exact',
        suggestion: "Check tradeline splitting or identity matching fields",
      });
    } else {
      // Compare specific fields
      const fieldsToCompare: { key: keyof ParsedTradeline; label: string }[] = [
        { key: "creditorName", label: "Creditor Name" },
        { key: "accountType", label: "Account Type" },
        { key: "balance", label: "Balance" },
        { key: "status", label: "Status" },
      ];

      for (const { key, label } of fieldsToCompare) {
        const expVal = expTl[key];
        const actVal = actTl[key];
        
        let passed = false;
        let mode: ValidationMode;
        let expectation: FieldExpectation | undefined;
        let suggestion: string | undefined;

        // Check if this is a FieldExpectation object or legacy plain value
        if (isFieldExpectation(expVal)) {
          expectation = expVal;
          mode = expVal.mode;
          const validationResult = validateFieldValue(actVal, expVal);
          passed = validationResult.passed;

          if (!passed) {
            if (mode === 'exact' && typeof expVal.value === 'string') {
              suggestion = analyzeFieldFailure(label, rawText, expVal.value, String(actVal)) || undefined;
            }
          }
        } else {
          // Legacy plain value - treat as exact match
          mode = 'exact';
          passed = String(expVal) === String(actVal);

          if (!passed && (typeof expVal === 'string' || typeof expVal === 'number')) {
            suggestion = analyzeFieldFailure(label, rawText, String(expVal), String(actVal)) || undefined;
          }
        }

        if (!passed) tlPassed = false;

        fieldResults.push({
          fieldName: label,
          expected: isFieldExpectation(expVal) ? expVal.value : expVal,
          actual: actVal,
          passed,
          mode,
          expectation,
          suggestion,
        });
      }
      
      // Compare amounts object
      if (expTl.amounts) {
        if (expTl.amounts.high !== undefined) {
          const expVal = expTl.amounts.high;
          const actVal = actTl.amounts.high;
          
          let passed = false;
          let mode: ValidationMode;
          let expectation: FieldExpectation | undefined;
          let suggestion: string | undefined;

          if (isFieldExpectation(expVal)) {
            expectation = expVal;
            mode = expVal.mode;
            const validationResult = validateFieldValue(actVal, expVal);
            passed = validationResult.passed;

            if (!passed && mode === 'exact' && typeof expVal.value !== 'undefined') {
              suggestion = analyzeFieldFailure("High Credit", rawText, String(expVal.value), String(actVal)) || undefined;
            }
          } else {
            mode = 'exact';
            passed = expVal === actVal;
            
            if (!passed) {
              suggestion = analyzeFieldFailure("High Credit", rawText, String(expVal), String(actVal)) || undefined;
            }
          }

          if (!passed) tlPassed = false;

          fieldResults.push({
            fieldName: "High Credit",
            expected: isFieldExpectation(expVal) ? expVal.value : expVal,
            actual: actVal,
            passed,
            mode,
            expectation,
            suggestion,
          });
        }
        
        if (expTl.amounts.pastDue !== undefined) {
          const expVal = expTl.amounts.pastDue;
          const actVal = actTl.amounts.pastDue;
          
          let passed = false;
          let mode: ValidationMode;
          let expectation: FieldExpectation | undefined;
          let suggestion: string | undefined;

          if (isFieldExpectation(expVal)) {
            expectation = expVal;
            mode = expVal.mode;
            const validationResult = validateFieldValue(actVal, expVal);
            passed = validationResult.passed;

            if (!passed && mode === 'exact' && typeof expVal.value !== 'undefined') {
              suggestion = analyzeFieldFailure("Past Due", rawText, String(expVal.value), String(actVal)) || undefined;
            }
          } else {
            mode = 'exact';
            passed = expVal === actVal;
            
            if (!passed) {
              suggestion = analyzeFieldFailure("Past Due", rawText, String(expVal), String(actVal)) || undefined;
            }
          }

          if (!passed) tlPassed = false;

          fieldResults.push({
            fieldName: "Past Due",
            expected: isFieldExpectation(expVal) ? expVal.value : expVal,
            actual: actVal,
            passed,
            mode,
            expectation,
            suggestion,
          });
        }
      }
    }

    results.push({
      accountNumber: expTl.accountNumber || expTl.creditorName || "Expected tradeline",
      creditorName:
        String(unwrapExpectedValue(expTl.creditorName) || actTl?.creditorName || "").trim() ||
        "Unknown Creditor",
      actualIndex: match?.index,
      passed: tlPassed,
      fieldResults,
    });
  }

  return results;
}
