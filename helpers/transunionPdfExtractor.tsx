import { ParsedTradeline } from "./reportParser";
import { splitIntoTradelineSections } from "./tradelineSectionSplitter";
import {
  extractAccountNumber,
  extractCreditorName,
  extractOriginalCreditor,
  extractIsCollectionAccount,
  extractCollectionAgencyName,
  extractCollectionTurnoverSignal,
} from "./tradelineBasicInfoExtractors";
import {
  extractAccountType,
  extractStatus,
} from "./tradelineAccountTypeExtractors";
import {
  extractBalance,
  extractAmounts,
  extractOriginalBalance,
  extractMonthlyPayment,
} from "./tradelineAmountExtractors";
import {
  extractDateAssignedToCollection,
  extractLastActivityDate,
  extractLastPaymentDate,
} from "./tradelineDateExtractors";
import {
  extractRemarkCodes,
  extractInterestRate,
  extractTerms,
  extractPaymentPattern,
} from "./tradelineOtherExtractors";
import { extractDates } from "./tradelineDateParser";
import {
  extractTransUnionMonthsReviewed,
  extractTransUnionPaymentGridRows,
  extractTransUnionPaymentSummary,
  formatTransUnionPaymentSummary,
} from "./transunionTextParsing";
import {
  isSamePaymentAmount,
  normalizeTransUnionPaymentTerms,
  parseTransUnionPaymentAmountFrequency,
} from "./transunionPaymentTerms";
import { normalizeAccountNumber } from "./accountNumberIdentity";

/**
 * Extracts tradelines from credit report text.
 * Supports Canadian credit report formats (Equifax Canada, TransUnion Canada).
 *
 * @param text The extracted text from a credit report PDF
 * @returns Array of parsed tradelines
 */
export function extractTradelines(text: string): ParsedTradeline[] {
  const tradelines: ParsedTradeline[] = [];

  console.log(
    `[Tradeline Extract] Processing ${text.length} characters of text`,
  );

  // Step 1: Split text into tradeline sections
  const sections = splitIntoTradelineSections(text);

  console.log(
    `[Tradeline Extract] Found ${sections.length} potential tradeline sections`,
  );

  // Step 2: Parse each section into a tradeline
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const tradeline = parseTradelineSection(section, i);

    if (tradeline) {
      tradelines.push(tradeline);
      console.log(
        `[Tradeline Extract] ✓ Parsed tradeline ${i + 1}: ${tradeline.creditorName} - ${tradeline.accountNumber}`,
      );
    } else {
      console.log(
        `[Tradeline Extract] ✗ Failed to parse tradeline ${i + 1} (insufficient data)`,
      );
    }
  }

  console.log(
    `[Tradeline Extract] Successfully parsed ${tradelines.length} tradelines before deduplication`,
  );

  // Step 3: Deduplicate tradelines with the same creditor name (Issue 2 fix)
  const deduplicated = deduplicateTradelines(tradelines);

  console.log(
    `[Tradeline Extract] Successfully parsed ${deduplicated.length} tradelines after deduplication`,
  );

  return deduplicated;
}

/**
 * Parses a single tradeline section into a ParsedTradeline object.
 *
 * @param section The text section containing tradeline data
 * @param index The index of this section (for logging)
 * @returns ParsedTradeline object or null if validation fails
 */
function parseTradelineSection(
  section: string,
  index: number,
): ParsedTradeline | null {
  console.log(
    `[Tradeline Parse] Parsing section ${index + 1} (${section.length} chars)`,
  );

  // Check if this is a collection account
  const isCollectionAccount = extractIsCollectionAccount(section);
  const hasCollectionTurnoverSignal = extractCollectionTurnoverSignal(section);

  // Extract all fields
  const accountNumber = extractAccountNumber(section);
  const creditorName = extractCreditorName(section);
  const accountType = extractAccountType(section);
  const balance = extractBalance(section);
  const status = extractStatus(section);
  const dates = extractDates(section);
  const amounts = extractAmounts(section);
  const remarkCodes = extractRemarkCodes(section);

  // Extract collection-account specific fields
  const collectionAgencyName = isCollectionAccount ? extractCollectionAgencyName(section) : null;
  const dateAssignedToCollection = isCollectionAccount ? extractDateAssignedToCollection(section) : null;
  const originalBalance = isCollectionAccount ? extractOriginalBalance(section) : null;
  const collectionAgencyMissingFromReport =
    isCollectionAccount && hasCollectionTurnoverSignal && !collectionAgencyName;
  const dateAssignedToCollectionMissingFromReport =
    isCollectionAccount && hasCollectionTurnoverSignal && !dateAssignedToCollection;
  const originalCreditorName = isCollectionAccount
    ? extractOriginalCreditor(section) ||
      (collectionAgencyMissingFromReport && creditorName ? creditorName : null)
    : null;
  
  // Extract financial details (applicable to both regular and collection accounts)
  const interestRate = extractInterestRate(section);
  let terms = extractTerms(section);
  let monthlyPayment = extractMonthlyPayment(section);
  let scheduledMonthlyPayment: number | undefined;
  let paymentFrequency: string | null | undefined;
  const paymentTerms = parseTransUnionPaymentAmountFrequency(terms);
  if (paymentTerms) {
    monthlyPayment = monthlyPayment ?? paymentTerms.amount;
    scheduledMonthlyPayment = paymentTerms.amount;
    paymentFrequency = paymentTerms.frequency;
    terms = null;
  }
  const lastActivityDate = extractLastActivityDate(section);
  const lastPaymentDate = extractLastPaymentDate(section);
  const paymentHistoryDetails = extractTransUnionPaymentGridRows(section).map((row) => ({
    date: row.dateLabel,
    balance: row.balance,
    payment:
      row.payment ??
      (paymentTerms && isSamePaymentAmount(row.terms, paymentTerms.amount)
        ? paymentTerms.amount
        : null),
    pastDue: row.pastDue,
    mop: row.mop,
    terms:
      paymentTerms && isSamePaymentAmount(row.terms, paymentTerms.amount)
        ? null
        : row.terms,
    highCredit: row.highCredit,
    creditLimit: row.creditLimit,
    balloonPayment: row.balloonPayment,
    chargeOff: row.chargeOff,
    narrative: row.narrative,
  }));
  const latestPaymentDetail = paymentHistoryDetails[0];
  const paymentHistory = extractTransUnionPaymentSummary(section);
  const paymentPattern =
    extractPaymentPattern(section) ||
    formatTransUnionPaymentSummary(paymentHistory) ||
    undefined;
  const monthsReviewed = extractTransUnionMonthsReviewed(section);
  const detailMop = paymentHistoryDetails.find((row) => row.mop)?.mop;

  // Validation: A tradeline must have at minimum a creditor name OR account number
  if (!accountNumber && !creditorName) {
    console.log(
      `[Tradeline Parse] ✗ Validation failed: no account number or creditor name found`,
    );
    return null;
  }

  // Additional validation: Should have at least one meaningful piece of data beyond name/account
  const hasAdditionalData =
    (balance !== null && balance > 0) ||
    accountType !== null ||
    status !== null ||
    dates.opened !== null ||
    dates.reported !== null ||
    amounts.high !== undefined ||
    paymentHistoryDetails.length > 0 ||
    paymentHistory !== null;

  if (!hasAdditionalData) {
    console.log(
      `[Tradeline Parse] ✗ Validation failed: insufficient additional data`,
    );
    return null;
  }

  // Build and return the tradeline object
  const tradeline: ParsedTradeline = normalizeTransUnionPaymentTerms({
    accountNumber: accountNumber || "Not Provided by Bureau",
    creditorName: creditorName || "Unknown",
    accountType: accountType || "Unknown",
    balance,
    status: status || "Unknown",
    dates: {
      opened: dates.opened,
      reported: dates.reported,
      closed: dates.closed,
      dofd: dates.dofd,
    },
    amounts: {
      high: amounts.high ?? latestPaymentDetail?.highCredit ?? undefined,
      pastDue: amounts.pastDue ?? latestPaymentDetail?.pastDue ?? undefined,
    },
    remarkCodes: remarkCodes,
    // Collection-account specific fields
    isCollectionAccount: isCollectionAccount,
    originalCreditorName: originalCreditorName || undefined,
    collectionAgencyName: collectionAgencyName || undefined,
    collectionAgencyMissingFromReport,
    dateAssignedToCollection: dateAssignedToCollection,
    dateAssignedToCollectionMissingFromReport,
    originalBalance: originalBalance || undefined,
    // Financial details
    interestRate: interestRate || undefined,
    terms: terms || undefined,
    monthlyPayment: monthlyPayment ?? undefined,
    scheduledMonthlyPayment,
    paymentFrequency,
    lastActivityDate: lastActivityDate,
    lastPaymentDate,
    paymentPattern,
    paymentHistoryProfile: paymentPattern ?? null,
    paymentHistory,
    monthsReviewed,
    paymentHistoryDetails: paymentHistoryDetails.length > 0 ? paymentHistoryDetails : null,
    mop: detailMop ?? undefined,
    creditLimit: latestPaymentDetail?.creditLimit ?? undefined,
    balanceMissingFromReport: balance === null,
  });

  // Store the raw source text for document highlighting
  tradeline.sourceText = section;

  return tradeline;
}

/**
 * Deduplicates tradelines that have the same creditor name.
 * This handles cases where OCR splits a tradeline across pages, creating duplicate entries.
 * 
 * When merging:
 * - Prefers non-Unknown and non-null values from either tradeline
 * - Combines source text from both sections
 * - Takes the maximum balance if both have values
 * 
 * @param tradelines Array of parsed tradelines
 * @returns Deduplicated array of tradelines
 */
function deduplicateTradelines(tradelines: ParsedTradeline[]): ParsedTradeline[] {
  if (tradelines.length === 0) {
    return tradelines;
  }

  // Group only by stable account identity. Creditor-name-only merging can
  // collapse multiple accounts from the same furnisher into a false single account.
  const tradelinesByCreditor = new Map<string, ParsedTradeline[]>();
  
  for (let index = 0; index < tradelines.length; index++) {
    const tradeline = tradelines[index];
    const normalizedCreditor = tradeline.creditorName.toLowerCase().trim();
    const normalizedAccount = normalizeAccountNumber(tradeline.accountNumber);
    const hasAccountAnchor = Boolean(normalizedAccount);
    const openedAnchor = tradeline.dates.opened instanceof Date && !Number.isNaN(tradeline.dates.opened.getTime())
      ? tradeline.dates.opened.toISOString().slice(0, 10)
      : "";
    const reportedAnchor = tradeline.dates.reported instanceof Date && !Number.isNaN(tradeline.dates.reported.getTime())
      ? tradeline.dates.reported.toISOString().slice(0, 10)
      : "";
    const identityKey = hasAccountAnchor
      ? `${normalizedCreditor}|acct:${normalizedAccount}`
      : openedAnchor
        ? `${normalizedCreditor}|opened:${openedAnchor}|type:${tradeline.accountType || ""}|reported:${reportedAnchor}`
        : `${normalizedCreditor}|source:${index}`;
    
    if (!tradelinesByCreditor.has(identityKey)) {
      tradelinesByCreditor.set(identityKey, []);
    }
    
    tradelinesByCreditor.get(identityKey)!.push(tradeline);
  }

  // Merge duplicates
  const deduplicated: ParsedTradeline[] = [];
  
  for (const [creditorName, duplicates] of tradelinesByCreditor.entries()) {
    if (duplicates.length === 1) {
      // No duplicates, keep as-is
      deduplicated.push(duplicates[0]);
    } else {
      // Merge duplicates
      console.log(
        `[Tradeline Dedup] Found ${duplicates.length} tradelines for creditor "${creditorName}" - merging...`
      );
      
      const merged = mergeTradelines(duplicates);
      deduplicated.push(merged);
      
      console.log(
        `[Tradeline Dedup] ✓ Merged ${duplicates.length} tradelines into one for "${creditorName}"`
      );
    }
  }

  return deduplicated;
}

/**
 * Merges multiple tradelines into a single tradeline.
 * Prefers non-Unknown/non-null values from any of the tradelines.
 * 
 * @param tradelines Array of tradelines to merge (all have the same creditor name)
 * @returns Single merged tradeline
 */
function mergeTradelines(tradelines: ParsedTradeline[]): ParsedTradeline {
  if (tradelines.length === 0) {
    throw new Error("Cannot merge empty tradeline array");
  }
  
  if (tradelines.length === 1) {
    return tradelines[0];
  }

  // Start with the first tradeline as base
  const merged: ParsedTradeline = { ...tradelines[0] };

  // Helper to check if a value is "meaningful" (not Unknown, not null, not empty)
  const isMeaningful = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (
      typeof value === 'string' &&
      (value === 'Unknown' || value.trim() === '' || value.trim().toLowerCase() === "not provided by bureau")
    ) return false;
    return true;
  };

  // Merge each tradeline into the base
  for (let i = 1; i < tradelines.length; i++) {
    const current = tradelines[i];

    // Merge simple fields - prefer meaningful values
    if (!isMeaningful(merged.accountNumber) && isMeaningful(current.accountNumber)) {
      merged.accountNumber = current.accountNumber;
    }
    
    if (!isMeaningful(merged.creditorName) && isMeaningful(current.creditorName)) {
      merged.creditorName = current.creditorName;
    }
    
    if (!isMeaningful(merged.accountType) && isMeaningful(current.accountType)) {
      merged.accountType = current.accountType;
    }
    
    if (!isMeaningful(merged.status) && isMeaningful(current.status)) {
      merged.status = current.status;
    }

    // For balance, take the maximum (most recent/accurate)
    if (current.balance !== null && (merged.balance === null || current.balance > merged.balance)) {
      merged.balance = current.balance;
    }

    // Merge dates - prefer non-null values
    if (!merged.dates.opened && current.dates.opened) {
      merged.dates.opened = current.dates.opened;
    }
    if (!merged.dates.reported && current.dates.reported) {
      merged.dates.reported = current.dates.reported;
    }
    if (!merged.dates.closed && current.dates.closed) {
      merged.dates.closed = current.dates.closed;
    }
    if (!merged.dates.dofd && current.dates.dofd) {
      merged.dates.dofd = current.dates.dofd;
    }

    // Merge amounts - prefer non-undefined values
    if (merged.amounts.high === undefined && current.amounts.high !== undefined) {
      merged.amounts.high = current.amounts.high;
    }
    if (merged.amounts.pastDue === undefined && current.amounts.pastDue !== undefined) {
      merged.amounts.pastDue = current.amounts.pastDue;
    }

    // Merge remark codes - combine and deduplicate
    const combinedRemarks = [...merged.remarkCodes, ...current.remarkCodes];
    merged.remarkCodes = Array.from(new Set(combinedRemarks));

    // Merge collection account fields
    if (!isMeaningful(merged.originalCreditorName) && isMeaningful(current.originalCreditorName)) {
      merged.originalCreditorName = current.originalCreditorName;
    }
    
    if (!isMeaningful(merged.collectionAgencyName) && isMeaningful(current.collectionAgencyName)) {
      merged.collectionAgencyName = current.collectionAgencyName;
    }
    
    if (!merged.dateAssignedToCollection && current.dateAssignedToCollection) {
      merged.dateAssignedToCollection = current.dateAssignedToCollection;
    }
    
    if (merged.originalBalance === undefined && current.originalBalance !== undefined) {
      merged.originalBalance = current.originalBalance;
    }

    // Merge financial details
    if (merged.interestRate === undefined && current.interestRate !== undefined) {
      merged.interestRate = current.interestRate;
    }
    
    if (!isMeaningful(merged.terms) && isMeaningful(current.terms)) {
      merged.terms = current.terms;
    }
    
    if (merged.monthlyPayment === undefined && current.monthlyPayment !== undefined) {
      merged.monthlyPayment = current.monthlyPayment;
    }

    if (merged.scheduledMonthlyPayment === undefined && current.scheduledMonthlyPayment !== undefined) {
      merged.scheduledMonthlyPayment = current.scheduledMonthlyPayment;
    }

    if (!isMeaningful(merged.paymentFrequency) && isMeaningful(current.paymentFrequency)) {
      merged.paymentFrequency = current.paymentFrequency;
    }
    
    if (!merged.lastActivityDate && current.lastActivityDate) {
      merged.lastActivityDate = current.lastActivityDate;
    }

    // Merge optional fields added in augmentation
    if (!isMeaningful(merged.responsibilityCode) && isMeaningful(current.responsibilityCode)) {
      merged.responsibilityCode = current.responsibilityCode;
    }
    
    if (!isMeaningful(merged.ecoaCode) && isMeaningful(current.ecoaCode)) {
      merged.ecoaCode = current.ecoaCode;
    }
    
    if (!merged.lastPaymentDate && current.lastPaymentDate) {
      merged.lastPaymentDate = current.lastPaymentDate;
    }
    
    if (merged.lastPaymentAmount === undefined && current.lastPaymentAmount !== undefined) {
      merged.lastPaymentAmount = current.lastPaymentAmount;
    }
    
    if (!merged.maturityDate && current.maturityDate) {
      merged.maturityDate = current.maturityDate;
    }
    
    if (!isMeaningful(merged.paymentPattern) && isMeaningful(current.paymentPattern)) {
      merged.paymentPattern = current.paymentPattern;
    }

    if (!isMeaningful(merged.paymentHistoryProfile) && isMeaningful(current.paymentHistoryProfile)) {
      merged.paymentHistoryProfile = current.paymentHistoryProfile;
    }

    if (!merged.paymentHistory && current.paymentHistory) {
      merged.paymentHistory = current.paymentHistory;
    }

    if (!isMeaningful(merged.monthsReviewed) && isMeaningful(current.monthsReviewed)) {
      merged.monthsReviewed = current.monthsReviewed;
    }

    if ((!merged.paymentHistoryDetails || merged.paymentHistoryDetails.length === 0) && current.paymentHistoryDetails?.length) {
      merged.paymentHistoryDetails = current.paymentHistoryDetails;
    }

    if (!isMeaningful(merged.mop) && isMeaningful(current.mop)) {
      merged.mop = current.mop;
    }
    
    if (merged.creditLimit === undefined && current.creditLimit !== undefined) {
      merged.creditLimit = current.creditLimit;
    }

    // Combine source text from both sections
    if (merged.sourceText && current.sourceText) {
      merged.sourceText = merged.sourceText + "\n\n" + current.sourceText;
    } else if (current.sourceText) {
      merged.sourceText = current.sourceText;
    }
  }

  return merged;
}
