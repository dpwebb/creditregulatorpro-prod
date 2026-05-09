import type { Selectable } from "kysely";
import type {
  Tradeline,
  ReportArtifact,
  ObligationInstance,
  BankruptcyRecord,
} from "./schema";
import type { DetectedViolation } from "./complianceDetectorTypes";
import { normalizeDetectedViolations } from "./complianceFindingNormalizer";
import {
  enrichDetectedViolationsRuleEvidence,
  filterViolationsWithLocalAuthorityLinks,
} from "./violationRuleEvidence";

// Import existing detectors
import {
  detectTemporalManipulation,
  detectStatuteOfLimitations,
} from "./complianceDetectorTemporal";
import {
  detectCrossEntityDiscrepancy,
  detectMultipleCollectorViolation,
  detectCrossBureauInconsistency,
  detectDebtValidationFailure,
  detectOriginalCreditorChainFailure,
} from "./complianceDetectorCrossEntity";
import {
  detectPaymentHistoryManipulation,
  detectBalanceCalculationViolation,
  detectCreditLimitManipulation,
} from "./complianceDetectorBalance";
import {
  detectDocumentationChainFailure,
  detectBankruptcyDischargeViolation,
  detectIdentityTheftViolation,
} from "./complianceDetectorSpecial";
import { detectMetro2FieldViolations } from "./complianceDetectorMetro2";
import {
  detectProceduralTimingViolation,
  detectAccountStatusInconsistency,
  detectCreditorResponseQuality,
} from "./complianceDetectorStatus";
import { detectMetro2RulesetViolations } from "./complianceDetectorMetro2Ruleset";
import {
  detectResponseMovMissing,
  detectResponseIncomplete,
  detectResponseNoDocumentation,
  detectResponseAddressMismatch,
  detectResponseUnauthorized,
  runAllResponseAuditDetectors,
} from "./complianceDetectorResponse";
import {
  detectBureauInvestigationFailure,
  detectBureauNotificationFailure,
  detectBureauReinvestigationFailure,
  detectBureauAccessViolation,
  detectBureauDisputeMarkingFailure,
} from "./complianceDetectorBureau";
import {
  detectFurnisherReagingViolation,
  detectFurnisherStatusCodeMismatch,
  detectFurnisherJointAccountViolation,
  detectFurnisherAuthorizedUserMisrepresentation,
  detectFurnisherPostDisputeRetaliation,
} from "./complianceDetectorFurnisher";
import {
  detectCollectorLicenseFailure,
  detectCollectorUnauthorizedFees,
  detectCollectorDuplicateReporting,
  detectCollectorStatuteRevivalAttempt,
  detectDuplicateCollectionAssignment,
} from "./complianceDetectorCollector";
import { detectCollectorPaymentAcknowledgmentViolation } from "./complianceDetectorCollectorPayment";
import { detectFurnisherResponseQuality } from "./complianceDetectorFurnisherResponseQuality";
import { detectDisclosureDeficiency } from "./complianceDetectorDisclosure";
import { detectPhantomDebtUnverifiable } from "./complianceDetectorPhantomDebt";
import { detectRetroactiveHistoryManipulation } from "./complianceDetectorRetroactiveHistory";
import { detectDateLogicImpossibility } from "./complianceDetectorDateLogic";
import { detectStaleReportingFailure } from "./complianceDetectorStaleReporting";
import { detectConsumerStatementSuppression } from "./complianceDetectorStatementSuppression";
import { detectInvestigationRubberStamp } from "./complianceDetectorRubberStamp";
import { detectClosedAccountBalanceInflation } from "./complianceDetectorClosedBalanceInflation";
import { detectZombieDebtResurrection } from "./complianceDetectorZombieDebt";
import { detectLastActivityDateManipulation } from "./complianceDetectorLastActivityManipulation";
import { detectCollectionLimitationExceeded } from "./complianceDetectorCollectionLimitation";
import { detectMixedFilePersonalInfoMismatch } from "./complianceDetectorMixedFile";
import { detectConsentWithdrawalNotHonored } from "./complianceDetectorConsentWithdrawal";
import { detectFreezeViolationInquiry } from "./complianceDetectorFreezeViolation";

// Re-export types
export type { DetectedViolation };

// Re-export all detector functions
export {
  detectTemporalManipulation,
  detectStatuteOfLimitations,
  detectCrossEntityDiscrepancy,
  detectMultipleCollectorViolation,
  detectCrossBureauInconsistency,
  detectDebtValidationFailure,
  detectOriginalCreditorChainFailure,
  detectPaymentHistoryManipulation,
  detectBalanceCalculationViolation,
  detectCreditLimitManipulation,
  detectDocumentationChainFailure,
  detectBankruptcyDischargeViolation,
  detectIdentityTheftViolation,
  detectMetro2FieldViolations,
  detectProceduralTimingViolation,
  detectAccountStatusInconsistency,
  detectCreditorResponseQuality,
  detectMetro2RulesetViolations,
  detectResponseMovMissing,
  detectResponseIncomplete,
  detectResponseNoDocumentation,
  detectResponseAddressMismatch,
  detectResponseUnauthorized,
  runAllResponseAuditDetectors,
  detectBureauInvestigationFailure,
  detectBureauNotificationFailure,
  detectBureauReinvestigationFailure,
  detectBureauAccessViolation,
  detectBureauDisputeMarkingFailure,
  detectFurnisherReagingViolation,
  detectFurnisherStatusCodeMismatch,
  detectFurnisherJointAccountViolation,
  detectFurnisherAuthorizedUserMisrepresentation,
  detectFurnisherPostDisputeRetaliation,
  detectCollectorLicenseFailure,
  detectCollectorUnauthorizedFees,
  detectCollectorDuplicateReporting,
  detectCollectorStatuteRevivalAttempt,
  detectDuplicateCollectionAssignment,
  detectCollectorPaymentAcknowledgmentViolation,
  detectFurnisherResponseQuality,
  detectDisclosureDeficiency,
  detectPhantomDebtUnverifiable,
  detectRetroactiveHistoryManipulation,
  detectDateLogicImpossibility,
  detectStaleReportingFailure,
  detectConsumerStatementSuppression,
  detectInvestigationRubberStamp,
  detectClosedAccountBalanceInflation,
  detectZombieDebtResurrection,
  detectLastActivityDateManipulation,
  detectCollectionLimitationExceeded,
  detectMixedFilePersonalInfoMismatch,
  detectConsentWithdrawalNotHonored,
  detectFreezeViolationInquiry,
};

function getMostRecentArtifactReportDate(
  reportArtifacts: Selectable<ReportArtifact>[]
): Date | string | null {
  let latest: Date | string | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;

  for (const artifact of reportArtifacts) {
    if (!artifact.reportDate) continue;
    const ts = new Date(artifact.reportDate as any).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts > latestTs) {
      latestTs = ts;
      latest = artifact.reportDate;
    }
  }

  return latest;
}

function resolveAnalysisDate(
  contextDate: Date | string | undefined,
  reportArtifacts: Selectable<ReportArtifact>[],
  tradeline: Selectable<Tradeline>
): Date {
  const candidates = [
    contextDate,
    getMostRecentArtifactReportDate(reportArtifacts),
    tradeline.lastReportedDate,
    tradeline.dateVerified,
    tradeline.postedDate,
    tradeline.createdAt,
    tradeline.openedDate,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate as any);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  return new Date(0);
}

/**
 * Aggregates all tradeline-level detectors into a single execution flow.
 * This is a convenience function for running all checks on a single tradeline.
 * Note: Some detectors require additional data (artifacts, bankruptcies, etc.) which must be provided.
 */
export async function runAllTradelineDetectors(
  tradeline: Selectable<Tradeline>,
  context: {
    reportArtifacts?: Selectable<ReportArtifact>[];
    obligationInstances?: Selectable<ObligationInstance>[];
    bankruptcies?: Selectable<BankruptcyRecord>[];
    metro2Version?: string;
    analysisDate?: Date | string;
  } = {}
): Promise<DetectedViolation[]> {
  const violations: DetectedViolation[] = [];
  const {
    reportArtifacts = [],
    obligationInstances = [],
    bankruptcies = [],
    metro2Version,
    analysisDate: contextAnalysisDate,
  } = context;
  const latestReportDate = getMostRecentArtifactReportDate(reportArtifacts);
  const analysisDate = resolveAnalysisDate(contextAnalysisDate, reportArtifacts, tradeline);

  // 1. Temporal & Statute
  violations.push(...detectTemporalManipulation(tradeline, reportArtifacts));
  violations.push(...(await detectStatuteOfLimitations(tradeline, analysisDate)));
  violations.push(...detectRetroactiveHistoryManipulation(tradeline, reportArtifacts));
  if (latestReportDate) {
    violations.push(...detectStaleReportingFailure(tradeline, latestReportDate));
  }
  violations.push(...detectLastActivityDateManipulation(tradeline, reportArtifacts));

  // 2. Cross-Entity & Bureau
  violations.push(...(await detectPhantomDebtUnverifiable(tradeline)));
  violations.push(...(await detectCrossEntityDiscrepancy(tradeline)));
  violations.push(...(await detectMultipleCollectorViolation(tradeline)));
  violations.push(...(await detectCrossBureauInconsistency(tradeline)));
  violations.push(...(await detectDebtValidationFailure(tradeline)));
  violations.push(...(await detectOriginalCreditorChainFailure(tradeline)));

  // 3. Balance & Credit Limit
  violations.push(
    ...detectPaymentHistoryManipulation(tradeline, reportArtifacts)
  );
  violations.push(...detectBalanceCalculationViolation(tradeline));
  violations.push(...detectCreditLimitManipulation(tradeline, reportArtifacts));
  violations.push(...detectClosedAccountBalanceInflation(tradeline, reportArtifacts));
  violations.push(...detectZombieDebtResurrection(tradeline, reportArtifacts));

  // 4. Special & Documentation
  violations.push(...(await detectDocumentationChainFailure(tradeline)));
  violations.push(
    ...detectBankruptcyDischargeViolation(tradeline, bankruptcies)
  );
  violations.push(...(await detectIdentityTheftViolation(tradeline)));
  violations.push(...(await detectMetro2FieldViolations(tradeline, analysisDate)));
  violations.push(...detectDateLogicImpossibility(tradeline));

  // 5. Status & Procedural
  violations.push(...detectProceduralTimingViolation(obligationInstances));
  violations.push(...detectAccountStatusInconsistency(tradeline));
  violations.push(...detectCreditorResponseQuality(obligationInstances));
  violations.push(...detectInvestigationRubberStamp(obligationInstances));
  violations.push(...detectFurnisherResponseQuality(obligationInstances));
  violations.push(...(await detectConsumerStatementSuppression(tradeline)));

  // 6. Metro2 Ruleset
  violations.push(...(await detectMetro2RulesetViolations(tradeline, metro2Version)));

  // 7. Response Audit (if obligation instances provided)
  if (obligationInstances.length > 0) {
    violations.push(...runAllResponseAuditDetectors(obligationInstances));
  }

  // 8. Bureau findings
  violations.push(...detectBureauInvestigationFailure(obligationInstances, analysisDate));
  violations.push(...detectBureauNotificationFailure(obligationInstances));
  violations.push(...detectBureauReinvestigationFailure(tradeline, reportArtifacts));
  violations.push(...(await detectBureauAccessViolation(tradeline, analysisDate)));
  violations.push(...detectBureauDisputeMarkingFailure(obligationInstances, tradeline, analysisDate));

  // 9. Furnisher Violations
  violations.push(...detectFurnisherReagingViolation(tradeline, reportArtifacts));
  violations.push(...detectFurnisherStatusCodeMismatch(tradeline));
  violations.push(...detectFurnisherJointAccountViolation(tradeline));
  violations.push(...detectFurnisherAuthorizedUserMisrepresentation(tradeline));
  violations.push(...detectFurnisherPostDisputeRetaliation(tradeline, obligationInstances, reportArtifacts));

  // 10. Collector Violations
  violations.push(...(await detectCollectorLicenseFailure(tradeline)));
  violations.push(...(await detectCollectorUnauthorizedFees(tradeline, reportArtifacts)));
  violations.push(...(await detectCollectorDuplicateReporting(tradeline)));
  violations.push(...(await detectCollectorStatuteRevivalAttempt(tradeline, reportArtifacts)));
  violations.push(...(await detectDuplicateCollectionAssignment(tradeline)));
  violations.push(...detectCollectorPaymentAcknowledgmentViolation(tradeline, reportArtifacts));

  // 11. Legal Limitation & Authorization Violations
  violations.push(...(await detectCollectionLimitationExceeded(tradeline)));
  violations.push(...(await detectMixedFilePersonalInfoMismatch(tradeline)));
  violations.push(...(await detectConsentWithdrawalNotHonored(tradeline)));
  violations.push(...(await detectFreezeViolationInquiry(tradeline)));

  // 38. DISCLOSURE_DEFICIENCY
  violations.push(...(await detectDisclosureDeficiency(tradeline, tradeline.reportArtifactId ?? undefined)));

  const ruleLinkedViolations = enrichDetectedViolationsRuleEvidence(deduplicateViolations(violations));
  return normalizeDetectedViolations(filterViolationsWithLocalAuthorityLinks(ruleLinkedViolations));
}

const severityScore: Record<string, number> = {
  ERROR: 3,
  WARNING: 2,
  INFO: 1,
};

function getDedupKey(violation: DetectedViolation): string {
  const td = violation.technicalDetails || {};
  
  // 1. If it's a disclosure deficiency, use requirementCodes
  if (violation.violationCategory === "DISCLOSURE_DEFICIENCY" && Array.isArray(td.requirementCodes)) {
    return `DISCLOSURE_${[...td.requirementCodes].sort().join(",")}`;
  }

  // 2. Try to extract field name
  let field = td.fieldName as string | undefined;

  // Try to map ruleName to field for Metro2 rules
  if (!field && td.ruleName) {
    const ruleName = td.ruleName as string;
    const message = (td.message as string | undefined) || "";
    
        if (ruleName === "BASE_SEGMENT_REQUIRED") {
      const msgLower = message.toLowerCase();
      if (msgLower.includes("accountnumber") || msgLower.includes("account number")) field = "accountNumber";
      else if (msgLower.includes("accountstatus") || msgLower.includes("account status")) field = "status";
      else if (msgLower.includes("accounttype") || msgLower.includes("account type")) field = "accountType";
      else if (msgLower.includes("portfoliotype") || msgLower.includes("portfolio type")) field = "portfolioType";
    } else if (ruleName === "DATE_DOFD_LOGIC") {
      field = "dateOfFirstDelinquency";
    } else if (ruleName === "REPORT_DATE_REQUIRED" || ruleName === "DATE_REPORTED_LOGIC") {
      field = "lastReportedDate";
    } else if (ruleName === "DATE_LAST_PAYMENT_AFTER_REPORT_DATE") {
      field = "dateOfLastPayment";
    } else if (ruleName === "BALANCE_EXCEEDS_CREDIT_LIMIT") {
      field = "currentBalance";
    } else if (ruleName === "BALANCE_PAID_ZERO") {
      field = "currentBalance";
    } else if (ruleName === "DATE_CLOSED_REQUIRED") {
      field = "dateClosed";
    } else if (ruleName === "ACCOUNT_DESIGNATION_REQUIRED") {
      field = "accountDesignation";
    }
  }

  if (!field) {
    if (violation.violationCategory === "PHANTOM_DEBT_UNVERIFIABLE") {
      field = "originalCreditorName";
    }
  }

  if (!field && violation.violationCategory === "DOCUMENTATION_CHAIN_FAILURE") {
    const msgLower = (violation.userExplanation || "").toLowerCase();
    if (msgLower.includes("original creditor") || msgLower.includes("original company")) {
      field = "originalCreditorName";
    } else if (msgLower.includes("date of first delinquency") || msgLower.includes("first went overdue") || msgLower.includes("first went delinquent")) {
      field = "dateOfFirstDelinquency";
    } else if (msgLower.includes("date assigned") || msgLower.includes("sent to collections")) {
      field = "dateAssignedToCollection";
    } else if (msgLower.includes("account number")) {
      field = "accountNumber";
    }
  }

  if (field) {
    const crossCategoryCategories = [
      "DOCUMENTATION_CHAIN_FAILURE",
      "ACCOUNT_STATUS_INCONSISTENCY",
      "METRO2_FIELD_VIOLATION",
      "PHANTOM_DEBT_UNVERIFIABLE",
      "COLLECTOR_LICENSE_FAILURE"
    ];

    if (crossCategoryCategories.includes(violation.violationCategory as string)) {
      const entity = violation.responsibleEntity || "UNKNOWN";
      return `FIELD_ISSUE_${entity}_${field}`;
    }
    
    return `${violation.violationCategory}_FIELD_${field}`;
  }

  // 3. Fallback to userExplanation
  return `${violation.violationCategory}_FALLBACK_${violation.userExplanation}`;
}

export function deduplicateViolations(violations: DetectedViolation[]): DetectedViolation[] {
  const groups = new Map<string, DetectedViolation[]>();

  for (const v of violations) {
    const key = getDedupKey(v);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const result: DetectedViolation[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort to keep the highest severity, breaking ties with confidenceScore
    group.sort((a, b) => {
      const aScore = severityScore[a.severity] || 0;
      const bScore = severityScore[b.severity] || 0;
      if (aScore !== bScore) return bScore - aScore;
      return b.confidenceScore - a.confidenceScore;
    });

        const best = { ...group[0] };
    const others = group.slice(1);

    // Merge technicalDetails.mergedFrom
    const mergedFrom = others.map((v) => {
      const td = v.technicalDetails || {};
      return td.ruleName || v.violationCategory || "UNKNOWN_SOURCE";
    });

    // If the best violation lacks a fieldName but a merged one has it, adopt it
    const bestTd = best.technicalDetails || {};
    if (!bestTd.fieldName) {
      for (const v of others) {
        const otherField = (v.technicalDetails || {}).fieldName;
        if (otherField) {
          bestTd.fieldName = otherField;
          break;
        }
      }
    }

    best.technicalDetails = {
      ...bestTd,
      mergedFrom: Array.from(new Set(mergedFrom))
    };

    result.push(best);
  }

  return result;
}
