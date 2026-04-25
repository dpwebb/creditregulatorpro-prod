import type { ParsedTradeline } from "./reportParser";
import type { InfractionFinding, ReportMetadata } from "./regulationInfractionScannerTypes";
import { PROVINCIAL_LIMITATION_PERIODS } from "./regulationInfractionScannerTypes";
import { isCollectionAccount } from "./regulationInfractionScannerHelpers";
import { differenceInDays, subYears, isBefore, addYears } from "./dateUtils";
import { regulationRegistry } from "./regulationRegistry";

/**
 * Detect Canadian debt collector validation violations
 */
export function detectCollectorValidationViolations(
  tl: ParsedTradeline,
  metadata: ReportMetadata,
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  
  if (!isCollectionAccount(tl)) {
    return findings;
  }

  const { dates } = tl;

    // 1. Missing Original Creditor Information
  // Collection accounts must identify the original creditor
  const hasOriginalCreditorField = !!(tl as any).originalCreditorName && (tl as any).originalCreditorName.trim().length > 0;
  const hasOriginalCreditorInRemarks = tl.remarkCodes?.join(" ")?.toLowerCase().includes("original creditor");
  if (!hasOriginalCreditorField && !hasOriginalCreditorInRemarks) {
    const province = metadata.userProvince || "ON";
    const collectionAct = regulationRegistry.getRegulationById(`${province}_COLLECTION_ACT`);
    const pipeda43 = regulationRegistry.getRegulationById("PIPEDA_4_3");

    findings.push({
      tradelineId,
      creditorId,
      accountNumber: tl.accountNumber,
      creditorName: tl.creditorName,
      infractionType: "COLLECTOR_VIOLATION",
      violationCategory: "MISSING_ORIGINAL_CREDITOR",
      severity: "HIGH",
      fcraSection: collectionAct && pipeda43 ? `${collectionAct.statute} ${collectionAct.citation} / ${pipeda43.statute} ${pipeda43.citation}` : "Provincial Collection Act / PIPEDA §4.3",
      description: "Collection account fails to identify original creditor",
      evidenceDetails: "No original creditor information found in account data or remarks",
      suggestedDisputeVector: "VERIFICATION_METHOD",
      autoChallengeable: true,
      regulationIds: [collectionAct?.id, pipeda43?.id].filter(Boolean) as string[],
    });
  }

  // 2. Missing Date of First Delinquency
  // Consolidated — handled by detectMetro2FieldViolations check #2 in complianceDetectorMetro2

  // 3. Provincial Time-Barred Debt (if province provided)
  // Consolidated — handled by detectStatuteOfLimitations in complianceDetectorTemporal

  return findings;
}

/**
 * Detect Canadian debt collector communication violations
 */
export function detectCollectorCommunicationViolations(
  tl: ParsedTradeline,
  metadata: ReportMetadata,
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  
  if (!isCollectionAccount(tl)) {
    return findings;
  }

  // 1. Check for threatening or harassing language in remarks
  const threateningKeywords = [
    "legal action",
    "lawsuit",
    "garnish",
    "seize",
    "arrest",
    "criminal",
    "fraud",
    "jail",
    "police",
    "warrant"
  ];

  if (tl.remarkCodes?.join(" ")) {
    const remarksLower = tl.remarkCodes?.join(" ").toLowerCase();
    const foundThreats = threateningKeywords.filter(keyword => remarksLower.includes(keyword));
    
    if (foundThreats.length > 0) {
      const province = metadata.userProvince || "ON";
      const collectionAct = regulationRegistry.getRegulationById(`${province}_COLLECTION_ACT`);

      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "COLLECTOR_VIOLATION",
        violationCategory: "THREATENING_LANGUAGE",
        severity: "HIGH",
        fcraSection: collectionAct ? `${collectionAct.statute} ${collectionAct.citation}` : "Provincial Collection Act / PIPEDA Fair Collection Practices",
        description: "Collection account contains threatening or harassing language",
        evidenceDetails: `Threatening terms found: ${foundThreats.join(", ")}`,
        suggestedDisputeVector: "INVESTIGATION_PROCEDURE",
        autoChallengeable: true,
        regulationIds: collectionAct ? [collectionAct.id] : [],
      });
    }
  }

        // 2. (Removed — duplicate of PREMATURE_CREDIT_REPORTING in detectCollectorTimingViolations)

  // 3. (Removed — INADEQUATE_COLLECTOR_DISCLOSURE was unreliable. It checked whether the creditor
  // name contained keywords like "collection" or "recovery", but many legitimate collection agencies
  // don't include those words in their name. Since isCollectionAccount() already gates this function,
  // the check was redundant and noisy.)

  return findings;
}

/**
 * Detect debt collector timing violations specific to Canadian provincial rules
 */
export function detectCollectorTimingViolations(
  tl: ParsedTradeline,
  metadata: ReportMetadata,
  tradelineId: number | null,
  creditorId: number | null
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];
  
  if (!isCollectionAccount(tl)) {
    return findings;
  }

  const { dates, status } = tl;

  // 1. Premature Credit Reporting (before validation)
  // If account shows as "disputed" but is still being reported
  const isDisputed = (status || "").toLowerCase().includes("dispute") || 
                     tl.remarkCodes?.join(" ")?.toLowerCase().includes("dispute") ||
                     tl.remarkCodes?.join(" ")?.toLowerCase().includes("contested");

  if (isDisputed && dates.reported) {
    const province = metadata.userProvince || "ON";
    const collectionAct = regulationRegistry.getRegulationById(`${province}_COLLECTION_ACT`);
    const pipeda410 = regulationRegistry.getRegulationById("PIPEDA_4_10");

    findings.push({
      tradelineId,
      creditorId,
      accountNumber: tl.accountNumber,
      creditorName: tl.creditorName,
      infractionType: "COLLECTOR_VIOLATION",
      violationCategory: "REPORTING_DISPUTED_DEBT",
      severity: "HIGH",
      fcraSection: collectionAct && pipeda410 ? `${collectionAct.statute} ${collectionAct.citation} / ${pipeda410.statute} ${pipeda410.citation}` : "Provincial Collection Act / PIPEDA - Dispute Handling",
      description: "Collection account reported while under consumer dispute",
      evidenceDetails: "Debt is marked as disputed but continues to be reported to credit bureaus",
      suggestedDisputeVector: "INVESTIGATION_PROCEDURE",
      autoChallengeable: true,
      regulationIds: [collectionAct?.id, pipeda410?.id].filter(Boolean) as string[],
    });
  }

  // 2. Reporting Before Validation Period Expires
  // 30-day validation period from first written notice
  if (dates.opened && dates.reported) {
    const openedDate = new Date(dates.opened);
    const reportedDate = new Date(dates.reported);
    const daysBetween = differenceInDays(reportedDate, openedDate);
    
    // Should not report before consumer has 30 days to dispute
    if (daysBetween < 30) {
      const invest30Day = regulationRegistry.getRegulationById("INVESTIGATION_30_DAY");

      findings.push({
        tradelineId,
        creditorId,
        accountNumber: tl.accountNumber,
        creditorName: tl.creditorName,
        infractionType: "COLLECTOR_VIOLATION",
        violationCategory: "PREMATURE_CREDIT_REPORTING",
        severity: "HIGH",
        fcraSection: invest30Day ? `${invest30Day.statute} - ${invest30Day.citation}` : "Collection Validation Period - 30 Days",
        description: "Debt reported to credit bureau before 30-day validation period expired",
        evidenceDetails: `Account opened: ${openedDate.toISOString().split('T')[0]}, First reported: ${reportedDate.toISOString().split('T')[0]} (only ${daysBetween} days - should wait 30 days)`,
        suggestedDisputeVector: "TIMING_COMPLIANCE",
        autoChallengeable: true,
        regulationIds: invest30Day ? [invest30Day.id] : [],
      });
    }
  }

  // 3. Provincial Reporting Limitations
  // Consolidated — handled by detectStatuteOfLimitations in complianceDetectorTemporal

  // 4. Continued Reporting After Settlement/Payment
  // Consolidated — handled by detectAccountStatusInconsistency in complianceDetectorStatus

  return findings;
}