import type { ParsedTradeline } from "./reportParserTypes";
import { isLikelyCollectionEntityName } from "./creditorEntityResolver";

type Line = { text: string; index: number };

type AccountSection = {
  accountType: "Revolving" | "Mortgage" | "Installment" | "Open";
  lines: Line[];
};

type EquifaxOverviewFields = {
  accountNumber?: string;
  creditorPhone?: string | null;
  high?: number;
  notes?: string | null;
  memberNumber?: string | null;
  ratingCode?: string | null;
  ratingCodeDescription?: string | null;
};

const ACCOUNT_SECTION_REGEX = /^Accounts\s*-\s*(Revolving|Mortgage|Installment|Open)\b/i;
const EQUIFAX_DATE_PATTERN = "(\\d{4}[\\/-]\\d{2}[\\/-]\\d{2}|0\\d{2}[\\/-]\\d{2}[\\/-]\\d{2}|\\d{2}[\\/-]\\d{2}[\\/-]\\d{4})";
const COLLECTION_FIELD_LABELS = [
  "Date Assigned",
  "Member Name",
  "Phone Number",
  "Member Number",
  "First Delinquency",
  "Account Number",
  "Amount",
  "Status",
  "Balance",
  "Narrative",
  "Date Paid/Settled",
  "Date Verified",
  "Last Payment Date",
];
const COLLECTION_FIELD_LABEL_PATTERN = COLLECTION_FIELD_LABELS
  .map((label) => label.split(/\s+/).map(escapeRegex).join("\\s*"))
  .join("|");

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ text: line.replace(/\s+/g, " ").trim(), index }))
    .filter((line) => line.text.length > 0);
}

function isPageNoise(line: string): boolean {
  return (
    /^Credit ReportRequest Date\b/i.test(line) ||
    /^Page\s+\d+\s+of\s+\d+/i.test(line) ||
    /^Equifax Canada Co\.?$/i.test(line) ||
    /^www\.consumer\.equifax\.ca$/i.test(line)
  );
}

function isMajorHeader(line: string): boolean {
  return (
    ACCOUNT_SECTION_REGEX.test(line) ||
    /^(Collections|Public Records|Bank Information Reported|Inquiries|Consumer Statement|Alerts, Disclosures|Credit Score|Personal Information)\b/i.test(line)
  );
}

function isNoAccountsLine(line: string): boolean {
  return /You currently have no .*accounts on your credit file/i.test(line);
}

function isAccountAnchor(lines: Line[], position: number): boolean {
  const current = lines[position]?.text ?? "";
  const next = lines[position + 1]?.text ?? "";
  return /^Account$/i.test(current) && /^Number$/i.test(next);
}

function isLabelOnly(line: string): boolean {
  return /^(Overview|Account|Number|Phone|Highest|Balance|Notes|Member|Rating|Code|Rating Code Description|Status|Balance And|Amounts|Account Dates|Last|Reported|Payment|Due|Actual|Date|Closed|Amount|Past Due|Payment Details|Payment Responsibility|Individual|Payment History|High|Credit|Limit)$/i.test(line);
}

function isLikelyDescription(line: string): boolean {
  return (
    /^You can view up to/i.test(line) ||
    /^Revolving accounts are/i.test(line) ||
    /^Mortgage accounts are/i.test(line) ||
    /^Installment accounts are/i.test(line) ||
    /^Open accounts are/i.test(line)
  );
}

function findAccountSections(lines: Line[]): AccountSection[] {
  const sections: AccountSection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].text.match(ACCOUNT_SECTION_REGEX);
    if (!match) continue;

    const accountType = match[1] as AccountSection["accountType"];
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (isMajorHeader(lines[j].text) && !isPageNoise(lines[j].text)) {
        end = j;
        break;
      }
    }

    const sectionLines = lines.slice(i + 1, end).filter((line) => !isPageNoise(line.text));
    if (sectionLines.some((line) => isNoAccountsLine(line.text))) continue;
    sections.push({ accountType, lines: sectionLines });
  }

  return sections;
}

function findCollectionsSection(lines: Line[]): Line[] {
  const start = lines.findIndex((line) => /^Collections$/i.test(line.text));
  if (start === -1) return [];

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isMajorHeader(lines[i].text) && !/^Collections$/i.test(lines[i].text) && !isPageNoise(lines[i].text)) {
      end = i;
      break;
    }
  }

  return lines.slice(start + 1, end).filter((line) => !isPageNoise(line.text));
}

function findAccountNameStart(lines: Line[], anchor: number): number {
  let start = anchor;
  let collected = 0;

  for (let i = anchor - 1; i >= 0; i--) {
    const text = lines[i].text;
    if (/^Overview$/i.test(text)) continue;
    if (isPageNoise(text) || isMajorHeader(text) || isLabelOnly(text) || isLikelyDescription(text)) break;
    if (/^\d+$/.test(text) || /^\d+\s+of\s+\d+$/i.test(text)) break;

    start = i;
    collected += 1;
    if (collected >= 3) break;
  }

  return start;
}

function splitAccountBlocks(section: AccountSection): Line[][] {
  const anchors: number[] = [];
  for (let i = 0; i < section.lines.length; i++) {
    if (isAccountAnchor(section.lines, i)) anchors.push(i);
  }

  if (anchors.length === 0) {
    return section.lines.some((line) => /\*{2,}|Account Number/i.test(line.text)) ? [section.lines] : [];
  }

  const starts = anchors.map((anchor) => findAccountNameStart(section.lines, anchor));
  return anchors.map((anchor, index) => {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : section.lines.length;
    return section.lines.slice(start, end);
  });
}

function firstDateAfter(rawText: string, label: RegExp): Date | null {
  const inline = rawText.match(new RegExp(`${label.source}[\\s\\S]{0,80}?${EQUIFAX_DATE_PATTERN}`, "i"));
  return inline ? parseEquifaxDate(inline[1]) : null;
}

function numberFromString(value: string | null | undefined): number | null {
  if (!value || /^N\/A$/i.test(value.trim())) return null;
  const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstAmountAfter(rawText: string, label: RegExp): number | null {
  const match = rawText.match(new RegExp(`${label.source}\\s*\\$?(N\\/A|[\\d,]+(?:\\.\\d{2})?)`, "i"));
  return match ? numberFromString(match[1]) : null;
}

function findNextDate(lines: Line[], labelRegex: RegExp): Date | null {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRegex.test(lines[i].text)) continue;
    const sameLine = lines[i].text.match(new RegExp(EQUIFAX_DATE_PATTERN));
    if (sameLine) return parseEquifaxDate(sameLine[1]);

    for (let j = i + 1; j < Math.min(lines.length, i + 5); j++) {
      const match = lines[j].text.match(new RegExp(EQUIFAX_DATE_PATTERN));
      if (match) return parseEquifaxDate(match[1]);
    }
  }
  return null;
}

function findNextAmount(lines: Line[], labelRegex: RegExp): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRegex.test(lines[i].text)) continue;
    const sameLine = lines[i].text.match(/\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
    if (sameLine && !labelRegex.test(sameLine[0])) return numberFromString(sameLine[1]);

    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const match = lines[j].text.match(/^\$?(N\/A|[\d,]+(?:\.\d{2})?)$/i);
      if (match) return numberFromString(match[1]);
    }
  }
  return null;
}

function extractAccountNumber(rawText: string): string {
  const accountNumberMatch = rawText.match(/Account\s*Number\s*([*Xx]{2,}[A-Z0-9-]*\d[A-Z0-9-]*)/i);
  if (accountNumberMatch) return accountNumberMatch[1];

  const maskedMatch = rawText.match(/([*Xx]{2,}[A-Z0-9-]*\d[A-Z0-9-]*)/);
  return maskedMatch ? maskedMatch[1] : "Unknown";
}

function normalizePhoneParts(parts: string[]): string | null {
  const digits = parts.join("").replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  return digits.length >= 7 ? digits : null;
}

function extractEquifaxOverviewFields(lines: Line[]): EquifaxOverviewFields {
  const overviewStart = lines.findIndex((line) => /^Overview$/i.test(line.text));
  const balanceSectionIndex = lines.findIndex((line) => /^Balance\s+And\b/i.test(line.text));
  const start = overviewStart === -1 ? 0 : overviewStart + 1;
  const end = balanceSectionIndex === -1 ? lines.length : balanceSectionIndex;
  const overviewLines = lines.slice(start, end).map((line) => line.text);

  const accountIndex = overviewLines.findIndex((line) => /[*Xx]{2,}[A-Z0-9-]*\d[A-Z0-9-]*/.test(line));
  if (accountIndex === -1) return {};

  const accountNumber = extractAccountNumber(overviewLines[accountIndex]);
  const highIndex = overviewLines.findIndex((line, index) => index > accountIndex && /\$?\d[\d,]*(?:\.\d{2})?/.test(line) && line.includes("$"));
  const phoneParts: string[] = [];
  const phoneEnd = highIndex === -1 ? overviewLines.length : highIndex;
  let phoneLastIndex = accountIndex;
  for (let i = accountIndex + 1; i < phoneEnd; i++) {
    if (/^[\d\s().-]+$/.test(overviewLines[i])) {
      phoneParts.push(overviewLines[i]);
      phoneLastIndex = i;
    } else if (phoneParts.length > 0) {
      break;
    }
  }

  const memberRatingIndex = overviewLines.findIndex((line, index) =>
    index > (highIndex === -1 ? accountIndex : highIndex) &&
    /^[A-Z0-9]{4,}[A-Z][0-9]$/i.test(line)
  );
  const memberRating = memberRatingIndex === -1 ? null : overviewLines[memberRatingIndex].match(/^([A-Z0-9]{4,})([A-Z][0-9])$/i);
  const notesStart = highIndex === -1 ? phoneLastIndex + 1 : highIndex + 1;
  const notesEnd = memberRatingIndex === -1 ? overviewLines.length : memberRatingIndex;
  const notes = overviewLines
    .slice(notesStart, notesEnd)
    .filter((line) => !isLabelOnly(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const ratingCodeDescription = memberRatingIndex === -1
    ? null
    : overviewLines
        .slice(memberRatingIndex + 1)
        .filter((line) => !isLabelOnly(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

  return {
    accountNumber,
    creditorPhone: normalizePhoneParts(phoneParts),
    high: highIndex === -1 ? undefined : numberFromString(overviewLines[highIndex]) ?? undefined,
    notes: notes || null,
    memberNumber: memberRating?.[1] ?? null,
    ratingCode: memberRating?.[2]?.toUpperCase() ?? null,
    ratingCodeDescription: ratingCodeDescription || null,
  };
}

function extractCreditorName(lines: Line[]): string {
  const anchor = lines.findIndex((line, index) => isAccountAnchor(lines, index));
  const candidateLines = (anchor === -1 ? lines.slice(0, 3) : lines.slice(0, anchor))
    .map((line) => line.text)
    .filter((line) => !isPageNoise(line) && !isMajorHeader(line) && !isLabelOnly(line) && !isLikelyDescription(line));

  const candidate = candidateLines.join(" ").replace(/\s+/g, " ").trim();
  return candidate || "Unknown Creditor";
}

function extractCollectionAgencyName(lines: Line[]): string {
  const stopIndex = lines.findIndex((line) => isCollectionFieldLine(line.text));
  const headerLines = (stopIndex === -1 ? lines : lines.slice(0, stopIndex))
    .map((line) => line.text)
    .map(stripTrailingCollectionFields)
    .filter((line) => !isPageNoise(line) && !isMajorHeader(line) && !isLabelOnly(line) && !isLikelyDescription(line));

  const candidate = headerLines.join(" ").replace(/\s+/g, " ").trim();
  return stripTrailingCollectionFields(candidate) || extractCreditorName(lines);
}

function isCollectionFieldLine(line: string): boolean {
  const trimmed = line.trim();
  return /^(Account|Number)$/i.test(trimmed) || new RegExp(`^(?:${COLLECTION_FIELD_LABEL_PATTERN})`, "i").test(trimmed);
}

function stripTrailingCollectionFields(value: string): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  const match = compacted.match(new RegExp(`^(.*?)(?:\\s+(?:${COLLECTION_FIELD_LABEL_PATTERN}).*)$`, "i"));
  return (match?.[1] ?? compacted).trim();
}

function extractStatus(rawText: string, accountType: string): string {
  const ratingCode = rawText.match(/\b([RIMO][1-9])\b/i)?.[1]?.toUpperCase();
  const description = rawText.match(new RegExp(`${accountType}\\s*-\\s*([^\\n]+(?:\\n(?!Balance And|Payment Details|Payment History)[^\\n]+)?)`, "i"));
  const closedBy = rawText.match(/Closed by[^\n]*/i)?.[0];
  return description?.[0]?.replace(/\s+/g, " ").trim() || closedBy || ratingCode || "";
}

function parseAccountBlock(lines: Line[], accountType: AccountSection["accountType"]): ParsedTradeline | null {
  const rawText = lines.map((line) => line.text).join("\n");
  const overview = extractEquifaxOverviewFields(lines);
  const accountNumber = overview.accountNumber ?? extractAccountNumber(rawText);
  const creditorName = extractCreditorName(lines);
  if (accountNumber === "Unknown" && creditorName === "Unknown Creditor") return null;

  const opened = firstDateAfter(rawText, /Opened/i) ?? findNextDate(lines, /^Opened$/i);
  const reported = firstDateAfter(rawText, /(?:Last\s*)?Reported/i) ?? findNextDate(lines, /^(Last\s*)?Reported$/i);
  const lastPaymentDate = firstDateAfter(rawText, /Last\s*Payment/i) ?? findNextDate(lines, /^Last$|^Last Payment$/i);
  const closed = firstDateAfter(rawText, /(?:Date\s*)?Closed/i) ?? findNextDate(lines, /^Closed$/i);
  const dofd = firstDateAfter(rawText, /(?:Date\s*of\s*)?First\s*Delinquency/i);
  const balance = firstAmountAfter(rawText, /Balance/i) ?? findNextAmount(lines, /^Balance$/i);
  const high = overview.high ?? firstAmountAfter(rawText, /(?:Highest\s*Balance|High\s*Credit)/i) ?? findNextAmount(lines, /^Highest$|^High$/i) ?? undefined;
  const creditLimit = firstAmountAfter(rawText, /Credit\s*Limit/i) ?? findNextAmount(lines, /^Credit$|^Credit Limit$/i) ?? undefined;
  const pastDue = firstAmountAfter(rawText, /Past\s*Due/i) ?? findNextAmount(lines, /^Past Due$/i) ?? undefined;
  const amountWrittenOff = firstAmountAfter(rawText, /Amount\s*(?:Written\s*)?Off/i) ?? undefined;
  const actualPaymentAmount = firstAmountAfter(rawText, /Actual\s*payment/i) ?? findNextAmount(lines, /^Actual$|^Actual payment$/i);
  const responsibilityCode =
    rawText.match(/Payment\s*Responsibility\s*([A-Za-z][A-Za-z ]{1,40})/i)?.[1]?.trim() ||
    (rawText.match(/\nIndividual\b/i) ? "Individual" : undefined);

  const parsed: ParsedTradeline = {
    accountNumber,
    creditorName,
    accountType,
    balance,
    status: extractStatus(rawText, accountType),
    dates: {
      opened,
      reported,
      closed,
      dofd,
    },
    amounts: {
      high,
      pastDue,
    },
    creditLimit,
    lastPaymentDate,
    responsibilityCode,
    creditorPhone: overview.creditorPhone ?? null,
    memberNumber: overview.memberNumber ?? null,
    ratingCode: overview.ratingCode ?? null,
    ratingCodeDescription: overview.ratingCodeDescription ?? null,
    notes: overview.notes ?? null,
    amountWrittenOff: amountWrittenOff ?? null,
    actualPaymentAmount,
    remarkCodes: [],
    sourceText: rawText,
    balanceMissingFromReport: balance === null,
  };

  return parsed;
}

function splitCollectionBlocks(lines: Line[]): Line[][] {
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\bDate\s*Assigned/i.test(lines[i].text)) {
      let start = i;
      const dateAssignedStartsLine = /^Date\s*Assigned/i.test(lines[i].text);
      if (dateAssignedStartsLine) {
        for (let j = i - 1; j >= 0; j--) {
          if (isPageNoise(lines[j].text) || isMajorHeader(lines[j].text) || /^Last Payment/i.test(lines[j].text)) break;
          if (!isLabelOnly(lines[j].text)) start = j;
          if (i - start >= 3) break;
        }
      }
      if (starts.at(-1) === start) continue;
      starts.push(start);
    }
  }

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    return lines.slice(start, end);
  });
}

function valueAfterInlineLabel(rawText: string, label: RegExp): string | null {
  const match = rawText.match(
    new RegExp(`${label.source}\\s*([\\s\\S]*?)(?=\\s*(?:${COLLECTION_FIELD_LABEL_PATTERN})|$)`, "i")
  );
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function dateAfterCollectionLabel(rawText: string, label: RegExp): Date | null {
  const value = valueAfterInlineLabel(rawText, label);
  const match = value?.match(new RegExp(EQUIFAX_DATE_PATTERN));
  return match ? parseEquifaxDate(match[1]) : null;
}

function amountAfterCollectionLabel(rawText: string, label: RegExp): number | null {
  const value = valueAfterInlineLabel(rawText, label);
  const match = value?.match(/\$?(N\/A|[\d,]+(?:\.\d{2})?)/i);
  return match ? numberFromString(match[1]) : null;
}

function parseCollectionBlock(lines: Line[]): ParsedTradeline | null {
  const rawText = ["Collections", ...lines.map((line) => line.text)].join("\n");
  const accountNumber = extractAccountNumber(rawText);
  if (accountNumber === "Unknown") return null;

  const collectionAgencyName = extractCollectionAgencyName(lines);
  const rawMemberName = valueAfterInlineLabel(rawText, /Member\s*Name/i) || undefined;
  const memberName =
    rawMemberName && !isLikelyCollectionEntityName(rawMemberName)
      ? rawMemberName
      : undefined;
  const dateAssigned = dateAfterCollectionLabel(rawText, /Date\s*Assigned/i);
  const firstDelinquency = dateAfterCollectionLabel(rawText, /First\s*Delinquency/i);
  const lastPaymentDate = dateAfterCollectionLabel(rawText, /Last\s*Payment\s*Date/i);
  const dateVerified = dateAfterCollectionLabel(rawText, /Date\s*Verified/i);
  const amount = amountAfterCollectionLabel(rawText, /Amount/i);
  const balance = amountAfterCollectionLabel(rawText, /Balance/i);
  const status = valueAfterInlineLabel(rawText, /Status/i) || "Collection";
  const memberClassificationNote =
    rawMemberName && !memberName
      ? `Equifax lists "${rawMemberName}" as Member Name, but that name appears to be a collection entity rather than the original creditor.`
      : undefined;

  const parsed: ParsedTradeline = {
    accountNumber,
    creditorName: collectionAgencyName,
    accountType: "Collection",
    balance,
    status,
    dates: {
      opened: null,
      reported: dateVerified,
      closed: null,
      dofd: firstDelinquency,
    },
    amounts: {
      high: undefined,
      pastDue: undefined,
    },
    isCollectionAccount: true,
    collectionAgencyName,
    originalCreditorName: memberName,
    dateAssignedToCollection: dateAssigned,
    originalBalance: amount ?? undefined,
    lastPaymentDate,
    remarkCodes: [],
    sourceText: rawText,
    notes: memberClassificationNote,
    balanceMissingFromReport: balance === null,
  };

  (parsed as any).dateVerified = dateVerified;
  (parsed as any).memberName = rawMemberName ?? null;
  (parsed as any).memberNumber = valueAfterInlineLabel(rawText, /Member\s*Number/i);
  return parsed;
}

function dedupeTradelines(tradelines: ParsedTradeline[]): ParsedTradeline[] {
  const seen = new Set<string>();
  const results: ParsedTradeline[] = [];

  for (const tradeline of tradelines) {
    const key = [
      tradeline.accountNumber || "",
      tradeline.creditorName || "",
      tradeline.accountType || "",
      tradeline.dates?.opened?.toISOString?.() || "",
    ].join("|").toUpperCase();

    if (seen.has(key)) continue;
    seen.add(key);
    results.push(tradeline);
  }

  return results;
}

export function extractEquifaxTradelines(text: string): ParsedTradeline[] {
  console.log(`[Equifax PDF Extract] Processing ${text.length} characters of text`);
  const lines = normalizeLines(text);
  const tradelines: ParsedTradeline[] = [];

  for (const section of findAccountSections(lines)) {
    for (const block of splitAccountBlocks(section)) {
      const parsed = parseAccountBlock(block, section.accountType);
      if (parsed) tradelines.push(parsed);
    }
  }

  for (const block of splitCollectionBlocks(findCollectionsSection(lines))) {
    const parsed = parseCollectionBlock(block);
    if (parsed) tradelines.push(parsed);
  }

  if (tradelines.length === 0) {
    console.log("[Equifax PDF Extract] Structured section parsing found no tradelines. Using legacy fallback extraction.");
    return extractEquifaxTradelinesFromSection(text);
  }

  const deduped = dedupeTradelines(tradelines);
  console.log(`[Equifax PDF Extract] Successfully parsed ${deduped.length} tradelines`);
  return deduped;
}

/**
 * Splits raw Equifax report text into logical sections based on common headers.
 */
export function parseEquifaxSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = normalizeLines(text);

  for (const section of findAccountSections(lines)) {
    sections[section.accountType.toLowerCase()] = section.lines.map((line) => line.text).join("\n");
    sections.credit = [sections.credit, sections[section.accountType.toLowerCase()]].filter(Boolean).join("\n\n");
  }

  const collections = findCollectionsSection(lines);
  if (collections.length > 0) {
    sections.collections = collections.map((line) => line.text).join("\n");
  }

  return sections;
}

/**
 * Extracts multiple tradelines from a given text section by splitting blocks.
 * Kept for compatibility with older callers.
 */
export function extractEquifaxTradelinesFromSection(sectionText: string): ParsedTradeline[] {
  const lines = normalizeLines(sectionText);
  const synthetic: AccountSection = { accountType: "Open", lines };
  const tradelines = splitAccountBlocks(synthetic)
    .map((block) => parseAccountBlock(block, "Open"))
    .filter(Boolean) as ParsedTradeline[];

  if (tradelines.length > 0) return tradelines;

  return sectionText
    .split(/\n\s*\n+/)
    .map(extractEquifaxTradeline)
    .filter(Boolean) as ParsedTradeline[];
}

/**
 * Extracts a single tradeline from an Equifax-specific block of text.
 */
export function extractEquifaxTradeline(sectionText: string): ParsedTradeline | null {
  const parsed = parseAccountBlock(normalizeLines(sectionText), "Open");
  if (parsed) return parsed;

  if (!sectionText || sectionText.length < 10) return null;
  const ratingMatch = sectionText.match(/\b([RIM][1-9])\b/i);
  const status = ratingMatch ? ratingMatch[1].toUpperCase() : "Unknown";
  const balanceMatch = sectionText.match(/(?:Balance|Bal)[^\d]*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, "")) : null;
  const pastDueMatch = sectionText.match(/(?:Past Due|Amount Past Due)[^\d]*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  const pastDue = pastDueMatch ? parseFloat(pastDueMatch[1].replace(/,/g, "")) : undefined;
  const accountNumber = extractAccountNumber(sectionText);
  if (accountNumber === "Unknown") return null;

  const lines = normalizeLines(sectionText);
  const creditorName = extractCreditorName(lines);
  const opened = firstDateAfter(sectionText, /Opened/i);

  return {
    accountNumber,
    creditorName,
    accountType: "Unknown",
    balance,
    status,
    dates: {
      opened,
    },
    amounts: {
      pastDue,
    },
    remarkCodes: [],
    sourceText: sectionText,
    balanceMissingFromReport: balance === null,
    isCollectionAccount: sectionText.toUpperCase().includes("COLLECTION") || status === "R9",
    collectionAgencyName: sectionText.toUpperCase().includes("COLLECTION") ? creditorName : undefined,
  };
}

/**
 * Resolves typical Equifax date strings into Date objects.
 */
function parseEquifaxDate(dateStr: string): Date | null {
  const parts = dateStr.split(/[\/-]/);
  if (parts.length !== 3) return null;

  let year: string;
  let month: string;
  let day: string;

  if (parts[0].length === 4) {
    [year, month, day] = parts;
  } else if (parts[0].length === 3 && /^0\d{2}$/.test(parts[0])) {
    year = `2${parts[0]}`;
    month = parts[1];
    day = parts[2];
  } else if (parts[2].length === 4) {
    [day, month, year] = parts;
  } else {
    year = parseInt(parts[0], 10) > 50 ? `19${parts[0]}` : `20${parts[0]}`;
    month = parts[1];
    day = parts[2];
  }

  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
