import { parseDate } from "./tradelineDateParser";

const MONTH_PATTERN =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

export const TRANSUNION_TEXT_DATE_PATTERN = new RegExp(
  `\\b(?:${MONTH_PATTERN})\\.?\\s+\\d{1,2},?\\s+\\d{4}\\b`,
  "i",
);

export const TRANSUNION_MONTH_YEAR_PATTERN = new RegExp(
  `\\b(?:${MONTH_PATTERN})\\.?\\s+(?:19|20)\\d{2}`,
  "i",
);

const SECTION_BOUNDARIES = [
  /Personal Information\s*:/i,
  /Personal Info\s*:/i,
  /Cross Reference\(s\)\s*:/i,
  /Address\(es\)\s*:/i,
  /Employment\(s\)\s*:/i,
  /Telephone Number\(s\)\s*:/i,
  /Account\(s\)\s*:/i,
  /Credit Related Inquiries\s*:/i,
  /Non-?Credit Related Inquiries\s*:/i,
  /Account Review Inquiries\s*:/i,
  /Consumer Statement\(s\)\s*:/i,
  /Consumer Message\(s\)\s*:/i,
  /Special Message\(s\)\s*:/i,
  /Insolvency\s*:/i,
  /\*\*\*\s*This completes the report\s*\*\*\*/i,
  /Consumer's Name/i,
  /Signature\s*:/i,
];

export function findTransUnionDateString(text: string): string | null {
  const match = text.match(TRANSUNION_TEXT_DATE_PATTERN);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

export function parseTransUnionDate(text: string | null | undefined): Date | null {
  if (!text) return null;
  const dateString = findTransUnionDateString(text) || text.trim();
  return parseDate(dateString);
}

export function extractTransUnionSection(
  text: string,
  startPatterns: RegExp[],
  stopPatterns: RegExp[] = SECTION_BOUNDARIES,
): string | null {
  if (!text) return null;

  let startMatch: RegExpExecArray | null = null;
  for (const pattern of startPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && (!startMatch || match.index < startMatch.index)) {
      startMatch = match;
    }
  }

  if (!startMatch) return null;

  const start = startMatch.index + startMatch[0].length;
  const remainder = text.slice(start);
  let end = remainder.length;

  for (const pattern of stopPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(remainder);
    if (match && match.index >= 0 && match.index < end) {
      end = match.index;
    }
  }

  const section = remainder.slice(0, end).trim();
  return section.length > 0 ? section : null;
}

export function formatNorthAmericanPhoneFromDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (normalized.length !== 10) return null;
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

export function isKnownBureauPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized === "8006639980" || normalized === "8004657166";
}

export type TransUnionPaymentGridRow = {
  dateLabel: string;
  date: Date | null;
  balance: number | null;
  payment: number | null;
  pastDue: number | null;
  mop: string | null;
  terms: string | null;
  highCredit: number | null;
  creditLimit: number | null;
  balloonPayment: number | null;
  chargeOff: number | null;
  narrative: string | null;
  rawLine: string;
};

export type TransUnionPaymentSummary = {
  "30": number;
  "60": number;
  "90": number;
  "#M": number;
};

function extractPaymentGridWindow(text: string): string | null {
  const headerMatch = text.match(/Date\s+Balance[\s\S]{0,120}?(?:Payment|Past\s+Due|MOP)/i);
  if (!headerMatch || headerMatch.index == null) {
    const compactMatch = text.match(/Payment\s+History/i);
    if (!compactMatch || compactMatch.index == null) return null;

    const compactStart = compactMatch.index + compactMatch[0].length;
    const compactRemainder = text.slice(compactStart);
    const compactStopMatch = compactRemainder.match(
      /\b(?:Legend|Creditor Name|Account\(s\)|Credit Related Inquiries|Non-?Credit Related Inquiries|Account Review Inquiries|Consumer Statement\(s\)|\*\*\*\s*This completes the report)/i,
    );

    const compactEnd = compactStopMatch?.index ?? compactRemainder.length;
    const compactWindowText = compactRemainder.slice(0, compactEnd).trim();
    return compactWindowText.length > 0 ? compactWindowText : null;
  }

  const start = headerMatch.index + headerMatch[0].length;
  const remainder = text.slice(start);
  const stopMatch = remainder.match(
    /\b(?:Legend|Creditor Name|Account\(s\)|Credit Related Inquiries|Non-?Credit Related Inquiries|Account Review Inquiries|Consumer Statement\(s\)|\*\*\*\s*This completes the report)/i,
  );

  const end = stopMatch?.index ?? remainder.length;
  const windowText = remainder.slice(0, end).trim();
  return windowText.length > 0 ? windowText : null;
}

function parseAmountToken(token: string): number | null {
  const clean = token.replace(/[$,\s]/g, "");
  if (!clean || !/^\d+(?:\.\d+)?$/.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferFirstAmountFromCompactToken(token: string): number | null {
  const clean = token.replace(/\D/g, "");
  if (!clean) return null;
  if (/^0{2,}/.test(clean)) return 0;
  if (clean.length <= 5) return Number(clean);

  for (let width = 5; width >= 1; width--) {
    const first = clean.slice(0, width);
    if (/^0+$/.test(first)) continue;
    const second = clean.slice(width, width * 2);
    if (second === first) return Number(first);
  }

  return Number(clean.slice(0, 3));
}

function parseCompactAmount(value: string | null): number | null {
  if (value == null || value === "") return null;
  if (!/^\d+$/.test(value)) return null;
  if (/^0+$/.test(value)) return 0;
  if (value.length > 1 && value.startsWith("0")) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function splitLayoutGroupedCompactPaymentGridToken(
  clean: string,
): Omit<TransUnionPaymentGridRow, "dateLabel" | "date" | "narrative" | "rawLine"> | null {
  // pdf-parse can collapse right-aligned TransUnion columns into one token while preserving
  // visual group order. Some rows have no Payment value, so the second digit belongs to Past Due
  // and the next digit belongs to MOP.
  const match = clean.match(/^([0-9])([0-9])([0-9])([1-9][0-9]{2})([1-9][0-9]{3,4})(0)(0)$/);
  if (!match) return null;

  const [, balanceRaw, paymentRaw, pastDueRaw, termsRaw, highCreditRaw, balloonRaw, chargeOffRaw] =
    match;

  return {
    balance: parseCompactAmount(balanceRaw),
    payment: null,
    pastDue: parseCompactAmount(paymentRaw),
    mop: pastDueRaw,
    terms: String(Number(termsRaw)),
    highCredit: parseCompactAmount(highCreditRaw),
    creditLimit: null,
    balloonPayment: parseCompactAmount(balloonRaw),
    chargeOff: parseCompactAmount(chargeOffRaw),
  };
}

function splitCompactPaymentGridToken(token: string): Omit<TransUnionPaymentGridRow, "dateLabel" | "date" | "narrative" | "rawLine"> | null {
  const clean = token.replace(/\D/g, "");
  if (clean.length < 6 || clean.length > 30) return null;

  const layoutGroupedColumns = splitLayoutGroupedCompactPaymentGridToken(clean);
  if (layoutGroupedColumns) return layoutGroupedColumns;

  const capitalWithTerms = clean.match(/^(\d{3})(\d{2})(\d{2})(\d)(\d{2})(\d{3})(\d{3})(0)(0)$/);
  if (capitalWithTerms) {
    return {
      balance: parseCompactAmount(capitalWithTerms[1]),
      payment: parseCompactAmount(capitalWithTerms[2]),
      pastDue: parseCompactAmount(capitalWithTerms[3]),
      mop: capitalWithTerms[4],
      terms: String(Number(capitalWithTerms[5])),
      highCredit: parseCompactAmount(capitalWithTerms[6]),
      creditLimit: parseCompactAmount(capitalWithTerms[7]),
      balloonPayment: parseCompactAmount(capitalWithTerms[8]),
      chargeOff: parseCompactAmount(capitalWithTerms[9]),
    };
  }

  const capitalLatest = clean.match(/^(\d{3})(\d{3})(\d)(\d)(\d{3})(\d{3})(0)$/);
  if (capitalLatest) {
    return {
      balance: parseCompactAmount(capitalLatest[1]),
      payment: parseCompactAmount(capitalLatest[2]),
      pastDue: parseCompactAmount(capitalLatest[3]),
      mop: capitalLatest[4],
      terms: null,
      highCredit: parseCompactAmount(capitalLatest[5]),
      creditLimit: parseCompactAmount(capitalLatest[6]),
      balloonPayment: parseCompactAmount(capitalLatest[7]),
      chargeOff: null,
    };
  }

  const openTelecom = clean.match(/^(\d{3})(\d)(\d{3})(\d)(\d)(0)(0)$/);
  if (openTelecom) {
    return {
      balance: parseCompactAmount(openTelecom[1]),
      payment: parseCompactAmount(openTelecom[2]),
      pastDue: parseCompactAmount(openTelecom[3]),
      mop: openTelecom[4],
      terms: String(Number(openTelecom[5])),
      highCredit: parseCompactAmount(openTelecom[6]),
      creditLimit: null,
      balloonPayment: parseCompactAmount(openTelecom[7]),
      chargeOff: null,
    };
  }

  const shortZeroBalance = clean.match(/^([0-9])([0-9])([0-9])([0-9])([0-9])([0-9])([0-9])$/);
  if (shortZeroBalance) {
    return {
      balance: parseCompactAmount(shortZeroBalance[1]),
      payment: null,
      pastDue: parseCompactAmount(shortZeroBalance[2]),
      mop: shortZeroBalance[3],
      terms: shortZeroBalance[4],
      highCredit: parseCompactAmount(shortZeroBalance[5]),
      creditLimit: null,
      balloonPayment: parseCompactAmount(shortZeroBalance[6]),
      chargeOff: parseCompactAmount(shortZeroBalance[7]),
    };
  }

  return null;
}

function cleanGridColumnWindow(rawAfterDate: string): string {
  return rawAfterDate
    .replace(/[A-Z]{1,3}\s*\/\s*[A-Z]{0,3}\b/g, " ")
    .replace(/\b(?:Creditor|Reported|Opened|Closed|Legend|Status|Account|Payment History)\b[\s\S]*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGridRowColumns(rawAfterDate: string): Omit<TransUnionPaymentGridRow, "dateLabel" | "date" | "narrative" | "rawLine"> | null {
  const window = cleanGridColumnWindow(rawAfterDate);
  if (!window) return null;

  const tokens = window.match(/X|\$?\d[\d,]*(?:\.\d+)?(?:\/[A-Z])?/gi) ?? [];
  if (tokens.length === 0) return null;

  if (tokens.length === 1 && /^X$/i.test(tokens[0])) {
    return {
      balance: null,
      payment: null,
      pastDue: null,
      mop: "X",
      terms: null,
      highCredit: null,
      creditLimit: null,
      balloonPayment: null,
      chargeOff: null,
    };
  }

  if (tokens.length === 1 && /^\$?\d{6,}$/.test(tokens[0])) {
    const compactColumns = splitCompactPaymentGridToken(tokens[0]);
    if (compactColumns) return compactColumns;

    const amount = inferFirstAmountFromCompactToken(tokens[0]);
    if (amount === null) return null;
    return {
      balance: amount,
      payment: null,
      pastDue: null,
      mop: null,
      terms: null,
      highCredit: null,
      creditLimit: null,
      balloonPayment: null,
      chargeOff: null,
    };
  }

  const parseAmountAt = (index: number): number | null => parseAmountToken(tokens[index] ?? "");
  const parseTextAt = (index: number): string | null => {
    const token = tokens[index];
    if (!token) return null;
    return token.trim().toUpperCase();
  };

  const balance = parseAmountAt(0);
  const payment = parseAmountAt(1);
  const pastDue = parseAmountAt(2);
  const mop = parseTextAt(3);

  const hasTermsColumn = tokens.length >= 9;
  const terms = hasTermsColumn ? parseTextAt(4) : null;
  const financialStart = hasTermsColumn ? 5 : 4;

  return {
    balance,
    payment,
    pastDue,
    mop,
    terms,
    highCredit: parseAmountAt(financialStart),
    creditLimit: parseAmountAt(financialStart + 1),
    balloonPayment: parseAmountAt(financialStart + 2),
    chargeOff: parseAmountAt(financialStart + 3),
  };
}

function toNonNegativeInteger(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export function extractTransUnionPaymentSummary(text: string): TransUnionPaymentSummary | null {
  if (!text) return null;

  const summaryPatterns = [
    /30\s+60\s+90\s+#M[\s\S]{0,120}?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i,
    /30\s*:?\s*(\d+)\s+60\s*:?\s*(\d+)\s+90\s*:?\s*(\d+)\s+#M\s*:?\s*(\d+)/i,
    /30\s*:\s*(\d+)[\s,;|]+60\s*:\s*(\d+)[\s,;|]+90\s*:\s*(\d+)[\s,;|]+#M\s*:\s*(\d+)/i,
    /30\s*(?:days?)?\s*(?:late)?\s*[:=]\s*(\d+)[\s\S]{0,40}?60\s*(?:days?)?\s*(?:late)?\s*[:=]\s*(\d+)[\s\S]{0,40}?90\s*(?:days?)?\s*(?:late)?\s*[:=]\s*(\d+)[\s\S]{0,40}?(?:#M|months?\s+reviewed)\s*[:=]\s*(\d+)/i,
  ];

  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const late30 = toNonNegativeInteger(match[1]);
    const late60 = toNonNegativeInteger(match[2]);
    const late90 = toNonNegativeInteger(match[3]);
    const months = toNonNegativeInteger(match[4]);

    if (
      late30 !== null &&
      late60 !== null &&
      late90 !== null &&
      months !== null &&
      months <= 999 &&
      late30 <= months &&
      late60 <= months &&
      late90 <= months
    ) {
      return {
        "30": late30,
        "60": late60,
        "90": late90,
        "#M": months,
      };
    }
  }

  return null;
}

export function formatTransUnionPaymentSummary(summary: TransUnionPaymentSummary | null): string | null {
  if (!summary) return null;
  return `30d:${summary["30"]} 60d:${summary["60"]} 90d:${summary["90"]} months:${summary["#M"]}`;
}

export function extractTransUnionMonthsReviewed(text: string): number | null {
  const explicitMatch = text.match(/\bMonths\s+Reviewed\s*:?\s*(\d+)\b/i);
  if (explicitMatch) {
    const months = toNonNegativeInteger(explicitMatch[1]);
    if (months !== null) return months;
  }

  return extractTransUnionPaymentSummary(text)?.["#M"] ?? null;
}

export function extractTransUnionPaymentGridRows(text: string): TransUnionPaymentGridRow[] {
  if (!text || !TRANSUNION_MONTH_YEAR_PATTERN.test(text)) return [];
  const gridWindow = extractPaymentGridWindow(text);
  if (!gridWindow) return [];

  const rows: TransUnionPaymentGridRow[] = [];
  const rowPattern = new RegExp(
    `\\b(${MONTH_PATTERN})\\.?\\s+((?:19|20)\\d{2})([\\s\\S]{0,140}?)(?=\\b(?:${MONTH_PATTERN})\\.?\\s+(?:19|20)\\d{2}|$)`,
    "gi",
  );

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(gridWindow)) !== null) {
    const month = match[1];
    const year = match[2];
    const rawAfterDate = match[3] ?? "";
    const rawLine = `${month} ${year}${rawAfterDate}`.replace(/\s+/g, " ").trim();
    const columns = parseGridRowColumns(rawAfterDate);
    const narrativeMatch = rawAfterDate.match(/([A-Z]{1,3}\s*\/\s*[A-Z]{0,3})\b/);
    const date = parseDate(`${month} ${year}`);

    if (!columns && !narrativeMatch) continue;

    rows.push({
      dateLabel: `${month} ${year}`,
      date,
      balance: columns?.balance ?? null,
      payment: columns?.payment ?? null,
      pastDue: columns?.pastDue ?? null,
      mop: columns?.mop ?? null,
      terms: columns?.terms ?? null,
      highCredit: columns?.highCredit ?? null,
      creditLimit: columns?.creditLimit ?? null,
      balloonPayment: columns?.balloonPayment ?? null,
      chargeOff: columns?.chargeOff ?? null,
      narrative: narrativeMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
      rawLine,
    });
  }

  return rows;
}

export function extractLatestTransUnionPaymentGridBalance(text: string): number | null {
  const firstRow = extractTransUnionPaymentGridRows(text)[0];
  return firstRow?.balance ?? null;
}
