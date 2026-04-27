import type { TradelineDetails, ViolationDetails } from "./equifaxDisputeTemplate";
import { checkDofdSolObstruction } from "./equifaxDisputeTemplate";
import { resolveTemplateOverrides } from "./letterTemplateQueries";
import { formatDate, formatCurrency } from "./disputeNarrativeUtils";

export async function getDisputeLetterFraming(
  violationCategory?: string | null,
  bureauName?: string,
  violationDetails?: ViolationDetails,
  tradelineDetails?: TradelineDetails
): Promise<{ subject: string; introduction: string }> {
  let framing: { subject: string; introduction: string };

  // DOFD-SOL obstruction — check before generic DOCUMENTATION_CHAIN_FAILURE handling
  if (checkDofdSolObstruction(violationCategory, violationDetails, tradelineDetails)) {
    framing = {
      subject: "Re: Request for Mandatory Disclosure — Date of First Delinquency",
      introduction: "I'm writing about an account in my credit file that appears to have incomplete information. The details of my concern are explained below.",
    };
  } else if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE" && (violationDetails?.matchReason || violationDetails?.originalCreditorName)) {
    framing = {
      subject: "Re: Demand for Original Creditor Disclosure — Fraudulent Chain of Title",
      introduction: "I'm writing to dispute the accuracy of an account listed in my credit file. My specific concern is detailed below."
    };
  } else if (violationCategory === "MULTIPLE_COLLECTOR_VIOLATION" || violationCategory === "COLLECTOR_DUPLICATE_REPORTING") {
    framing = {
      subject: "Re: Duplicate Account — Multiple Collectors Reporting Same Debt",
      introduction: "I'm writing to dispute information in my credit file that appears to be reported more than once. The details are below."
    };
  } else if (violationCategory && [
    "STATUTE_OF_LIMITATIONS",
    "TIME_BARRED_DEBT_COLLECTION",
    "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
  ].includes(violationCategory)) {
    framing = {
      subject: "Re: Request for Removal of Obsolete Information",
      introduction: "I'm writing to request the removal of outdated information from my credit file. The specific account and the basis for my request are detailed below."
    };
  } else if (violationCategory === "BANKRUPTCY_DISCHARGE_VIOLATION") {
    framing = {
      subject: "Re: Request for Correction of Discharged Account",
      introduction: "I am writing regarding an account in my credit file that was included in a bankruptcy discharge but continues to be reported inaccurately."
    };
  } else if (violationCategory === "IDENTITY_THEFT_VIOLATION") {
    framing = {
      subject: "Re: Fraudulent Account – Identity Theft Report",
      introduction: "I am writing to report that the following account in my credit file is the result of identity theft and was not opened or authorized by me."
    };
  } else if (violationCategory === "MIXED_FILE_PERSONAL_INFO_MISMATCH") {
    framing = {
      subject: "Re: Mixed Credit File — Personal Information Mismatch",
      introduction: "I'm writing because I suspect my credit file has been mixed with another consumer's information. The details are below."
    };
  } else if (violationCategory === "COLLECTION_LIMITATION_EXCEEDED") {
    framing = {
      subject: "Re: Request for Removal — Collection Past Legal Time Limit",
      introduction: "I'm writing to request the removal of a collection account from my credit file. The details are below."
    };
  } else if (violationCategory === "CONSENT_WITHDRAWAL_NOT_HONORED") {
    framing = {
      subject: "Re: Unauthorized Continued Reporting After Consent Withdrawal",
      introduction: "I'm writing regarding an account that continues to be reported on my credit file inappropriately. The details are below."
    };
  } else if (violationCategory === "FREEZE_PERIOD_VIOLATION") {
    framing = {
      subject: "Re: Unauthorized Activity During Security Freeze",
      introduction: "I'm writing to report unauthorized activity on my credit file. The details are below."
    };
  } else if (violationCategory && [
    "DOCUMENTATION_CHAIN_FAILURE",
    "METRO2_FIELD_VIOLATION",
    "DOFD_REPORTING"
  ].includes(violationCategory)) {
        framing = {
      subject: "Re: Credit File Dispute – Incomplete Reporting",
      introduction: "I'm writing because I found incomplete information in my credit file. The details are below."
    };
  } else {
    const bureauStr = bureauName ? `${bureauName} ` : "";
    framing = {
      subject: "Re: Credit File Dispute – Accuracy and Completeness",
      introduction: `I'm writing to dispute the accuracy of information in my ${bureauStr}credit report. The specific concern is described below.`
    };
  }

  // Apply DB overrides for the violation category framing if present
  if (violationCategory) {
    const templateKey = violationCategory.toLowerCase();
    try {
      const overrides = await resolveTemplateOverrides("violation_narrative", templateKey);
      if (overrides) {
        if (overrides.subject) {
          console.log(`Applying DB subject override for violation_narrative key "${templateKey}"`);
          framing.subject = overrides.subject;
        }
        if (overrides.introduction) {
          console.log(`Applying DB introduction override for violation_narrative key "${templateKey}"`);
          framing.introduction = overrides.introduction;
        }
      }
    } catch (err) {
      console.error(`Failed to resolve framing override for key "${templateKey}":`, err);
    }
  }

  return framing;
}

export function buildViolationAwareAccountId(
  creditorName: string,
  accountNumber: string,
  violationCategory?: string | null,
  tradelineDetails?: TradelineDetails,
  furnisherLabel: string = "Creditor/Furnisher",
  violationDetails?: ViolationDetails
): string {
  const displayCreditor = (creditorName || "").trim() || "Not identified in consumer disclosure";
  const displayAccount = (accountNumber || "").trim() || "Not provided in consumer disclosure";

  const lines: string[] = [
    `${furnisherLabel}: ${displayCreditor}`,
    `Account Number: ${displayAccount}`,
  ];

  if (!tradelineDetails) return lines.join("\n");

  const isStatuteOfLimitations = violationCategory && [
    "STATUTE_OF_LIMITATIONS",
    "TIME_BARRED_DEBT_COLLECTION",
    "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
  ].includes(violationCategory);

  const isFinancial = violationCategory && [
    "BALANCE_CALCULATION_VIOLATION",
    "CREDIT_LIMIT_MANIPULATION",
    "INCORRECT_BALANCE",
  ].includes(violationCategory);

  const isStatus = violationCategory && [
    "ACCOUNT_STATUS_INCONSISTENCY",
    "FURNISHER_STATUS_CODE_MISMATCH",
    "INCORRECT_PAYMENT_STATUS",
  ].includes(violationCategory);

  const isDocumentation = violationCategory && [
    "DOCUMENTATION_CHAIN_FAILURE",
    "METRO2_FIELD_VIOLATION",
    "DOFD_REPORTING",
  ].includes(violationCategory);

  const isDuplicateCollector = violationCategory === "MULTIPLE_COLLECTOR_VIOLATION" || violationCategory === "COLLECTOR_DUPLICATE_REPORTING";

  if (isDuplicateCollector) {
    if (tradelineDetails.accountType) lines.push(`Account Type: ${tradelineDetails.accountType}`);
    if (tradelineDetails.status) lines.push(`Reported Status: ${tradelineDetails.status}`);
    
    const currentCollector = tradelineDetails.collectionAgencyName || creditorName;
    lines.push(`Primary Collector: ${currentCollector}`);
    if (tradelineDetails.balance) lines.push(`Primary Balance: ${formatCurrency(tradelineDetails.balance)}`);
    
    if (violationDetails?.otherAgencyName || violationDetails?.duplicateCreditorName) {
      lines.push(`Duplicate Collector: ${violationDetails.otherAgencyName || violationDetails.duplicateCreditorName}`);
    }
    if (violationDetails?.otherBalance) {
      lines.push(`Duplicate Balance: ${formatCurrency(violationDetails.otherBalance)}`);
    }
    if (violationDetails?.duplicateAccountNumber) {
      lines.push(`Duplicate Account Number: ${violationDetails.duplicateAccountNumber}`);
    }
    if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
    if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
  } else if (isStatuteOfLimitations) {
    if (tradelineDetails.openedDate) lines.push(`Date Opened: ${formatDate(tradelineDetails.openedDate)}`);
    if (tradelineDetails.dateClosed) lines.push(`Date Closed: ${formatDate(tradelineDetails.dateClosed)}`);
    if (tradelineDetails.dateOfFirstDelinquency) lines.push(`Date of First Delinquency: ${formatDate(tradelineDetails.dateOfFirstDelinquency)}`);
    lines.push(`Date of Last Payment: ${tradelineDetails.dateOfLastPayment ? formatDate(tradelineDetails.dateOfLastPayment) : "Not reported"}`);
    lines.push(`Last Activity Date: ${tradelineDetails.lastActivityDate ? formatDate(tradelineDetails.lastActivityDate) : "Not reported"}`);
  } else if (isFinancial) {
    if (tradelineDetails.accountType) lines.push(`Account Type: ${tradelineDetails.accountType}`);
    if (tradelineDetails.balance) lines.push(`Reported Balance: ${formatCurrency(tradelineDetails.balance)}`);
    if (tradelineDetails.currentBalance) lines.push(`Current Balance: ${formatCurrency(tradelineDetails.currentBalance)}`);
    if (tradelineDetails.creditLimit) lines.push(`Credit Limit: ${formatCurrency(tradelineDetails.creditLimit)}`);
    if (tradelineDetails.highCredit) lines.push(`High Credit: ${formatCurrency(tradelineDetails.highCredit)}`);
    if (tradelineDetails.amountPastDue) lines.push(`Amount Past Due: ${formatCurrency(tradelineDetails.amountPastDue)}`);
    if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
    if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
  } else if (isStatus) {
    if (tradelineDetails.accountType) lines.push(`Account Type: ${tradelineDetails.accountType}`);
    if (tradelineDetails.status) lines.push(`Reported Status: ${tradelineDetails.status}`);
    if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
    if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
  } else if (isDocumentation) {
    // DOFD-SOL obstruction: show status + explicit NOT DISCLOSED + available dates for contrast
    if (checkDofdSolObstruction(violationCategory, violationDetails, tradelineDetails)) {
      if (tradelineDetails.status) lines.push(`Reported Status: ${tradelineDetails.status}`);
      lines.push(`Date of First Delinquency: NOT DISCLOSED`);
      // Show available dates to contrast what is present vs what is missing
      if (tradelineDetails.openedDate) lines.push(`Date Opened: ${formatDate(tradelineDetails.openedDate)}`);
      if (tradelineDetails.dateClosed) lines.push(`Date Closed: ${formatDate(tradelineDetails.dateClosed)}`);
      if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
      if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
    } else if (violationCategory === "DOCUMENTATION_CHAIN_FAILURE" && (violationDetails?.originalCreditorName || violationDetails?.matchReason)) {
      if (violationDetails?.originalCreditorName) lines.push(`Listed Original Creditor: ${violationDetails.originalCreditorName}`);
      if (tradelineDetails.collectionAgencyName) lines.push(`Collection Agency: ${tradelineDetails.collectionAgencyName}`);
      if (tradelineDetails.status) lines.push(`Reported Status: ${tradelineDetails.status}`);
      if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
      if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
    } else {
      if (tradelineDetails.status) lines.push(`Reported Status: ${tradelineDetails.status}`);
      if (tradelineDetails.dateOfFirstDelinquency) {
        lines.push(`Date of First Delinquency: ${formatDate(tradelineDetails.dateOfFirstDelinquency)}`);
      }
      if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
      if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
    }
  } else {
    // Default: Include all available tradeline fields
    if (tradelineDetails.accountType) lines.push(`Account Type: ${tradelineDetails.accountType}`);
    if (tradelineDetails.status) lines.push(`Reported Status: ${tradelineDetails.status}`);
    if (tradelineDetails.openedDate) lines.push(`Date Opened: ${formatDate(tradelineDetails.openedDate)}`);
    if (tradelineDetails.dateClosed) lines.push(`Date Closed: ${formatDate(tradelineDetails.dateClosed)}`);
    if (tradelineDetails.lastActivityDate) lines.push(`Last Activity Date: ${formatDate(tradelineDetails.lastActivityDate)}`);
    if (tradelineDetails.dateOfLastPayment) lines.push(`Date of Last Payment: ${formatDate(tradelineDetails.dateOfLastPayment)}`);
    if (tradelineDetails.dateOfFirstDelinquency) lines.push(`Date of First Delinquency: ${formatDate(tradelineDetails.dateOfFirstDelinquency)}`);
    if (tradelineDetails.balance) lines.push(`Reported Balance: ${formatCurrency(tradelineDetails.balance)}`);
    if (tradelineDetails.currentBalance) lines.push(`Current Balance: ${formatCurrency(tradelineDetails.currentBalance)}`);
    if (tradelineDetails.creditLimit) lines.push(`Credit Limit: ${formatCurrency(tradelineDetails.creditLimit)}`);
    if (tradelineDetails.highCredit) lines.push(`High Credit: ${formatCurrency(tradelineDetails.highCredit)}`);
    if (tradelineDetails.amountPastDue) lines.push(`Amount Past Due: ${formatCurrency(tradelineDetails.amountPastDue)}`);
    if (tradelineDetails.terms) lines.push(`Terms: ${tradelineDetails.terms}`);
    if (tradelineDetails.ecoaCode) lines.push(`ECOA Code: ${tradelineDetails.ecoaCode}`);
    if (tradelineDetails.responsibilityCode) lines.push(`Responsibility: ${tradelineDetails.responsibilityCode}`);
    if (tradelineDetails.isCollectionAccount) {
      lines.push(`Collection Account: Yes`);
      if (tradelineDetails.collectionAgencyName) {
        lines.push(`Collection Agency: ${tradelineDetails.collectionAgencyName}`);
      }
    }
  }

  return lines.join("\n");
}

export function deduplicateLetterSections(introduction: string, disputedItems: string): string {
  if (!introduction || !disputedItems) return introduction;

  const extractSentences = (text: string) => {
    const matches = text.match(/[^.!?]+[.!?]*/g);
    return matches ? matches.map(s => s.trim()).filter(s => s.length > 0) : [text.trim()];
  };

  const introSentences = extractSentences(introduction);
  const disputedSentences = extractSentences(disputedItems);

  const getWords = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);

  const disputedWordsSets = disputedSentences.map(s => new Set(getWords(s)));

  const cleanedIntro = introSentences.filter(introSentence => {
    const introWords = getWords(introSentence);
    if (introWords.length === 0) return true;

    for (const dWords of disputedWordsSets) {
      if (dWords.size === 0) continue;

      let overlapCount = 0;
      for (const w of introWords) {
        if (dWords.has(w)) overlapCount++;
      }

      if (overlapCount / introWords.length > 0.6) {
        return false;
      }
    }

    return true;
  });

  return cleanedIntro.join(' ') || introduction;
}