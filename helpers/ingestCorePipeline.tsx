import { db } from "./db";
import { Json } from "./schema";
import { SSEEvent } from "./sseStreamBuilder";
import { ParsedTradeline } from "./reportParser";
import { PassADraftExtraction } from "./passAExtractorTypes";
import { logUpload } from "./auditLogger";
import { scanAndPersistViolations, type ScanContext } from "./complianceScanner";
import { ConsumerInfoComparison } from "./fuzzyMatcher";
import { updateUserProfileFromReport } from "./ingestProfileUpdater";
import { storeComprehensiveReportData } from "./comprehensiveReportStorage";
import { persistTradelines } from "./ingestTradelinePersistence";
import { validateTradelines } from "./ingestTradelineValidator";
import { buildIngestResponse } from "./ingestResponseBuilder";
import { ComprehensiveParseResult, ExtractedPaymentHistory } from "./reportParserTypes";
import { deriveDeterministicDraftExtractions } from "./deterministicDraftExtraction";

import { snapshotDisputedTradelines, detectAndRecordSilentCorrections } from "./silentCorrectionDetector";
import { getLatestTwoSnapshots, createSnapshotsForBatch } from "./tradelineSnapshotManager";
import { detectSnapshotChanges } from "./changeDetector";
import { assessPendingPacketImpacts } from "./packetImpactAssessor";
import { updateArtifactProcessingStatus } from "./ingestProcessingStatus";
import { ResolvedUserSession } from "./ingestSessionResolver";
import { ParserQualityAssessment } from "./parserQuality";
import { extractCanonicalCreditReport } from "./canonicalCreditReportExtractor";
import { evaluateDisputeOutcomesForTradeline } from "./disputeOutcomeEvaluator";
import type { DeterministicPipelinePackage } from "./deterministicCreditReportPipeline";

export class IngestPipelineError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "IngestPipelineError";
  }
}

export interface PipelineParams {
  user: ResolvedUserSession['user'];
  userAccount: ResolvedUserSession['userAccount'];
  artifactId: number;
  region: string;
  fileName: string;
  bytesBase64: string;
  mimeType: string;
  send: (event: SSEEvent) => void;
  context: { tradelineIds: number[]; createdTradelineIds: number[]; updatedTradelineIds: number[] };
}

const COMPLIANCE_SCAN_CONCURRENCY = 4;

function artifactTimestamp(artifact: { reportDate: Date | string | null; createdAt: Date | string | null }): number {
  return new Date(artifact.reportDate ?? artifact.createdAt ?? 0).getTime();
}

function mergeAndSortArtifacts<T extends { id: number; reportDate: Date | string | null; createdAt: Date | string | null }>(
  ...artifactLists: T[][]
): T[] {
  const unique = new Map<number, T>();
  for (const list of artifactLists) {
    for (const artifact of list) {
      unique.set(artifact.id, artifact);
    }
  }
  return [...unique.values()].sort((a, b) => artifactTimestamp(b) - artifactTimestamp(a));
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;

  const maxWorkers = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: maxWorkers }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        await worker(items[index]);
      }
    })
  );
}

async function insertEvidenceEventIfMissing(params: {
  packetId?: number | null;
  eventType: string;
  description: string;
  region: string;
}): Promise<boolean> {
  let query = db
    .selectFrom("evidenceEvent")
    .select("id")
    .where("eventType", "=", params.eventType)
    .where("description", "=", params.description);

  if (params.packetId == null) {
    query = query.where("packetId", "is", null);
  } else {
    query = query.where("packetId", "=", params.packetId);
  }

  const existing = await query.executeTakeFirst();
  if (existing) {
    return false;
  }

  await db
    .insertInto("evidenceEvent")
    .values({
      packetId: params.packetId ?? null,
      eventType: params.eventType,
      description: params.description,
      region: params.region,
      at: new Date(),
    })
    .execute();

  return true;
}

async function buildComplianceScanContexts(
  userId: number,
  tradelineIds: number[]
): Promise<Map<number, ScanContext>> {
  const contextByTradelineId = new Map<number, ScanContext>();
  if (tradelineIds.length === 0) return contextByTradelineId;

  const tradelines = await db
    .selectFrom("tradeline")
    .selectAll()
    .where("id", "in", tradelineIds)
    .execute();

  if (tradelines.length === 0) return contextByTradelineId;

  const bankruptcies = await db
    .selectFrom("bankruptcyRecord")
    .selectAll()
    .where("userId", "=", userId)
    .execute();

  const disputes = await db
    .selectFrom("obligationInstance")
    .selectAll()
    .where("tradelineId", "in", tradelineIds)
    .execute();

  const disputesByTradelineId = new Map<number, typeof disputes>();
  for (const dispute of disputes) {
    if (!dispute.tradelineId) continue;
    const existing = disputesByTradelineId.get(dispute.tradelineId) ?? [];
    existing.push(dispute);
    disputesByTradelineId.set(dispute.tradelineId, existing);
  }

  const directPresenceRows = await db
    .selectFrom("tradelineArtifactPresence")
    .select(["tradelineId", "reportArtifactId"])
    .where("tradelineId", "in", tradelineIds)
    .execute();

  const directArtifactIdsByTradelineId = new Map<number, number[]>();
  for (const row of directPresenceRows) {
    const existing = directArtifactIdsByTradelineId.get(row.tradelineId) ?? [];
    existing.push(row.reportArtifactId);
    directArtifactIdsByTradelineId.set(row.tradelineId, existing);
  }

  const bureauIds = [...new Set(tradelines.map((tradeline) => tradeline.bureauId).filter((bureauId): bureauId is number => bureauId !== null))];
  const timelineArtifactIdsByBureauId = new Map<number, number[]>();

  if (bureauIds.length > 0) {
    const timelineRows = await db
      .selectFrom("tradelineArtifactPresence")
      .innerJoin("tradeline", "tradeline.id", "tradelineArtifactPresence.tradelineId")
      .select(["tradeline.bureauId as bureauId", "tradelineArtifactPresence.reportArtifactId as reportArtifactId"])
      .distinct()
      .where("tradeline.userId", "=", userId)
      .where("tradeline.bureauId", "in", bureauIds)
      .execute();

    for (const row of timelineRows) {
      if (row.bureauId == null) continue;
      const existing = timelineArtifactIdsByBureauId.get(row.bureauId) ?? [];
      existing.push(row.reportArtifactId);
      timelineArtifactIdsByBureauId.set(row.bureauId, existing);
    }
  }

  const allArtifactIds = new Set<number>();
  for (const ids of directArtifactIdsByTradelineId.values()) {
    for (const id of ids) allArtifactIds.add(id);
  }
  for (const ids of timelineArtifactIdsByBureauId.values()) {
    for (const id of ids) allArtifactIds.add(id);
  }
  for (const tradeline of tradelines) {
    if (tradeline.reportArtifactId) allArtifactIds.add(tradeline.reportArtifactId);
  }

  const artifacts = allArtifactIds.size > 0
    ? await db
        .selectFrom("reportArtifact")
        .selectAll()
        .where("id", "in", [...allArtifactIds])
        .execute()
    : [];

  const artifactById = new Map<number, (typeof artifacts)[number]>();
  for (const artifact of artifacts) {
    artifactById.set(artifact.id, artifact);
  }

  for (const tradeline of tradelines) {
    const directArtifacts = (directArtifactIdsByTradelineId.get(tradeline.id) ?? [])
      .map((id) => artifactById.get(id))
      .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact));

    if (tradeline.reportArtifactId) {
      const reportArtifact = artifactById.get(tradeline.reportArtifactId);
      if (reportArtifact) {
        directArtifacts.push(reportArtifact);
      }
    }

    const sameBureauArtifacts =
      tradeline.bureauId != null
        ? (timelineArtifactIdsByBureauId.get(tradeline.bureauId) ?? [])
            .map((id) => artifactById.get(id))
            .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
        : [];

    const mergedArtifacts = mergeAndSortArtifacts(directArtifacts, sameBureauArtifacts);

    contextByTradelineId.set(tradeline.id, {
      tradeline,
      reportArtifacts: mergedArtifacts,
      bankruptcyRecords: bankruptcies,
      obligationInstances: disputesByTradelineId.get(tradeline.id) ?? [],
    });
  }

  return contextByTradelineId;
}

export async function executeIngestPipeline({
  user,
  userAccount,
  artifactId,
  region,
  fileName,
  bytesBase64,
  mimeType,
  send,
  context
}: PipelineParams): Promise<void> {
  let parsedTradelines: ParsedTradeline[] = [];
  let validationRulesApplied: string[] = [];
  let detectedBureauId: number | null = null;
  let detectedBureauInfo: { bureauName: string; confidence: number } | null = null;
  let consumerInfoComparison: ConsumerInfoComparison | null = null;
  let parseResult: ComprehensiveParseResult | null = null;
  let profileFieldsPopulated: string[] = [];
  let passAExtraction: PassADraftExtraction | null = null;
  let fullExtractionResult: any = { success: false };
  let parserQuality: ParserQualityAssessment | null = null;

  // ============================================================
  // UNIFIED EXTRACTION
  // ============================================================
  send({ type: "progress", stage: "unified_extraction", message: "Extracting report data...", percent: 35 });
  await Promise.resolve();

  let llmData;
  let extractionProvenance: Record<string, unknown> | null = null;
  let deterministicPipeline: DeterministicPipelinePackage | null = null;
  try {
    const canonicalExtraction = await extractCanonicalCreditReport({
      bytesBase64,
      mimeType,
      allowAiFallback: false,
    });

    llmData = canonicalExtraction.llmData;
    parseResult = canonicalExtraction.parseResult;
    parsedTradelines = canonicalExtraction.parseResult.tradelines || [];
    detectedBureauInfo = canonicalExtraction.parseResult.sourceBureau || null;
    parserQuality = canonicalExtraction.parserQuality;
    extractionProvenance = canonicalExtraction.provenance as unknown as Record<string, unknown>;
    deterministicPipeline = canonicalExtraction.deterministicPipeline;
  } catch (error: unknown) {
    console.error(`[Ingest] Canonical extraction failed:`, error);
    throw new IngestPipelineError(
      error instanceof Error ? error.message : "Credit report extraction failed.",
      "EXTRACTION_FAILED"
    );
  }

  if (!parseResult) {
    throw new IngestPipelineError("Credit report extraction failed.", "EXTRACTION_FAILED");
  }

  const extractionResult = deriveDeterministicDraftExtractions(parseResult, artifactId);

  const { passA, fullExtraction } = extractionResult;
  
  passAExtraction = passA;

  if (parserQuality.issues.length > 0) {
    console.warn(
      `[Ingest] Parser quality for artifact ${artifactId}: score=${parserQuality.confidenceScore}, issues=${parserQuality.issues.map((issue) => issue.code).join(", ")}`
    );
  }

  const artifactForQuality = await db
    .selectFrom("reportArtifact")
    .select("data")
    .where("id", "=", artifactId)
    .executeTakeFirst();

  const currentQualityData = (artifactForQuality?.data ?? {}) as Record<string, unknown>;
  await db
    .updateTable("reportArtifact")
    .set({
      data: JSON.parse(JSON.stringify({
        ...currentQualityData,
        extractionStatus: "extracted",
        extractionSource: extractionProvenance?.selectedMethod ?? "pdf_text",
        extractionProvenance,
        deterministicPipeline,
        canonicalOutput: deterministicPipeline?.finalOutput ?? null,
        replayHash: deterministicPipeline?.replayHash ?? extractionProvenance?.replayHash ?? null,
        parserQuality,
        extractionConfidence: parserQuality.confidenceScore,
        parseConfidence: parserQuality.confidenceScore,
        bureauName: parserQuality.sourceBureauName,
      })) as Json,
    })
    .where("id", "=", artifactId)
    .execute();

  if (parserQuality.requiresManualReview) {
    const existingParserEvent = await db
      .selectFrom("evidenceEvent")
      .select("id")
      .where("eventType", "=", "PARSER_REVIEW_REQUIRED")
      .where("description", "like", `%artifact ${artifactId}%`)
      .executeTakeFirst();

    if (!existingParserEvent) {
      await db
        .insertInto("evidenceEvent")
        .values({
          eventType: "PARSER_REVIEW_REQUIRED",
          description: `Parser quality review required for artifact ${artifactId}: ${parserQuality.issues.map((issue) => issue.message).join(" ")}`,
          region,
          at: new Date(),
        })
        .execute();
    }
  }

  fullExtractionResult = {
    success: true,
    extraction: fullExtraction
  };

  const passARecord = await db
    .insertInto("passExtraction")
    .values({
      reportArtifactId: artifactId,
      pass: "A",
      status: "pending",
      startedAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .updateTable("passExtraction")
    .set({
      status: "completed",
      completedAt: new Date(),
      channelGuess: passAExtraction.channel_guess,
      channelConfidence: null,
      bureauContext: JSON.parse(JSON.stringify(passAExtraction.bureau_context)) as Json,
      consumerProfile: JSON.parse(JSON.stringify(passAExtraction.consumer_profile)) as Json,
      rawEvidence: JSON.parse(JSON.stringify(passAExtraction.raw_evidence)) as Json,
      conflicts: JSON.parse(JSON.stringify(passAExtraction.conflicts)) as Json,
      missingRequiredFields: JSON.parse(JSON.stringify(passAExtraction.missing_required_fields)) as Json,
      qualityNotes: JSON.parse(JSON.stringify(passAExtraction.quality_notes)) as Json,
    })
    .where("id", "=", passARecord.id)
    .execute();

  const fullRecord = await db
    .insertInto("passExtraction")
    .values({
      reportArtifactId: artifactId,
      pass: "A_FULL",
      status: "pending",
      startedAt: new Date(),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await db
    .updateTable("passExtraction")
    .set({
      status: "completed",
      completedAt: new Date(),
      channelGuess: fullExtraction.channel_guess,
      bureauContext: JSON.parse(JSON.stringify(fullExtraction.bureau_context)) as Json,
      consumerProfile: JSON.parse(JSON.stringify(fullExtraction.consumer_profile)) as Json,
      portalSummary: JSON.parse(JSON.stringify(fullExtraction.portal_summary)) as Json,
      accounts: JSON.parse(JSON.stringify(fullExtraction.accounts)) as Json,
      inquiriesCreditRelated: JSON.parse(JSON.stringify(fullExtraction.inquiries_credit_related)) as Json,
      inquiriesOther: JSON.parse(JSON.stringify(fullExtraction.inquiries_other)) as Json,
      insolvencyPublicRecords: JSON.parse(JSON.stringify(fullExtraction.insolvency_public_records)) as Json,
      rawEvidence: JSON.parse(JSON.stringify(fullExtraction.raw_evidence)) as Json,
      conflicts: JSON.parse(JSON.stringify(fullExtraction.conflicts)) as Json,
      missingRequiredFields: JSON.parse(JSON.stringify(fullExtraction.missing_required_fields)) as Json,
      qualityNotes: JSON.parse(JSON.stringify(fullExtraction.quality_notes)) as Json,
    })
    .where("id", "=", fullRecord.id)
    .execute();

  send({ type: "progress", stage: "unified_extraction_completed", percent: 75 });
  await Promise.resolve();

  send({ type: "progress", stage: "parsing_tradelines", percent: 80 });
  await Promise.resolve();
  
  try {
    const updateResult = await updateUserProfileFromReport(userAccount, parseResult.consumerInfo);
    profileFieldsPopulated = updateResult.profileFieldsPopulated;
    consumerInfoComparison = updateResult.consumerInfoComparison;

    if (detectedBureauInfo) {
      const coreName = detectedBureauInfo.bureauName.split(" ")[0]; // "Equifax" or "TransUnion"
      const bureau = await db
        .selectFrom("bureau")
        .select("id")
        .where("name", "ilike", `%${coreName}%`)
        .executeTakeFirst();
      
      detectedBureauId = bureau?.id ?? null;
      console.log(
        `[Ingest] Detected bureau: ${detectedBureauInfo.bureauName} (${detectedBureauInfo.confidence}% confidence) -> DB ID: ${detectedBureauId}`
      );
    }
  } catch (parseError) {
    console.error(`[Ingest] Comprehensive map failed:`, parseError);
  }

  send({ type: "progress", stage: "persisting_tradelines", percent: 85 });
  await Promise.resolve();
  
  let disputeSnapshots = new Map();
  try {
    disputeSnapshots = await snapshotDisputedTradelines(user.id);
    console.log(`[Ingest] Snapshotted ${disputeSnapshots.size} disputed tradelines for silent correction detection`);
  } catch (err) {
    console.error(`[Ingest] Failed to snapshot disputed tradelines:`, err);
  }

  let snapshotMap = new Map<number, number>();
  if (parsedTradelines.length > 0) {
    const persistResult = await persistTradelines(
      user.id,
      artifactId,
      parsedTradelines,
      detectedBureauId
    );
    context.tradelineIds = persistResult.tradelineIds;
    context.createdTradelineIds = persistResult.createdTradelineIds;
    context.updatedTradelineIds = persistResult.updatedTradelineIds;

    const artifactForUpdate = await db
      .selectFrom("reportArtifact")
      .select("data")
      .where("id", "=", artifactId)
      .executeTakeFirst();
      
    const currentData = (artifactForUpdate?.data ?? {}) as Record<string, unknown>;
    await db
      .updateTable("reportArtifact")
      .set({
        data: JSON.parse(JSON.stringify({
          ...currentData,
          tradelineIds: context.tradelineIds
        })) as Json
      })
      .where("id", "=", artifactId)
      .execute();
    
    console.log(`[Ingest] Updated artifact ${artifactId} with tradelineIds`);

    if (parseResult) {
      send({ type: "progress", stage: "storing_comprehensive_data", percent: 88 });
      await Promise.resolve();

      const tradelinePaymentHistories = context.tradelineIds.reduce((acc, id, index) => {
        const paymentHistory = parseResult!.paymentHistories?.[index];
        if (paymentHistory) {
          acc.push({ tradelineId: id, paymentHistory });
        }
        return acc;
      }, [] as { tradelineId: number; paymentHistory: ExtractedPaymentHistory }[]);

      console.log("[Ingest] Payment histories to store:", tradelinePaymentHistories.length);

      await storeComprehensiveReportData({
        reportArtifactId: artifactId,
        rawText: parseResult.rawText,
        extractedConsumerInfo: parseResult.consumerInfo,
        extractedCreditScores: parseResult.creditScores,
        extractedInquiries: parseResult.inquiries,
        extractedPublicRecords: parseResult.publicRecords,
        extractedConsumerStatements: parseResult.consumerStatements,
        extractedEmploymentInfo: parseResult.employmentInfo,
        tradelinePaymentHistories
      });

      let reportDateToSave: Date | null = null;
      if (parseResult?.reportMetadata?.reportDate) {
        reportDateToSave = parseResult.reportMetadata.reportDate;
      } else if ((llmData as { lastReviewedDate?: string })?.lastReviewedDate) {
        const d = new Date((llmData as { lastReviewedDate: string }).lastReviewedDate);
        if (!isNaN(d.getTime())) reportDateToSave = d;
      } else if ((llmData as { reportDate?: string })?.reportDate) {
        const d = new Date((llmData as { reportDate: string }).reportDate);
        if (!isNaN(d.getTime())) reportDateToSave = d;
      }

      if (reportDateToSave) {
        await db.updateTable("reportArtifact")
          .set({ reportDate: reportDateToSave })
          .where("id", "=", artifactId)
          .execute();
      }
    }
  }

  // Metro2 Validation Logic
  send({ type: "progress", stage: "validation", percent: 90 });
  await Promise.resolve();
  
  if (parsedTradelines.length > 0) {
    const validationResult = await validateTradelines({
      parsedTradelines,
      tradelineIds: context.tradelineIds,
      region: region,
    });
    validationRulesApplied = validationResult.validationRulesApplied;
  }

  if (context.tradelineIds.length > 0) {
    send({ type: "progress", stage: "snapshotting", message: "Capturing baseline snapshots...", percent: 92.2 });
    await Promise.resolve();
    try {
      snapshotMap = await createSnapshotsForBatch(context.tradelineIds, artifactId);
      console.log(`[Ingest] Created ${snapshotMap.size} snapshots after enrichment`);
    } catch (snapErr) {
      console.error(`[Ingest] Failed to create snapshots:`, snapErr);
    }
  }

  // Missing tradeline check
  send({ type: "progress", stage: "missing_tradeline_check", percent: 92.5 });
  await Promise.resolve();

  if (detectedBureauId !== null && context.tradelineIds.length > 0) {
    try {
      const missingTradelines = await db
        .selectFrom("tradeline")
        .leftJoin("creditor", "creditor.id", "tradeline.creditorId")
        .select(["tradeline.id", "creditor.name as creditorName"])
        .where("tradeline.userId", "=", user.id)
        .where("tradeline.bureauId", "=", detectedBureauId)
        .where("tradeline.id", "not in", context.tradelineIds)
        .execute();

      for (const missing of missingTradelines) {
        const priorPresence = await db
          .selectFrom("tradelineArtifactPresence")
          .select("id")
          .where("tradelineId", "=", missing.id)
          .where("reportArtifactId", "!=", artifactId)
          .limit(1)
          .executeTakeFirst();

        if (priorPresence) {
          await insertEvidenceEventIfMissing({
            eventType: "TRADELINE_ABSENT_FROM_REPORT",
            description: `Account ${missing.creditorName || "Unknown"} (tradeline ID ${missing.id}) was not found in the subsequent ${detectedBureauInfo?.bureauName || "bureau"} report (artifact ${artifactId})`,
            region,
          });
        }
      }
    } catch (err) {
      console.error(`[Ingest] Missing tradeline check failed:`, err);
    }
  }

  // Comprehensive compliance scanning
  send({ type: "progress", stage: "compliance_scanning", percent: 93 });
  await Promise.resolve();
  
  if (context.tradelineIds.length > 0) {
    const scanContexts = await buildComplianceScanContexts(user.id, context.tradelineIds);

    await runWithConcurrency(context.tradelineIds, COMPLIANCE_SCAN_CONCURRENCY, async (tradelineId) => {
      try {
        const scanContext = scanContexts.get(tradelineId);
        await scanAndPersistViolations(tradelineId, scanContext ?? {});
      } catch (scanError) {
        console.error(`[Ingest] Compliance scan failed for tradeline ${tradelineId}:`, scanError);
      }
    });
  }

  send({ type: "progress", stage: "auto_drift_detection", percent: 94 });
  await Promise.resolve();
  
  if (context.tradelineIds.length > 0) {
    for (const tradelineId of context.tradelineIds) {
      try {
        const { previous, current } = await getLatestTwoSnapshots(tradelineId);
        if (previous && current) {
          const changes = detectSnapshotChanges(previous, current);
          const significantChanges = changes.filter(c => c.severity !== "INFO");

          if (significantChanges.length > 0) {
            for (const change of significantChanges) {
              const valNew = change.newValue as Date | string | number | null | undefined;
              const newValueStr = valNew instanceof Date ? valNew.toISOString() : String(valNew ?? "");
              
              const valOld = change.oldValue as Date | string | number | null | undefined;
              const oldValueStr = valOld instanceof Date ? valOld.toISOString() : String(valOld ?? "");
              
              const dup = await db
                .selectFrom("obligationChallengeLog")
                .select("id")
                .where("tradelineId", "=", tradelineId)
                .where("fieldName", "=", change.fieldName)
                .where("actualValue", "=", newValueStr)
                .executeTakeFirst();
              
              if (!dup) {
                await db
                  .insertInto("obligationChallengeLog")
                  .values({
                    tradelineId,
                    reportArtifactId: artifactId,
                    fieldName: change.fieldName,
                    expectedValue: oldValueStr,
                    actualValue: newValueStr,
                    challengeBasis: "DRIFT_DETECTED",
                    message: change.message,
                    severity: change.severity === "ERROR" ? "ERROR" : "WARNING",
                    sourceSnapshotId: previous.id,
                    comparisonSnapshotId: current.id,
                  })
                  .execute();
              }
            }

            const pendingInstance = await db
              .selectFrom("obligationInstance")
              .select("id")
              .where("tradelineId", "=", tradelineId)
              .where("state", "=", "OBLIGATION_PENDING")
              .orderBy("createdAt", "desc")
              .executeTakeFirst();

                        if (pendingInstance) {
              // Keep as OBLIGATION_PENDING — drift detection should not mark as CHALLENGED (Letter Sent)
              // Just update escalation info on the existing pending instance
              await db
                .updateTable("obligationInstance")
                .set({
                  escalationDate: new Date(),
                  escalationTriggered: true,
                })
                .where("id", "=", pendingInstance.id)
                .execute();
            } else {
              await db
                .insertInto("obligationInstance")
                .values({
                  tradelineId,
                  userId: user.id,
                  state: "OBLIGATION_PENDING",
                  disputeVector: "DATA_DRIFT",
                  pressureScore: significantChanges.some(c => c.severity === "ERROR") ? 80 : 40,
                  notes: `Auto-generated from significant data drift detected.`,
                  escalationTriggered: true,
                  escalationDate: new Date(),
                })
                .execute();
            }
          }

          // Link report changes to active disputes and classify outcome signals.
          try {
            await evaluateDisputeOutcomesForTradeline({
              tradelineId,
              userId: user.id,
              reportArtifactId: artifactId,
              changes,
            });
          } catch (evalError) {
            console.error(
              `[Ingest] Dispute outcome evaluation failed for tradeline ${tradelineId}:`,
              evalError
            );
          }
        }
      } catch (err) {
        console.error(`[Ingest] Auto drift detection failed for tradeline ${tradelineId}:`, err);
      }
    }
  }

  let silentResults: { totalDetected: number } | null = null;
  if (disputeSnapshots.size > 0 && context.tradelineIds.length > 0) {
    send({ type: "progress", stage: "silent_correction_detection", percent: 96 });
    await Promise.resolve();

    try {
      silentResults = await detectAndRecordSilentCorrections(user.id, disputeSnapshots, context.tradelineIds);
      console.log(`[Ingest] Silent correction detection completed. Detected: ${silentResults.totalDetected}`);
    } catch (err) {
      console.error(`[Ingest] Failed to detect silent corrections:`, err);
    }
  }

  send({ type: "progress", stage: "packet_impact_assessment", percent: 97 });
  await Promise.resolve();

  for (const tradelineId of context.tradelineIds) {
    if (snapshotMap.has(tradelineId)) {
      try {
        const newSnapshotId = snapshotMap.get(tradelineId)!;
        const assessments = await assessPendingPacketImpacts(tradelineId, newSnapshotId);

        for (const assessment of assessments) {
          if (assessment.favorableChanges && assessment.favorableChanges > 0) {
            await insertEvidenceEventIfMissing({
              packetId: assessment.packetId,
              eventType: "PACKET_IMPACT_ASSESSED",
              description: `Packet impact assessed: ${assessment.favorableChanges} favorable changes detected. Score: ${assessment.impactScore}`,
              region,
            });
          }
        }
      } catch (err) {
        console.error(`[Ingest] Packet impact assessment failed for tradeline ${tradelineId}:`, err);
      }
    }
  }

  try {
    const unaccountedPackets = await db
      .selectFrom("packet")
      .innerJoin("tradeline", "tradeline.id", "packet.tradelineId")
      .leftJoin("packetImpactAssessment", "packetImpactAssessment.packetId", "packet.id")
      .select(["packet.id", "packet.tradelineId"])
      .where("tradeline.userId", "=", user.id)
      .where("packet.baselineSnapshotId", "is not", null)
      .where("packetImpactAssessment.id", "is", null)
      .execute();

    for (const p of unaccountedPackets) {
      if (p.tradelineId !== null && !context.tradelineIds.includes(p.tradelineId)) {
        const latestSnap = await db
          .selectFrom("tradelineSnapshot")
          .select("id")
          .where("tradelineId", "=", p.tradelineId)
          .orderBy("snapshotAt", "desc")
          .executeTakeFirst();

        if (latestSnap) {
          const assessments = await assessPendingPacketImpacts(p.tradelineId, latestSnap.id);
          for (const assessment of assessments) {
            if (assessment.favorableChanges && assessment.favorableChanges > 0) {
              await insertEvidenceEventIfMissing({
                packetId: assessment.packetId,
                eventType: "PACKET_IMPACT_ASSESSED",
                description: `Packet impact assessed: ${assessment.favorableChanges} favorable changes detected. Score: ${assessment.impactScore}`,
                region,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Ingest] Packet impact broadening failed:`, err);
  }

  // Log upload audit event
  send({ type: "progress", stage: "finalizing", percent: 98 });
  await Promise.resolve();
  
  await logUpload(
    user.id,
    artifactId,
    fileName || "unknown.pdf",
    new Request("https://placeholder.com", {
      method: "POST",
      headers: {
        "user-agent": "ingest-handler",
        "x-forwarded-for": "unknown",
      }
    })
  );

  const responseData = buildIngestResponse({
    artifactId,
    parsedTradelines,
    tradelineIds: context.tradelineIds,
    profileFieldsPopulated,
    passAExtraction,
    fullExtractionResult,
    parseResult,
    consumerInfoComparison,
    parserQuality,
    deterministicPipeline,
  });

  if (silentResults && silentResults.totalDetected > 0) {
    (responseData as unknown as Record<string, unknown>).silentCorrections = silentResults;
  }

  await updateArtifactProcessingStatus(artifactId, "completed");
  send({ type: "complete", data: responseData });
  await Promise.resolve();
}
