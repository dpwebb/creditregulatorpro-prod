import { ParsedTradeline } from "./reportParser";
import { detectBureauViolations } from "./regulationInfractionScannerBureau";
import { detectCreditorViolations } from "./regulationInfractionScannerCreditor";
import { detectMedicalDebtViolations, detectStudentLoanViolations } from "./regulationInfractionScannerSpecialized";
import { 
  detectCollectorValidationViolations, 
  detectCollectorCommunicationViolations, 
  detectCollectorTimingViolations 
} from "./regulationInfractionScannerCollector";
import type { InfractionFinding, ReportMetadata } from "./regulationInfractionScannerTypes";

// Re-export types for convenience
export type { 
  InfractionFinding, 
  InfractionSeverity, 
  InfractionType, 
  ReportMetadata 
} from "./regulationInfractionScannerTypes";

/**
 * Scans a list of parsed tradelines for regulatory infractions.
 * Supports both raw parsed tradelines and tradelines from the database (with an id and creditorId).
 */
export function scanForInfractions(
  tradelines: (ParsedTradeline & { id?: number; creditorId?: number | null })[],
  metadata: ReportMetadata
): InfractionFinding[] {
  const findings: InfractionFinding[] = [];

  tradelines.forEach((tl) => {
    const tradelineId = tl.id ?? null;
    const creditorId = tl.creditorId ?? null;
    
    const bureauFindings = detectBureauViolations(tl, metadata, tradelineId, creditorId);
    const creditorFindings = detectCreditorViolations(tl, metadata, tradelineId, creditorId);
    const medicalFindings = detectMedicalDebtViolations(tl, metadata, tradelineId, creditorId);
    const studentLoanFindings = detectStudentLoanViolations(tl, metadata, tradelineId, creditorId);
    const collectorValidationFindings = detectCollectorValidationViolations(tl, metadata, tradelineId, creditorId);
    const collectorCommunicationFindings = detectCollectorCommunicationViolations(tl, metadata, tradelineId, creditorId);
    const collectorTimingFindings = detectCollectorTimingViolations(tl, metadata, tradelineId, creditorId);
    
    findings.push(
      ...bureauFindings, 
      ...creditorFindings, 
      ...medicalFindings, 
      ...studentLoanFindings,
      ...collectorValidationFindings,
      ...collectorCommunicationFindings,
      ...collectorTimingFindings
    );
  });

  return findings.sort((a, b) => {
    const severityScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return severityScore[b.severity] - severityScore[a.severity];
  });
}