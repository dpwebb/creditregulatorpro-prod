import { db } from "./db";
import { sql } from "kysely";
import type { Selectable } from "kysely";
import type {
  Tradeline,
  ReportArtifact,
  BankruptcyRecord,
  ObligationInstance,
} from "./schema";
import type { CraObligationType, ViolationCategory } from "./schema";
import {
  detectTemporalManipulation,
  detectCrossEntityDiscrepancy,
  detectStatuteOfLimitations,
  detectPaymentHistoryManipulation,
  detectBalanceCalculationViolation,
  detectDocumentationChainFailure,
  detectProceduralTimingViolation,
  detectMultipleCollectorViolation,
  detectCreditLimitManipulation,
  detectBankruptcyDischargeViolation,
  detectIdentityTheftViolation,
  detectAccountStatusInconsistency,
  detectCreditorResponseQuality,
  detectCrossBureauInconsistency,
  detectDebtValidationFailure,
  detectOriginalCreditorChainFailure,
  detectMetro2FieldViolations,
  detectMetro2RulesetViolations,
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
  detectDuplicateCollectionAssignment,
  detectCollectionLimitationExceeded,
  detectMixedFilePersonalInfoMismatch,
  detectConsentWithdrawalNotHonored,
  detectFreezeViolationInquiry,
  deduplicateViolations,
  type DetectedViolation,
} from "./complianceDetectors";
import { resolveTradelineProvince } from "./resolveTradelineProvince";
import { executeActiveRules } from "./dynamicRuleExecutor";
import { mapViolationToDisputeVector } from "./violationToDisputeVector";

// Re-export types for convenience
export type { DetectedViolation };

export async function loadComplianceConfig(): Promise<Map<ViolationCategory, { enabled: boolean; confidenceThreshold: number; userExplanationTemplate: string | null; recommendedActionTemplate: string | null; }>> {
  const configs = await db.selectFrom("complianceConfig").selectAll().execute();
  const configMap = new Map<ViolationCategory, { enabled: boolean; confidenceThreshold: number; userExplanationTemplate: string | null; recommendedActionTemplate: string | null; }>();

  for (const config of configs) {
    configMap.set(config.violationCategory, {
      enabled: config.enabled ?? true,
      confidenceThreshold: config.confidenceThreshold ?? 50,
      userExplanationTemplate: config.userExplanationTemplate ?? null,
      recommendedActionTemplate: config.recommendedActionTemplate ?? null,
    });
  }

  return configMap;
}

export interface ScanContext {
  // Optional pre-fetched data to avoid redundant DB calls if available
  tradeline?: Selectable<Tradeline>;
  reportArtifacts?: Selectable<ReportArtifact>[];
  bankruptcyRecords?: Selectable<BankruptcyRecord>[];
  obligationInstances?: Selectable<ObligationInstance>[];
}

function normalizeExtractionConfidence(confidence: unknown): number | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return confidence <= 1 ? confidence * 100 : confidence;
}

function mergeArtifactsById(
  primary: Selectable<ReportArtifact>[],
  secondary: Selectable<ReportArtifact>[]
): Selectable<ReportArtifact>[] {
  const map = new Map<number, Selectable<ReportArtifact>>();
  for (const artifact of [...primary, ...secondary]) {
    map.set(artifact.id, artifact);
  }
  return [...map.values()].sort((a, b) => {
    const left = new Date(a.reportDate ?? a.createdAt ?? 0).getTime();
    const right = new Date(b.reportDate ?? b.createdAt ?? 0).getTime();
    return right - left;
  });
}

function getMostRecentArtifactReportDate(
  artifacts: Selectable<ReportArtifact>[]
): Date | string | null {
  let latest: Date | string | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;

  for (const artifact of artifacts) {
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

async function loadSameBureauArtifactTimeline(
  tradeline: Selectable<Tradeline>
): Promise<Selectable<ReportArtifact>[]> {
  if (!tradeline.userId || !tradeline.bureauId) return [];

  const artifactIds = await db
    .selectFrom("tradelineArtifactPresence")
    .innerJoin("tradeline", "tradeline.id", "tradelineArtifactPresence.tradelineId")
    .select("tradelineArtifactPresence.reportArtifactId as reportArtifactId")
    .distinct()
    .where("tradeline.userId", "=", tradeline.userId)
    .where("tradeline.bureauId", "=", tradeline.bureauId)
    .execute();

  const ids = artifactIds.map((row) => row.reportArtifactId);
  if (ids.length === 0) return [];

  return await db
    .selectFrom("reportArtifact")
    .selectAll()
    .where("id", "in", ids)
    .orderBy("reportDate", "desc")
    .orderBy("createdAt", "desc")
    .execute();
}

/**
 * Scans a specific tradeline for regulatory compliance violations.
 * Orchestrates 35 specialized detection modules from helpers/complianceDetectors.
 * 
 * @param tradelineId - The ID of the tradeline to scan
 * @param context - Optional pre-fetched data to avoid redundant DB queries
 * @returns Array of detected violations with recommendations
 */
export async function scanForViolations(
  tradelineId: number,
  context: ScanContext = {}
): Promise<DetectedViolation[]> {
  console.log(`Starting compliance scan for tradeline ${tradelineId}`);
  
  const violations: DetectedViolation[] = [];

  // 1. Fetch Data (if not provided in context)
  const tradeline =
    context.tradeline ||
    (await db
      .selectFrom("tradeline")
      .selectAll()
      .where("id", "=", tradelineId)
      .executeTakeFirst());

  if (!tradeline) {
    console.error(`Tradeline ${tradelineId} not found for scanning.`);
    return [];
  }

  if (!tradeline.openedDate && !tradeline.lastReportedDate && !tradeline.dateOfFirstDelinquency) {
    console.warn(
      `Tradeline ${tradelineId} has no core dates. Running non-date and documentation detectors anyway.`
    );
  }

  if (tradeline.reportArtifactId) {
    const artifact = await db.selectFrom("reportArtifact")
      .select("data")
      .where("id", "=", tradeline.reportArtifactId)
      .executeTakeFirst();
      
    if (artifact?.data) {
      const data = artifact.data as Record<string, any>;
      const rawConfidence = data.extractionConfidence ?? data.parseConfidence ?? data.ocrConfidence;
      const confidence = normalizeExtractionConfidence(rawConfidence);
      if (confidence !== null && confidence < 50) {
        console.warn(
          `Tradeline ${tradelineId} has low extraction confidence (${confidence}). Flagging for review and continuing scan.`
        );
        violations.push({
          violationCategory: "DISCLOSURE_DEFICIENCY",
          severity: "WARNING",
          confidenceScore: 95,
          userExplanation:
            "The credit report extraction was low confidence, so this account needs manual review before the bureau's reporting can be trusted.",
          technicalDetails: {
            tradelineId,
            reportArtifactId: tradeline.reportArtifactId,
            issue: "LOW_EXTRACTION_CONFIDENCE",
            rawConfidence,
            normalizedConfidence: confidence,
            detectedValue: confidence,
            regulationIds: ["PIPEDA_4_6", "PIPEDA_4_9"],
          },
          recommendedAction:
            "Review the original report and ask the credit bureau to provide a clearer, complete disclosure if the account details cannot be verified.",
          tradelineId,
          responsibleEntity: "BUREAU",
        });
      }
    }
  }

        // Fetch related artifacts for history comparison
  // Query both the tradeline_id column and the JSONB data->'tradelineIds' array
  // First try direct tradeline_id, then fall back to JSONB search
  let artifacts = context.reportArtifacts;
  
  if (!artifacts) {
    // Try direct tradeline_id lookup first
    artifacts = await db
      .selectFrom("reportArtifact")
      .selectAll()
      .where("tradelineId", "=", tradelineId)
      .orderBy("reportDate", "desc")
      .execute();
    
            // If no direct match, try JSONB contains on the data field
    if (artifacts.length === 0) {
      const jsonbParam = `[${tradelineId}]`;
      const jsonbArtifacts = await db
        .selectFrom("reportArtifact")
        .selectAll()
        .where(sql<boolean>`data->'tradelineIds' @> ${jsonbParam}::jsonb`)
        .orderBy("reportDate", "desc")
        .execute();

      console.log(`JSONB query searching for tradelineId ${tradelineId} found ${jsonbArtifacts.length} artifacts`);
      artifacts = jsonbArtifacts;
    }

    const sameBureauTimeline = await loadSameBureauArtifactTimeline(tradeline);
    if (sameBureauTimeline.length > 0) {
      artifacts = mergeArtifactsById(artifacts, sameBureauTimeline);
      console.log(
        `Expanded artifact timeline for tradeline ${tradelineId} to ${artifacts.length} same-bureau artifacts`
      );
    }
  }
  console.log(`Found ${artifacts.length} artifacts for tradeline ${tradelineId}`);
  const latestReportDate = getMostRecentArtifactReportDate(artifacts);

  // Fetch bankruptcy records for the user
  const bankruptcies =
    context.bankruptcyRecords ||
    (tradeline.userId
      ? await db
          .selectFrom("bankruptcyRecord")
          .selectAll()
          .where("userId", "=", tradeline.userId)
          .execute()
      : []);

  // Fetch obligation instances (disputes) for response quality checks
  const disputes =
    context.obligationInstances ||
    (await db
      .selectFrom("obligationInstance")
      .selectAll()
      .where("tradelineId", "=", tradelineId)
      .execute());

  console.log(`Fetched ${artifacts.length} artifacts, ${bankruptcies.length} bankruptcy records, ${disputes.length} disputes`);

  // --- Run Detection Modules ---

  // Fetch province for the tradeline
  const tradelineProvince = await resolveTradelineProvince(tradeline);

  try {
    // --- Synchronous Detectors ---
    violations.push(
      ...detectTemporalManipulation(tradeline, artifacts),
      ...detectRetroactiveHistoryManipulation(tradeline, artifacts),
      ...detectPaymentHistoryManipulation(tradeline, artifacts),
      ...detectBalanceCalculationViolation(tradeline),
      ...detectProceduralTimingViolation(disputes),
      ...detectCreditLimitManipulation(tradeline, artifacts),
      ...detectBankruptcyDischargeViolation(tradeline, bankruptcies),
      ...detectDateLogicImpossibility(tradeline),
      ...detectAccountStatusInconsistency(tradeline),
      ...detectCreditorResponseQuality(disputes),
      ...runAllResponseAuditDetectors(disputes),
      ...detectBureauInvestigationFailure(disputes),
      ...(latestReportDate ? detectStaleReportingFailure(tradeline, latestReportDate) : []),
      ...detectLastActivityDateManipulation(tradeline, artifacts),
      ...detectClosedAccountBalanceInflation(tradeline, artifacts),
      ...detectZombieDebtResurrection(tradeline, artifacts),
      ...detectInvestigationRubberStamp(disputes),
      ...detectBureauNotificationFailure(disputes),
      ...detectBureauReinvestigationFailure(tradeline, artifacts),
      ...detectBureauDisputeMarkingFailure(disputes, tradeline),
      ...detectFurnisherReagingViolation(tradeline, artifacts),
      ...detectFurnisherStatusCodeMismatch(tradeline),
      ...detectFurnisherJointAccountViolation(tradeline),
      ...detectFurnisherAuthorizedUserMisrepresentation(tradeline),
      ...detectFurnisherPostDisputeRetaliation(tradeline, disputes, artifacts)
    );

    // --- Asynchronous Detectors ---
    const asyncResults = await Promise.all([
      detectStatuteOfLimitations(tradeline),
      detectPhantomDebtUnverifiable(tradeline),
      detectCrossEntityDiscrepancy(tradeline),
      detectMultipleCollectorViolation(tradeline),
      detectCrossBureauInconsistency(tradeline),
      detectDebtValidationFailure(tradeline),
      detectOriginalCreditorChainFailure(tradeline),
      detectMetro2FieldViolations(tradeline),
      detectMetro2RulesetViolations(tradeline),
      detectCollectorLicenseFailure(tradeline),
      detectCollectorUnauthorizedFees(tradeline, artifacts),
      detectCollectorDuplicateReporting(tradeline),
      detectCollectorStatuteRevivalAttempt(tradeline, artifacts),
      detectDuplicateCollectionAssignment(tradeline),
      detectDisclosureDeficiency(tradeline),
      detectDocumentationChainFailure(tradeline),
      detectIdentityTheftViolation(tradeline),
      detectBureauAccessViolation(tradeline),
      detectConsumerStatementSuppression(tradeline),
      detectCollectionLimitationExceeded(tradeline),
      detectMixedFilePersonalInfoMismatch(tradeline),
      detectConsentWithdrawalNotHonored(tradeline),
      detectFreezeViolationInquiry(tradeline),
      executeActiveRules(tradeline)
    ]);

    for (const result of asyncResults) {
      violations.push(...result);
    }

    console.log(`Compliance scan completed: ${violations.length} violations detected`);
    
    // Inject province into all technicalDetails before deduplication
    violations.forEach(v => {
      if (!v.technicalDetails) v.technicalDetails = {};
      if (!v.technicalDetails.province && tradelineProvince) {
        v.technicalDetails.province = tradelineProvince;
      }
    });

  } catch (error) {
    console.error(`Error during compliance scan for tradeline ${tradelineId}:`, error);
    throw error;
  }

      const deduplicated = deduplicateViolations(violations);
  const configMap = await loadComplianceConfig();

  let filteredCount = 0;
  const finalViolations = deduplicated.filter((v) => {
    if (!v.violationCategory) return true;
    
    const config = configMap.get(v.violationCategory as ViolationCategory) ?? { enabled: true, confidenceThreshold: 50, userExplanationTemplate: null, recommendedActionTemplate: null };
    
    if (config.enabled === false) {
      filteredCount++;
      return false;
    }
    
    if (v.confidenceScore < config.confidenceThreshold) {
      filteredCount++;
      return false;
    }
    
    return true;
  });

  for (const v of finalViolations) {
    if (!v.violationCategory) continue;
    const config = configMap.get(v.violationCategory as ViolationCategory);
    if (!config) continue;

    if (config.userExplanationTemplate && config.userExplanationTemplate.trim() !== "") {
      v.userExplanation = config.userExplanationTemplate;
    }
    if (config.recommendedActionTemplate && config.recommendedActionTemplate.trim() !== "") {
      v.recommendedAction = config.recommendedActionTemplate;
    }
  }

  if (filteredCount > 0) {
    console.log(`Filtered out ${filteredCount} violations based on complianceConfig settings.`);
  }

  return finalViolations;
}

/**
 * Maps a ViolationCategory to a valid CraObligationType for database persistence.
 */
export function mapViolationToObligationType(
  category: ViolationCategory
): CraObligationType {
  switch (category) {
    case "TEMPORAL_MANIPULATION":
    case "STATUTE_OF_LIMITATIONS":
    case "FURNISHER_REAGING_VIOLATION":
    case "COLLECTOR_STATUTE_REVIVAL_ATTEMPT":
    case "LAST_ACTIVITY_DATE_MANIPULATION":
      return "DOFD_REPORTING";
    case "CROSS_ENTITY_DISCREPANCY":
    case "PAYMENT_HISTORY_MANIPULATION":
    case "MULTIPLE_COLLECTOR_VIOLATION":
    case "PHANTOM_DEBT_UNVERIFIABLE":
    case "RETROACTIVE_HISTORY_MANIPULATION":
    case "BANKRUPTCY_DISCHARGE_VIOLATION":
    case "IDENTITY_THEFT_VIOLATION":
    case "BUREAU_REINSERTION_VIOLATION":
    case "BUREAU_ACCESS_VIOLATION":
    case "BUREAU_DISPUTE_MARKING_FAILURE":
    case "FURNISHER_AUTHORIZED_USER_MISREPRESENTATION":
    case "COLLECTOR_LICENSE_FAILURE":
    case "COLLECTOR_UNAUTHORIZED_FEES":
    case "COLLECTOR_DUPLICATE_REPORTING":
    case "ZOMBIE_DEBT_RESURRECTION":
    case "COLLECTION_LIMITATION_EXCEEDED":
    case "MIXED_FILE_PERSONAL_INFO_MISMATCH":
    case "FREEZE_PERIOD_VIOLATION":
      return "ACCURACY_INTEGRITY";
    case "DATE_LOGIC_IMPOSSIBLE":
    case "BALANCE_CALCULATION_VIOLATION":
    case "CREDIT_LIMIT_MANIPULATION":
    case "ACCOUNT_STATUS_INCONSISTENCY":
    case "FURNISHER_STATUS_CODE_MISMATCH":
    case "FURNISHER_JOINT_ACCOUNT_VIOLATION":
    case "CLOSED_ACCOUNT_BALANCE_INFLATION":
      return "DATA_VALIDATION";
    case "DOCUMENTATION_CHAIN_FAILURE":
    case "COLLECTOR_PAYMENT_ACKNOWLEDGMENT_VIOLATION":
      return "CORRECTION_DUTY";
    case "PROCEDURAL_TIMING_VIOLATION":
    case "CREDITOR_RESPONSE_QUALITY":
    case "BUREAU_INVESTIGATION_FAILURE":
    case "BUREAU_NOTIFICATION_FAILURE":
    case "FURNISHER_POST_DISPUTE_RETALIATION":
    case "CONSUMER_STATEMENT_SUPPRESSION":
    case "INVESTIGATION_RUBBER_STAMP":
    case "CONSENT_WITHDRAWAL_NOT_HONORED":
      return "DISPUTE_INVESTIGATION";
    case "CROSS_BUREAU_INCONSISTENCY":
    case "STALE_REPORTING_FAILURE":
      return "MONTHLY_REPORTING";
    case "RESPONSE_MOV_MISSING":
    case "RESPONSE_INCOMPLETE":
    case "RESPONSE_NO_DOCUMENTATION":
    case "RESPONSE_ADDRESS_MISMATCH":
    case "RESPONSE_UNAUTHORIZED":
      return "DISPUTE_INVESTIGATION";
    case "DISCLOSURE_DEFICIENCY":
      return "ACCURACY_INTEGRITY";
    default:
      return "ACCURACY_INTEGRITY";
  }
}

async function createPendingObligationInstanceForViolation(
  tradelineId: number,
  userId: number | null,
  violation: DetectedViolation,
  violationId: number
): Promise<boolean> {
  if (!userId) return false;

  const technicalDetails = violation.technicalDetails as { fieldName?: string } | null | undefined;
  const disputeVector =
    mapViolationToDisputeVector(violation.violationCategory, technicalDetails) ??
    "AUTHORITY_TO_REPORT";

  const existing = await db
    .selectFrom("obligationInstance")
    .select("id")
    .where("tradelineId", "=", tradelineId)
    .where("userId", "=", userId)
    .where("state", "=", "OBLIGATION_PENDING")
    .where("disputeVector", "=", disputeVector)
    .executeTakeFirst();

  if (existing) {
    return false;
  }

  await db
    .insertInto("obligationInstance")
    .values({
      tradelineId,
      userId,
      state: "OBLIGATION_PENDING",
      disputeVector,
      notes: `Auto-created from compliance violation #${violationId}`,
      createdAt: new Date(),
    })
    .execute();

  return true;
}

/**
 * Persists detected violations to the creditor_obligation_test table.
 * Automatically deduplicates based on signature (category + obligationType + userExplanation).
 * 
 * @param violations - Array of detected violations to persist
 * @param tradelineId - The tradeline ID these violations are associated with
 * @returns Array of created record IDs
 */
export async function persistViolations(
  violations: DetectedViolation[],
  tradelineId: number
): Promise<number[]> {
  if (violations.length === 0) {
    console.log(`No violations to persist for tradeline ${tradelineId}`);
    return [];
  }

  console.log(`Processing ${violations.length} violations for tradeline ${tradelineId}`);

  const tradelineForWorkflow = await db
    .selectFrom("tradeline")
    .select(["userId", "creditorId"])
    .where("id", "=", tradelineId)
    .executeTakeFirst();

  // 0. Fetch existing non-active violations (dismissed/verified) to preserve them
  const preservedViolations = await db
    .selectFrom("creditorObligationTest")
    .select(["violationCategory", "userExplanation"])
    .where("tradelineId", "=", tradelineId)
    .where("userStatus", "!=", "active")
    .execute();

  const preservedSignatures = new Set(
    preservedViolations.map((v) => `${v.violationCategory}|${v.userExplanation}`)
  );

  // 1. Delete all existing auto-generated violations for this tradeline.
  //    Manually created violations (autoGenerated = false or null) are preserved.
  const deleteResult = await db
    .deleteFrom("creditorObligationTest")
    .where("tradelineId", "=", tradelineId)
    .where("autoGenerated", "=", true)
    .where("userStatus", "=", "active")
    .execute();

  console.log(`Deleted ${deleteResult[0]?.numDeletedRows ?? 0} existing auto-generated violations for tradeline ${tradelineId}`);

  const insertedIds: number[] = [];

  // 2. Insert all violations from the fresh scan
  for (const violation of violations) {
    const signature = `${violation.violationCategory}|${violation.userExplanation}`;
    
    // Skip if a matching dismissed/verified violation already exists
    if (preservedSignatures.has(signature)) {
      console.log(`Skipping insertion for preserved violation: ${signature}`);
      continue;
    }

        try {
      const enrichedDetails = JSON.parse(JSON.stringify({
        ...violation.technicalDetails,
        responsibleEntity: violation.responsibleEntity || null,
      }));
            
      const result = await db
        .insertInto("creditorObligationTest")
        .values({
          tradelineId,
          creditorId: tradelineForWorkflow?.creditorId ?? null,
          obligationType: violation.violationCategory
            ? mapViolationToObligationType(violation.violationCategory)
            : "ACCURACY_INTEGRITY",
          violationCategory: violation.violationCategory,
          severity: violation.severity,
          confidenceScore: violation.confidenceScore,
          userExplanation: violation.userExplanation,
          technicalDetails: enrichedDetails,
                    
          recommendedAction: violation.recommendedAction,
          statutoryBasis: null,
          detectedAt: new Date(),
          validationStatus: "PENDING",
          obligationState: "OBLIGATION_PENDING",
          autoGenerated: true,
        })
        .returning("id")
        .executeTakeFirst();

      if (result?.id) {
        const violationId = Number(result.id);
        insertedIds.push(violationId);

        try {
          await createPendingObligationInstanceForViolation(
            tradelineId,
            tradelineForWorkflow?.userId ?? null,
            violation,
            violationId
          );
        } catch (workflowError) {
          console.error(
            `Failed to create pending obligation instance for violation ${violationId}:`,
            workflowError
          );
        }
      }
    } catch (error) {
      console.error(`Failed to persist violation ${violation.violationCategory}:`, error);
      // Continue with other violations even if one fails
    }
  }

  console.log(`Successfully persisted ${insertedIds.length} violations for tradeline ${tradelineId}`);
  
  return insertedIds;
}

/**
 * Scans a tradeline and automatically persists violations to the database.
 * Convenience function that combines scanForViolations + persistViolations.
 * 
 * @param tradelineId - The ID of the tradeline to scan
 * @param context - Optional pre-fetched data
 * @returns Object containing violations array and inserted record IDs
 */
export async function scanAndPersistViolations(
  tradelineId: number,
  context: ScanContext = {}
): Promise<{ violations: DetectedViolation[]; insertedIds: number[] }> {
  const violations = await scanForViolations(tradelineId, context);
  const insertedIds = await persistViolations(violations, tradelineId);
  
  return { violations, insertedIds };
}
