import type { ParsedTradeline } from "./reportParser";
import type { InfractionFinding, ReportMetadata } from "./regulationInfractionScannerTypes";
import { differenceInDays, subYears, isBefore } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";

export function detectBureauViolations(
  tl: ParsedTradeline, 
  metadata: ReportMetadata, 
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  const { dates } = tl;

  // 1. Stale Debt Reporting (Provincial CRA retention limits)
  // Consolidated — handled by detectStatuteOfLimitations in complianceDetectorTemporal

  // 2. Obsolete Information (Closed accounts)
  // If closed > 7 years ago (the maximum Canadian provincial retention period for adverse information).
  // Simplified check: If closed date is very old and still reported.
  if (dates.closed) {
    const closedDate = new Date(dates.closed);
    const sevenYearsAgo = subYears(metadata.reportDate, 7);
    if (isBefore(closedDate, sevenYearsAgo)) {
      const province = metadata.userProvince || "ON";
      const limitReg = regulationRegistry.getRegulationById(`${province}_CRA_REPORTING_LIMIT`);
      
      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "BUREAU_VIOLATION",
        violationCategory: "OBSOLETE_INFORMATION",
        severity: "MEDIUM",
        fcraSection: limitReg ? `${limitReg.statute} - ${limitReg.citation}` : "Provincial Consumer Reporting Acts",
        description: "Account reported beyond the maximum adverse information retention period (7 years in ON/QC/PE)",
        evidenceDetails: `Date Closed: ${closedDate.toISOString().split('T')[0]} exceeds retention limits`,
        suggestedDisputeVector: "TIMING_COMPLIANCE",
        autoChallengeable: true,
        regulationIds: limitReg ? [limitReg.id] : [],
      });
    }
  }

  return findings;
}