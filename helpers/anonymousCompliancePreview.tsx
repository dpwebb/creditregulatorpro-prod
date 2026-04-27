import { calculateRetentionExpiry, AccountType } from "./provincialRetentionCalculator";
import type { ComprehensiveParseResult, ParsedTradeline } from "./reportParserTypes";
import type { CanadianProvince } from "./schema";
import { isBefore, differenceInMonths, isValid, parseISO } from "./dateUtils";

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

export function generateAnonymousPreview(parseResult: ComprehensiveParseResult): PreviewProblem[] {
  const problems: PreviewProblem[] = [];
  const tradelineProblemsMap = new Map<string, PreviewProblem>();

  // 1. Resolve consumer province
  let province: CanadianProvince = "ON";
  const rawProv = parseResult.consumerInfo?.province?.toUpperCase();
  const validProvinces = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
  if (rawProv && validProvinces.includes(rawProv)) {
    province = rawProv as CanadianProvince;
  }

  // Helper to add problems safely
  const addProblem = (problem: PreviewProblem) => {
    problems.push(problem);
  };

  const addTradelineProblem = (creditorName: string, problem: PreviewProblem) => {
    const existing = tradelineProblemsMap.get(creditorName);
    if (!existing || problem.severity > existing.severity) {
      tradelineProblemsMap.set(creditorName, problem);
    }
  };

  // 2. Iterate tradelines
  for (const tradeline of parseResult.tradelines) {
    const creditorName = tradeline.creditorName || "A creditor";
    const statusText = (tradeline.status || "").toLowerCase();
    const pastDue = Number(tradeline.amounts?.pastDue || 0);
    const balance = Number(tradeline.balance || 0);
    const isDerogatory = 
      pastDue > 0 || 
      ["charge", "bad debt", "derogatory", "write-off", "writeoff", "collection"].some(k => statusText.includes(k));

    // Extract Dates
    const dofd = safeParseDate(tradeline.dates?.dofd);
    const lastActivityDate = safeParseDate(tradeline.lastActivityDate);
    const lastPaymentDate = safeParseDate(tradeline.lastPaymentDate);
    const dateClosed = safeParseDate(tradeline.dates?.closed);
    const openedDate = safeParseDate(tradeline.dates?.opened);

    // a. Statute of Limitations
    const referenceDate = dofd || lastActivityDate || lastPaymentDate || dateClosed || openedDate;
    if (referenceDate) {
      const accountType = getAccountType(tradeline, statusText);
      const expiryResult = calculateRetentionExpiry(province, accountType, referenceDate);
      
      if (expiryResult) {
        if (expiryResult.isExpired) {
          addTradelineProblem(creditorName, {
            type: "sol_expired",
            title: `${creditorName} — Expired Debt`,
            detail: `${creditorName} is past the legal reporting limit for ${province}. It should not be on your report.`,
            solution: `This debt has expired under ${province} law (${expiryResult.statuteReference}). We can generate a legal removal letter demanding its deletion.`,
            urgency: "expired",
            severity: 100
          });
        } else {
          const monthsRemaining = differenceInMonths(expiryResult.expiryDate, new Date());
          if (monthsRemaining >= 0 && monthsRemaining <= 6) {
            addTradelineProblem(creditorName, {
              type: "sol_approaching",
              title: `${creditorName} — Expiring Soon`,
              detail: `${creditorName} is close to its legal reporting limit. It will expire soon.`,
              solution: `This expires in ${monthsRemaining} months. We'll track it and auto-generate removal paperwork when it's time.`,
              urgency: "approaching",
              severity: 90
            });
          }
        }
      }
    }

    // b. Missing Critical Dates
    let missingCriticalDate = false;
    if (isDerogatory && !dofd) {
      missingCriticalDate = true;
    } else if (!openedDate) {
      missingCriticalDate = true;
    } else if (!dateClosed && !lastActivityDate) {
      missingCriticalDate = true;
    }

    if (missingCriticalDate) {
      addTradelineProblem(creditorName, {
        type: "missing_dates",
        title: `${creditorName} — Missing Important Dates`,
        detail: `A critical date is missing from ${creditorName}. The credit bureau is breaking reporting rules.`,
        solution: "The bureau must report this date. We can file a compliance dispute to force correction or removal.",
        urgency: "violation",
        severity: 80
      });
    }

    // c. Date Logic Impossibilities
    let dateLogicError = false;
    if (dofd && openedDate && isBefore(dofd, openedDate)) dateLogicError = true;
    if (dateClosed && openedDate && isBefore(dateClosed, openedDate)) dateLogicError = true;
    if (lastPaymentDate && openedDate && isBefore(lastPaymentDate, openedDate)) dateLogicError = true;

    if (dateLogicError) {
      addTradelineProblem(creditorName, {
        type: "date_logic",
        title: `${creditorName} — Impossible Dates`,
        detail: `The dates on ${creditorName} do not make sense (like closing before opening). This is illegal to report.`,
        solution: "These dates are logically impossible. We can file a dispute citing inaccurate reporting.",
        urgency: "violation",
        severity: 85
      });
    }

    // d. Account Status Inconsistency
    const isPaidStatus = statusText.includes("paid") || statusText.includes("settled");
    const isWriteOffStatus = ["write-off", "writeoff", "bad debt", "charge off", "charge-off"].some(k => statusText.includes(k));

    if ((isPaidStatus && balance > 0) || (isWriteOffStatus && balance > 0)) {
      addTradelineProblem(creditorName, {
        type: "status_inconsistency",
        title: `${creditorName} — Account Status Error`,
        detail: `${creditorName} shows it was paid or written off, but still shows a balance. This lowers your score.`,
        solution: "This is a reporting error. We can file a formal correction dispute.",
        urgency: "violation",
        severity: 75
      });
    }

    // e. Collections
    if (tradeline.isCollectionAccount || statusText.includes("collection")) {
      addTradelineProblem(creditorName, {
        type: "collection_account",
        title: `${creditorName} — Collection Account Found`,
        detail: `${creditorName} is reporting this debt. They often lack the legal proof to do so.`,
        solution: "Under Canadian law, they must prove you owe this. We can challenge the debt validation.",
        urgency: "warning",
        severity: 70
      });
    }

    // f. Past Due
    if (pastDue > 0) {
      addTradelineProblem(creditorName, {
        type: "past_due",
        title: `${creditorName} — Past Due Balance`,
        detail: `${creditorName} shows a past due amount of $${pastDue}. Even small errors here hurt your credit score.`,
        solution: "If this amount is wrong, we can dispute it. Our deep scan checks 200+ rules to find errors.",
        urgency: "warning",
        severity: 60
      });
    }

    // g. Derogatory Status
    if (isDerogatory) {
      addTradelineProblem(creditorName, {
        type: "derogatory_status",
        title: `${creditorName} — Negative Mark Found`,
        detail: `${creditorName} has a negative status. This is hurting your overall credit profile.`,
        solution: "We can analyze this for hidden violations and generate dispute letters.",
        urgency: "warning",
        severity: 65
      });
    }
  }

  // 3. Dump tradeline problems to main array
  for (const problem of tradelineProblemsMap.values()) {
    problems.push(problem);
  }

  // 4. Public Records
  if (parseResult.publicRecords && parseResult.publicRecords.length > 0) {
    for (const record of parseResult.publicRecords) {
      addProblem({
        type: "public_record",
        title: "Public Record Found",
        detail: `There is a negative public record (${record.recordType}) on your file. These cause major score drops.`,
        solution: "We can review the court records and file specialized disputes for any errors found.",
        urgency: "warning",
        severity: 85
      });
    }
  }

  // 5. Sort by severity descending, keep top 5
  problems.sort((a, b) => b.severity - a.severity);
  const topProblems = problems.slice(0, 5);

  // 6. Fallback if none found
  if (topProblems.length === 0) {
    return [{
      type: "info_deep_scan",
      title: "Ready for Deep Scan",
      detail: "Your surface data looks clean, but errors are often hidden deep in the details.",
      solution: "Our deep scan checks 200+ rules to find hidden errors. We can help ensure your report is 100% accurate.",
      urgency: "info",
      severity: 10
    }];
  }

  return topProblems;
}