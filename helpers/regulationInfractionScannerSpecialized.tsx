import type { ParsedTradeline } from "./reportParser";
import type { InfractionFinding, ReportMetadata } from "./regulationInfractionScannerTypes";
import { isMedicalAccount, isStudentLoanAccount } from "./regulationInfractionScannerHelpers";
import { differenceInDays, subYears, isBefore } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";
import { formatCurrency } from "./formatters";

/**
 * Detect medical debt specific violations
 */
export function detectMedicalDebtViolations(
  tl: ParsedTradeline,
  metadata: ReportMetadata,
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  
  if (!isMedicalAccount(tl)) {
    return findings;
  }

  const { dates, status } = tl;
  const isCollection = (status || "").toLowerCase().includes("collection");

  // 1. Medical Debt Premature Reporting (180-day rule)
  if (isCollection && dates.dofd) {
    const dofd = new Date(dates.dofd);
    const daysSinceDelinquency = differenceInDays(metadata.reportDate, dofd);
    
    if (daysSinceDelinquency < 180) {
      const pipeda46 = regulationRegistry.getRegulationById("PIPEDA_4_6");

      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "COLLECTOR_VIOLATION",
        violationCategory: "MEDICAL_PREMATURE_REPORTING",
        severity: "HIGH",
        fcraSection: pipeda46 ? `Medical Debt Reporting Guidelines - 180-Day Rule / ${pipeda46.statute} ${pipeda46.citation}` : "Medical Debt Reporting Guidelines - 180-Day Rule / PIPEDA",
        description: "Medical collection reported before 180-day waiting period",
        evidenceDetails: `DOFD: ${dofd.toISOString().split('T')[0]} is only ${daysSinceDelinquency} days old (requires 180 days)`,
        suggestedDisputeVector: "TIMING_COMPLIANCE",
        autoChallengeable: true,
        regulationIds: pipeda46 ? [pipeda46.id] : [],
      });
    }
  }

    // 2. Medical Debt Insurance Verification
  // Only flag when there are indicators that insurance may be involved but wasn't verified,
  // rather than blanket-flagging every medical collection.
  // Indicators: remarks mentioning insurance/coverage/copay/deductible, or small balances
  // that suggest a copay/deductible amount that insurance should have resolved.
  if (isCollection) {
    const remarksText = (tl.remarkCodes || []).join(" ").toLowerCase();
    const hasInsuranceIndicator = /insurance|coverage|copay|co-pay|deductible|hmo|ppo|ohip|provincial\s*health/.test(remarksText);
    const balance = tl.balance ?? tl.amounts?.high ?? 0;
    const isSmallBalanceMedical = balance > 0 && balance <= 500; // likely copay/deductible
    
    if (hasInsuranceIndicator || isSmallBalanceMedical) {
      const reason = hasInsuranceIndicator
        ? `Remarks reference insurance-related terms: "${remarksText.substring(0, 120)}"`
        : `Small medical collection balance (${formatCurrency(balance)}) suggests possible insurance copay/deductible`;
      const pipeda46 = regulationRegistry.getRegulationById("PIPEDA_4_6");

      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "COLLECTOR_VIOLATION",
        violationCategory: "MEDICAL_INSURANCE_VERIFICATION",
        severity: "MEDIUM",
        fcraSection: pipeda46 ? `Medical Collections - Insurance Verification Requirement / ${pipeda46.statute} ${pipeda46.citation}` : "Medical Collections - Insurance Verification Requirement / PIPEDA",
        description: "Medical debt reported without insurance verification documentation",
        evidenceDetails: reason,
        suggestedDisputeVector: "VERIFICATION_METHOD",
        autoChallengeable: true,
        regulationIds: pipeda46 ? [pipeda46.id] : [],
      });
    }
  }

  return findings;
}

/**
 * Detect student loan specific violations
 */
export function detectStudentLoanViolations(
  tl: ParsedTradeline,
  metadata: ReportMetadata,
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  
  if (!isStudentLoanAccount(tl)) {
    return findings;
  }

  const { dates, status } = tl;
  const isNegative = (status || "").toLowerCase().includes("default") || 
                     (status || "").toLowerCase().includes("collection") ||
                     (status || "").toLowerCase().includes("delinquent");

  // 1. NSLSC Early Default Reporting (270-day rule)
  if (isNegative && dates.dofd) {
    const dofd = new Date(dates.dofd);
    const daysSinceDelinquency = differenceInDays(metadata.reportDate, dofd);
    
    if (daysSinceDelinquency < 270) {
      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "CREDITOR_VIOLATION",
        violationCategory: "STUDENT_LOAN_PREMATURE_DEFAULT",
        severity: "HIGH",
        fcraSection: "NSLSC - 270-Day Default Reporting Rule",
        description: "Student loan reported as default before 270-day period",
        evidenceDetails: `DOFD: ${dofd.toISOString().split('T')[0]} is only ${daysSinceDelinquency} days old (requires 270 days for default)`,
        suggestedDisputeVector: "TIMING_COMPLIANCE",
        autoChallengeable: true,
        regulationIds: [],
      });
    }
  }

  // 2. Student Loan 6-Year Reporting Limit
  if (isNegative && dates.dofd) {
    const dofd = new Date(dates.dofd);
    const sixYearsAgo = subYears(metadata.reportDate, 6);
    
    if (isBefore(dofd, sixYearsAgo)) {
      const daysSinceDofd = differenceInDays(metadata.reportDate, dofd);
      const province = metadata.userProvince || "ON";
      const limitReg = regulationRegistry.getRegulationById(`${province}_CRA_REPORTING_LIMIT`);

      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "BUREAU_VIOLATION",
        violationCategory: "STUDENT_LOAN_STALE_REPORTING",
        severity: "HIGH",
        fcraSection: limitReg ? `Student Loan Reporting Limitation - 6 Years / ${limitReg.statute} ${limitReg.citation}` : "Student Loan Reporting Limitation - 6 Years",
        description: "Student loan negative information reported beyond 6-year limit",
        evidenceDetails: `DOFD: ${dofd.toISOString().split('T')[0]} is ${daysSinceDofd} days old (exceeds 6-year/2190-day limit)`,
        suggestedDisputeVector: "AUTHORITY_TO_REPORT",
        autoChallengeable: true,
        regulationIds: limitReg ? [limitReg.id] : [],
      });
    }
  }

  return findings;
}
