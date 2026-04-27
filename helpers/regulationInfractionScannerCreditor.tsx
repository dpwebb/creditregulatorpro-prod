import type { ParsedTradeline } from "./reportParser";
import type { InfractionFinding, ReportMetadata } from "./regulationInfractionScannerTypes";
import { differenceInDays } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";

export function detectCreditorViolations(
  tl: ParsedTradeline & { isCollectionAccount?: boolean }, 
  metadata: ReportMetadata,
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  const { amounts, dates, balance } = tl;

  const statusUpper = (tl.status || "").toUpperCase();
  const mopUpper = ((tl as any).mopCode || (tl as any).paymentRating || "").toString().toUpperCase();
  const isCollectionOrChargeOff =
    tl.isCollectionAccount ||
    statusUpper.includes("COLLECTION") ||
    statusUpper.includes("CHARGE") ||
    statusUpper.includes("WRIT") ||
    statusUpper.includes("BAD DEBT") ||
    mopUpper.includes("9") ||
    mopUpper.includes("COLLECTION");

  // 1. Missing DOFD on Delinquent Account (Provincial CRA accuracy requirements)
  // Consolidated — handled by detectMetro2FieldViolations check #2 in complianceDetectorMetro2

  // 2. Inaccurate Balance Reporting (PIPEDA / Provincial CRA — Balance accuracy requirement)
  // Past due cannot be greater than total balance (usually)
  // Exclude collection, charge-off, and MOP 9 accounts where pastDue > balance is expected
  if (amounts.pastDue && amounts.pastDue > balance && balance > 0 && !isCollectionOrChargeOff) {
    const province = metadata.userProvince || "ON";
    const accuracyReg = regulationRegistry.getRegulationById(`${province}_CRA_ACCURACY`);
    const pipeda46 = regulationRegistry.getRegulationById("PIPEDA_4_6");
    
    findings.push({
      tradelineId,
      creditorId,
      accountNumber: tl.accountNumber,
      creditorName: tl.creditorName,
      infractionType: "CREDITOR_VIOLATION",
      violationCategory: "INACCURATE_BALANCE",
      severity: "HIGH",
      fcraSection: pipeda46 && accuracyReg ? `${pipeda46.statute} ${pipeda46.citation} / ${accuracyReg.statute} ${accuracyReg.citation}` : "PIPEDA / Provincial CRA — Balance accuracy requirement",
      description: "Reported past due amount exceeds current total balance",
      evidenceDetails: `Past Due ($${amounts.pastDue}) > Current Balance ($${balance})`,
      suggestedDisputeVector: "ACCURACY_ATTESTATION",
      autoChallengeable: true,
      regulationIds: [pipeda46?.id, accuracyReg?.id].filter(Boolean) as string[],
    });
  }

    // 3. Failure to Update (Provincial CRA — Data freshness reporting standard)
  // Active account not updated in > 90 days
  // Exclude inactive/terminal accounts that won't receive regular updates
  const statusForFreshnessCheck = (tl.status || "").toUpperCase();
  const mopForFreshnessCheck = ((tl as any).mopCode || (tl as any).paymentRating || "").toString().toUpperCase();
  const isInactiveAccount =
    statusForFreshnessCheck.includes("CLOSED") ||
    statusForFreshnessCheck.includes("PAID") ||
    statusForFreshnessCheck.includes("SETTLED") ||
    statusForFreshnessCheck.includes("COLLECTION") ||
    statusForFreshnessCheck.includes("CHARGE") ||
    statusForFreshnessCheck.includes("WRIT") ||
    statusForFreshnessCheck.includes("TRANSFER") ||
    statusForFreshnessCheck.includes("BAD DEBT") ||
    statusForFreshnessCheck.includes("DISCHARGED") ||
    statusForFreshnessCheck.includes("INCLUDED IN BANKRUPTCY") ||
    tl.isCollectionAccount ||
    mopForFreshnessCheck.includes("9") ||
    mopForFreshnessCheck.includes("COLLECTION");
  if (dates.reported && !isInactiveAccount) {
    const reportedDate = new Date(dates.reported);
    const daysSinceReport = differenceInDays(metadata.reportDate, reportedDate);
    
    if (daysSinceReport > 90) {
      const province = metadata.userProvince || "ON";
      const accuracyReg = regulationRegistry.getRegulationById(`${province}_CRA_ACCURACY`);

      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "CREDITOR_VIOLATION",
        violationCategory: "FAILURE_TO_UPDATE",
        severity: "MEDIUM",
        fcraSection: accuracyReg ? `${accuracyReg.statute} ${accuracyReg.citation}` : "Provincial CRA — Data freshness reporting standard",
        description: "Active account data is stale (not updated in > 90 days)",
        evidenceDetails: `Last Reported: ${reportedDate.toISOString().split('T')[0]} (${daysSinceReport} days ago)`,
        suggestedDisputeVector: "ACCURACY_ATTESTATION",
        autoChallengeable: true,
        regulationIds: accuracyReg ? [accuracyReg.id] : [],
      });
    }
  }

    // 4. Incomplete Account Data (Metro2 §4.2) — REMOVED
  // Canadian bureau consumer disclosures (TransUnion, Equifax) always mask/redact account numbers.
  // Flagging empty account numbers as a violation was always a false positive on a Canada-only platform.

  return findings;
}