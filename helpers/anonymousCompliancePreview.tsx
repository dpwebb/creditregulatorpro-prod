import { calculateRetentionExpiry, AccountType } from "./provincialRetentionCalculator";
import type { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";
import type { CanadianProvince } from "./schema";
import { isAfter, isBefore, differenceInMonths, isValid, parseISO } from "./dateUtils";
import { formatCurrency } from "./formatters";

export type PreviewProblemUrgency = "expired" | "approaching" | "violation" | "warning" | "info";

export interface PreviewProblem {
  type: string;
  title: string;
  detail: string;
  solution: string;
  urgency: PreviewProblemUrgency;
  severity: number;
}

// Safely parse a date from various potential formats
function safeParseDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isValid(d) ? d : null;
  if (typeof d === "string") {
    const parsed = parseISO(d);
    return isValid(parsed) ? parsed : null;
  }
  return null;
}

// Determine account type for SOL calculation
function getAccountType(tradeline: ParsedTradeline, statusText: string): AccountType {
  if (tradeline.isCollectionAccount || statusText.includes("collection")) {
    return "collection";
  }
  if (statusText.includes("bankruptcy") || tradeline.accountType?.toLowerCase().includes("bankruptcy")) {
    return "bankruptcy";
  }
  if (statusText.includes("judgment") || tradeline.accountType?.toLowerCase().includes("judgment")) {
    return "judgment";
  }
  if (statusText.includes("proposal") || tradeline.accountType?.toLowerCase().includes("proposal")) {
    return "consumer_proposal";
  }
  return "regular";
}

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function formatEvidenceDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sortProblemsBySeverity(problems: PreviewProblem[]): PreviewProblem[] {
  return [...problems].sort((a, b) => b.severity - a.severity);
}

export function generateAnonymousPreview(parseResult: ComprehensiveParseResult): PreviewProblem[] {
  const verifiedProblems: PreviewProblem[] = [];
  const supportingProblems: PreviewProblem[] = [];
  const asOfDate = safeParseDate(parseResult.reportMetadata?.reportDate) || new Date();

  // 1. Resolve consumer province
  let province: CanadianProvince = "ON";
  const rawProv = parseResult.consumerInfo?.province?.toUpperCase();
  const validProvinces = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
  if (rawProv && validProvinces.includes(rawProv)) {
    province = rawProv as CanadianProvince;
  }

  // 2. Iterate tradelines
  for (const tradeline of parseResult.tradelines) {
    const tradelineVerifiedProblems: PreviewProblem[] = [];
    const tradelineSupportingProblems: PreviewProblem[] = [];
    const creditorName = tradeline.creditorName || "A creditor";
    const statusText = (tradeline.status || "").toLowerCase();
    const statusTokens = statusText.split(/[^a-z0-9]+/).filter(Boolean);
    const hasStatusCode = (code: string) => statusTokens.includes(code);
    const pastDue = Number(tradeline.amounts?.pastDue || 0);
    const balance = Number(tradeline.balance || 0);
    const isClosedOrTerminal = includesAny(statusText, [
      "account closed",
      "closed",
      "cancelled",
      "canceled",
      "charge",
      "bad debt",
      "write-off",
      "writeoff",
      "collection",
    ]) || hasStatusCode("cg") || hasStatusCode("tc") || hasStatusCode("ac");
    const isDerogatory = 
      pastDue > 0 || 
      [
        "charge",
        "bad debt",
        "derogatory",
        "write-off",
        "writeoff",
        "collection",
        "cancelled by credit grantor",
        "cg",
        "tc",
      ].some(k => statusText.includes(k));

    // Extract Dates
    const dofd = safeParseDate(tradeline.dates?.dofd);
    const lastActivityDate = safeParseDate(tradeline.lastActivityDate);
    const lastPaymentDate = safeParseDate(tradeline.lastPaymentDate);
    const dateClosed = safeParseDate(tradeline.dates?.closed);
    const openedDate = safeParseDate(tradeline.dates?.opened);

    // a. Statute of Limitations
    const referenceDate = dofd || lastActivityDate || lastPaymentDate || dateClosed;
    const isRetentionBoundAccount =
      isClosedOrTerminal ||
      isDerogatory ||
      pastDue > 0 ||
      balance > 0 ||
      tradeline.isCollectionAccount === true;

    if (referenceDate && isRetentionBoundAccount) {
      const accountType = getAccountType(tradeline, statusText);
      const expiryResult = calculateRetentionExpiry(province, accountType, referenceDate);
      
      if (expiryResult) {
        const isExpiredAsOfReport = isAfter(asOfDate, expiryResult.expiryDate);

        if (isExpiredAsOfReport) {
          tradelineVerifiedProblems.push({
            type: "sol_expired",
            title: `${creditorName} - Possible Expired Reporting Item`,
            detail: `${creditorName} appears past the reporting-limit window for ${province}. Evidence: reference date ${formatEvidenceDate(referenceDate)} and expiry date ${formatEvidenceDate(expiryResult.expiryDate)}.`,
            solution: `The dates suggest this item may be unsupported under ${province} law (${expiryResult.statuteReference}). We can draft a review letter asking for verification, correction, or removal if the reporting cannot be supported.`,
            urgency: "expired",
            severity: 100
          });
        } else {
          const monthsRemaining = differenceInMonths(expiryResult.expiryDate, asOfDate);
          if (monthsRemaining >= 0 && monthsRemaining <= 6) {
            tradelineSupportingProblems.push({
              type: "sol_approaching",
              title: `${creditorName} — Expiring Soon`,
              detail: `${creditorName} is close to the reporting-limit window. Evidence: reference date ${formatEvidenceDate(referenceDate)} and expiry date ${formatEvidenceDate(expiryResult.expiryDate)}.`,
              solution: `This appears to reach the reporting-limit window in ${monthsRemaining} months. We can track the date and prepare review paperwork when action is appropriate.`,
              urgency: "approaching",
              severity: 90
            });
          }
        }
      }
    }

    // b. Missing Critical Dates
    let missingCriticalDate = false;
    if (isRetentionBoundAccount && !referenceDate) {
      missingCriticalDate = true;
    }

    if (missingCriticalDate) {
      tradelineSupportingProblems.push({
        type: "missing_dates",
        title: `${creditorName} — Unable to Verify Key Dates`,
        detail: `${creditorName} has negative reporting indicators, but the parser could not extract the date needed to verify reporting-limit rules.`,
        solution: "We can review the source report and use a compliance dispute if the bureau cannot support the reporting date.",
        urgency: "warning",
        severity: 55
      });
    }

    // c. Date Logic Impossibilities
    let dateLogicError = false;
    if (dofd && openedDate && isBefore(dofd, openedDate)) dateLogicError = true;
    if (dateClosed && openedDate && isBefore(dateClosed, openedDate)) dateLogicError = true;
    if (lastPaymentDate && openedDate && isBefore(lastPaymentDate, openedDate)) dateLogicError = true;

    if (dateLogicError) {
      tradelineVerifiedProblems.push({
        type: "date_logic",
        title: `${creditorName} — Impossible Dates`,
        detail: `The dates on ${creditorName} do not make sense, such as closing before opening. This is an accuracy finding that should be reviewed against the source report.`,
        solution: "These dates appear logically inconsistent. We can draft a dispute asking the bureau or furnisher to verify and correct the reporting.",
        urgency: "violation",
        severity: 85
      });
    }

    // d. Account Status Inconsistency
    const isPaidStatus = statusText.includes("paid") || statusText.includes("settled");
    const isWriteOffStatus = ["write-off", "writeoff", "bad debt", "charge off", "charge-off"].some(k => statusText.includes(k));

    if ((isPaidStatus && balance > 0) || (isWriteOffStatus && balance > 0)) {
      tradelineVerifiedProblems.push({
        type: "status_inconsistency",
        title: `${creditorName} — Account Status Error`,
        detail: `${creditorName} shows it was paid or written off, but still shows a balance. This lowers your score.`,
        solution: "This appears inconsistent. We can draft a formal correction dispute and ask for supporting records.",
        urgency: "violation",
        severity: 75
      });
    }

    // e. Collections
    if (tradeline.isCollectionAccount || statusText.includes("collection")) {
      tradelineSupportingProblems.push({
        type: "collection_account",
        title: `${creditorName} — Collection Account Found`,
        detail: `${creditorName} is reporting this debt. Collection accounts often need supporting records to confirm ownership, balance, and reporting authority.`,
        solution: "We can draft a validation request asking for the records that support the collection reporting.",
        urgency: "warning",
        severity: 70
      });
    }

    // f. Past Due
    if (pastDue > 0) {
      tradelineSupportingProblems.push({
        type: "past_due",
        title: `${creditorName} — Past Due Balance`,
        detail: `${creditorName} shows a past due amount of ${formatCurrency(pastDue)}. Even small errors here hurt your credit score.`,
        solution: "If this amount is wrong, we can dispute it. The full scan checks authority-backed finding categories and runtime rules for accuracy issues.",
        urgency: "warning",
        severity: 60
      });
    }

    // g. Derogatory Status
    if (isDerogatory) {
      tradelineSupportingProblems.push({
        type: "derogatory_status",
        title: `${creditorName} — Negative Mark Found`,
        detail: `${creditorName} has a negative status. This is hurting your overall credit profile.`,
        solution: "We can analyze this for evidence-backed compliance findings and generate draft dispute letters for your review.",
        urgency: "warning",
        severity: 65
      });
    }

    if (tradelineVerifiedProblems.length > 0) {
      verifiedProblems.push(...tradelineVerifiedProblems);
    } else if (tradelineSupportingProblems.length > 0) {
      supportingProblems.push(sortProblemsBySeverity(tradelineSupportingProblems)[0]);
    }
  }

  // 4. Public Records
  if (parseResult.publicRecords && parseResult.publicRecords.length > 0) {
    for (const record of parseResult.publicRecords) {
      verifiedProblems.push({
        type: "public_record",
        title: "Public Record Found",
        detail: `There is a negative public record (${record.recordType}) on your file. These cause major score drops.`,
        solution: "We can review the court records and file specialized disputes for any errors found.",
        urgency: "warning",
        severity: 85
      });
    }
  }

  // 5. Always show every priority finding. Softer signals can fill remaining preview space.
  const sortedVerifiedProblems = sortProblemsBySeverity(verifiedProblems);
  const supportingSlots = Math.max(0, 5 - sortedVerifiedProblems.length);
  const previewProblems = [
    ...sortedVerifiedProblems,
    ...sortProblemsBySeverity(supportingProblems).slice(0, supportingSlots),
  ];

  // 6. Fallback if none found
  if (previewProblems.length === 0) {
    return [{
      type: "info_deep_scan",
      title: "Ready for Deep Scan",
      detail: "The preview did not find high-priority signals in the extracted surface data, but a full account scan may still identify evidence-backed compliance findings.",
      solution: "The full scan checks authority-backed finding categories and supporting runtime rules to help you review accuracy. It does not guarantee a perfect report or a specific legal outcome.",
      urgency: "info",
      severity: 10
    }];
  }

  return previewProblems;
}
