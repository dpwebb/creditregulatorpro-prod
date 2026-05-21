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
import type { ExtractionSourceMethod } from "./passAExtractorTypes";

import { snapshotDisputedTradelines, detectAndRecordSilentCorrections } from "./silentCorrectionDetector";
import { getLatestTwoSnapshots, createSnapshotsForBatch } from "./tradelineSnapshotManager";
import { detectSnapshotChanges } from "./changeDetector";
import { assessPendingPacketImpacts } from "./packetImpactAssessor";
import { ResolvedUserSession } from "./ingestSessionResolver";
import { ParserQualityAssessment } from "./parserQuality";
import { extractCanonicalCreditReport } from "./canonicalCreditReportExtractor";
import { evaluateDisputeOutcomesForTradeline } from "./disputeOutcomeEvaluator";
import {
  stableCanonicalJson,
  type DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";
import type { DeterministicReplayValidation } from "./deterministicReplayValidator";
import type { DeterministicOcrCoordinateIndex } from "./deterministicOcr";
import type { PdfjsCoordinateIndex } from "./pdfjsEvidenceCoordinates";
import { buildEvidenceLocationIndex } from "./evidenceLocationIndex";

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

type CompletedPassExtractionValues = {
  channelGuess?: string | null;
  channelConfidence?: number | null;
  bureauContext?: Json | null;
  consumerProfile?: Json | null;
  portalSummary?: Json | null;
  accounts?: Json | null;
  inquiriesCreditRelated?: Json | null;
  inquiriesOther?: Json | null;
  insolvencyPublicRecords?: Json | null;
  rawEvidence?: Json | null;
  conflicts?: Json | null;
  missingRequiredFields?: Json | null;
  qualityNotes?: Json | null;
};

export type IngestStageKey =
  | "artifact_stored"
  | "extraction_snapshot_stored"
  | "canonical_mapping_stored"
  | "evidence_index_stored"
  | "compliance_scan_stored"
  | "replay_payload_stored"
  | "comprehensive_sidecar_stored"
  | "report_promoted_complete";

export type IngestStageStatus = "pending" | "stored" | "failed" | "degraded";

export type IngestStageRecord = {
  status: IngestStageStatus;
  updatedAt: string;
  details?: Record<string, unknown>;
  error?: string;
};

export type IngestStagePersistence = {
  version: 1;
  criticalStages: IngestStageKey[];
  stages: Partial<Record<IngestStageKey, IngestStageRecord>>;
};

const CRITICAL_INGEST_STAGES: IngestStageKey[] = [
  "artifact_stored",
  "extraction_snapshot_stored",
  "canonical_mapping_stored",
  "evidence_index_stored",
  "compliance_scan_stored",
  "replay_payload_stored",
];

function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function existingStagePersistence(value: unknown): IngestStagePersistence {
  const record = recordFromJson(value);
  const stages = recordFromJson(record.stages);
  return {
    version: 1,
    criticalStages: CRITICAL_INGEST_STAGES,
    stages: stages as Partial<Record<IngestStageKey, IngestStageRecord>>,
  };
}

export function mergeIngestStagePersistence(
  data: unknown,
  stage: IngestStageKey,
  status: IngestStageStatus,
  options: {
    details?: Record<string, unknown>;
    error?: unknown;
    updatedAt?: string;
  } = {},
): Record<string, unknown> {
  const baseData = recordFromJson(data);
  const current = existingStagePersistence(baseData.ingestStagePersistence);
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const error = options.error == null
    ? undefined
    : options.error instanceof Error
      ? options.error.message
      : String(options.error);

  return {
    ...baseData,
    ingestStagePersistence: {
      version: 1,
      criticalStages: CRITICAL_INGEST_STAGES,
      stages: {
        ...current.stages,
        [stage]: {
          status,
          updatedAt,
          ...(options.details ? { details: options.details } : {}),
          ...(error ? { error } : {}),
        },
      },
    } satisfies IngestStagePersistence,
  };
}

export function evaluateIngestStageCompletion(data: unknown): {
  ok: boolean;
  missingStages: IngestStageKey[];
  failedStages: IngestStageKey[];
  degradedCriticalStages: IngestStageKey[];
} {
  const artifactData = recordFromJson(data);
  const persistence = existingStagePersistence(artifactData.ingestStagePersistence);
  const missingStages: IngestStageKey[] = [];
  const failedStages: IngestStageKey[] = [];
  const degradedCriticalStages: IngestStageKey[] = [];

  for (const stage of CRITICAL_INGEST_STAGES) {
    const status = persistence.stages[stage]?.status;
    if (!status) missingStages.push(stage);
    else if (status === "failed") failedStages.push(stage);
    else if (status === "degraded") degradedCriticalStages.push(stage);
    else if (status !== "stored") missingStages.push(stage);
  }

  return {
    ok: missingStages.length === 0 && failedStages.length === 0 && degradedCriticalStages.length === 0,
    missingStages,
    failedStages,
    degradedCriticalStages,
  };
}

export function buildIngestReplayPayload(
  deterministicPipeline: DeterministicPipelinePackage | null,
  replayValidation: DeterministicReplayValidation | null,
): Record<string, unknown> | null {
  if (!deterministicPipeline) return null;
  return {
    replayHash: deterministicPipeline.replayHash,
    canonicalOutput: deterministicPipeline.finalOutput,
    replayValidation,
  };
}

export function replayPayloadMatchesCanonicalState(data: unknown): boolean {
  const artifactData = recordFromJson(data);
  const replayPayload = recordFromJson(artifactData.replayPayload);
  if (!artifactData.canonicalOutput || !replayPayload.canonicalOutput) return false;
  if (typeof artifactData.replayHash !== "string" || typeof replayPayload.replayHash !== "string") return false;
  if (artifactData.replayHash !== replayPayload.replayHash) return false;
  return stableCanonicalJson(artifactData.canonicalOutput) === stableCanonicalJson(replayPayload.canonicalOutput);
}

function toPersistedJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

async function upsertCompletedPassExtraction(
  reportArtifactId: number,
  pass: "A" | "A_FULL",
  values: CompletedPassExtractionValues,
): Promise<void> {
  const now = new Date();
  const row = {
    reportArtifactId,
    pass,
    status: "completed" as const,
    startedAt: now,
    completedAt: now,
    channelGuess: values.channelGuess ?? null,
    channelConfidence: values.channelConfidence ?? null,
    bureauContext: values.bureauContext ?? null,
    consumerProfile: values.consumerProfile ?? null,
    portalSummary: values.portalSummary ?? null,
    accounts: values.accounts ?? null,
    inquiriesCreditRelated: values.inquiriesCreditRelated ?? null,
    inquiriesOther: values.inquiriesOther ?? null,
    insolvencyPublicRecords: values.insolvencyPublicRecords ?? null,
    rawEvidence: values.rawEvidence ?? null,
    conflicts: values.conflicts ?? null,
    missingRequiredFields: values.missingRequiredFields ?? null,
    qualityNotes: values.qualityNotes ?? null,
    errorMessage: null,
    errorDetails: null,
  };

  await db
    .insertInto("passExtraction")
    .values(row)
    .onConflict((oc) =>
      oc.columns(["reportArtifactId", "pass"]).doUpdateSet({
        status: "completed",
        startedAt: (eb) => eb.ref("excluded.startedAt"),
        completedAt: (eb) => eb.ref("excluded.completedAt"),
        channelGuess: (eb) => eb.ref("excluded.channelGuess"),
        channelConfidence: (eb) => eb.ref("excluded.channelConfidence"),
        bureauContext: (eb) => eb.ref("excluded.bureauContext"),
        consumerProfile: (eb) => eb.ref("excluded.consumerProfile"),
        portalSummary: (eb) => eb.ref("excluded.portalSummary"),
        accounts: (eb) => eb.ref("excluded.accounts"),
        inquiriesCreditRelated: (eb) => eb.ref("excluded.inquiriesCreditRelated"),
        inquiriesOther: (eb) => eb.ref("excluded.inquiriesOther"),
        insolvencyPublicRecords: (eb) => eb.ref("excluded.insolvencyPublicRecords"),
        rawEvidence: (eb) => eb.ref("excluded.rawEvidence"),
        conflicts: (eb) => eb.ref("excluded.conflicts"),
        missingRequiredFields: (eb) => eb.ref("excluded.missingRequiredFields"),
        qualityNotes: (eb) => eb.ref("excluded.qualityNotes"),
        errorMessage: null,
        errorDetails: null,
      })
    )
    .execute();
}

async function updateIngestStage(
  artifactId: number,
  stage: IngestStageKey,
  status: IngestStageStatus,
  options: {
    details?: Record<string, unknown>;
    error?: unknown;
    processingStatus?: string;
  } = {},
): Promise<void> {
  const artifact = await db
    .selectFrom("reportArtifact")
    .select("data")
    .where("id", "=", artifactId)
    .executeTakeFirst();
  const data = mergeIngestStagePersistence(artifact?.data ?? {}, stage, status, options);
  if (options.processingStatus) {
    await db
      .updateTable("reportArtifact")
      .set({
        data: JSON.parse(JSON.stringify(data)) as Json,
        processingStatus: options.processingStatus,
      })
      .where("id", "=", artifactId)
      .execute();
    return;
  }
  await db
    .updateTable("reportArtifact")
    .set({ data: JSON.parse(JSON.stringify(data)) as Json })
    .where("id", "=", artifactId)
    .execute();
}

async function failCriticalIngestStage(
  artifactId: number,
  stage: IngestStageKey,
  error: unknown,
  code: string,
): Promise<never> {
  await updateIngestStage(artifactId, stage, "failed", {
    error,
    processingStatus: "failed",
  }).catch((stageError) => {
    console.error(`[Ingest] Failed to record ingest stage failure for ${stage}:`, stageError);
  });
  throw new IngestPipelineError(error instanceof Error ? error.message : String(error), code);
}

async function assertPersistedReplayPayloadMatches(artifactId: number): Promise<void> {
  const artifact = await db
    .selectFrom("reportArtifact")
    .select("data")
    .where("id", "=", artifactId)
    .executeTakeFirst();
  if (!replayPayloadMatchesCanonicalState(artifact?.data)) {
    await failCriticalIngestStage(
      artifactId,
      "replay_payload_stored",
      new Error("Persisted replay payload does not match the persisted canonical output."),
      "REPLAY_PAYLOAD_DRIFT",
    );
  }
}

async function promoteReportArtifactComplete(artifactId: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const artifact = await trx
      .selectFrom("reportArtifact")
      .select("data")
      .where("id", "=", artifactId)
      .forUpdate()
      .executeTakeFirst();
    const completion = evaluateIngestStageCompletion(artifact?.data);
    if (!completion.ok) {
      throw new IngestPipelineError(
        `Cannot complete ingest before critical stages are persisted: missing=${completion.missingStages.join(",") || "none"} failed=${completion.failedStages.join(",") || "none"} degraded=${completion.degradedCriticalStages.join(",") || "none"}.`,
        "INGEST_STAGE_INCOMPLETE",
      );
    }
    const promotedData = mergeIngestStagePersistence(
      artifact?.data ?? {},
      "report_promoted_complete",
      "stored",
      { details: { criticalStagesVerified: true } },
    );
    await trx
      .updateTable("reportArtifact")
      .set({
        data: JSON.parse(JSON.stringify(promotedData)) as Json,
        processingStatus: "completed",
      })
      .where("id", "=", artifactId)
      .execute();
  });
}

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

  await updateIngestStage(artifactId, "artifact_stored", "stored", {
    details: { artifactId, durableRowPresent: true },
  });

  // ============================================================
  // UNIFIED EXTRACTION
  // ============================================================
  send({ type: "progress", stage: "unified_extraction", message: "Extracting report data...", percent: 35 });
  await Promise.resolve();

  let llmData;
  let extractionProvenance: Record<string, unknown> | null = null;
  let deterministicPipeline: DeterministicPipelinePackage | null = null;
  let ocrCoordinateIndex: DeterministicOcrCoordinateIndex | null = null;
  let nativePdfCoordinateIndex: PdfjsCoordinateIndex | null = null;
  let replayValidation: DeterministicReplayValidation | null = null;
  let extractionSourceMethod: ExtractionSourceMethod = "pdf_text";
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
    ocrCoordinateIndex = canonicalExtraction.ocrCoordinateIndex ?? null;
    nativePdfCoordinateIndex = canonicalExtraction.nativePdfCoordinateIndex ?? null;
    replayValidation = canonicalExtraction.provenance.replayValidation;
    extractionSourceMethod = canonicalExtraction.extractionSource === "ocr_text" ? "ocr_text" : "pdf_text";
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

  const extractionResult = deriveDeterministicDraftExtractions(
    parseResult,
    artifactId,
    extractionSourceMethod,
  );

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
  let evidenceLocationIndex: Record<string, unknown> = {};
  try {
    evidenceLocationIndex = buildEvidenceLocationIndex(deterministicPipeline, {
      ocrCoordinateIndex,
      nativePdfCoordinateIndex,
    });
    const replayPayload = buildIngestReplayPayload(deterministicPipeline, replayValidation);
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
          evidenceLocationIndex,
          replayHash: deterministicPipeline?.replayHash ?? extractionProvenance?.replayHash ?? null,
          replayPayload,
          replayValidation,
          parserQuality,
          extractionConfidence: parserQuality.confidenceScore,
          parseConfidence: parserQuality.confidenceScore,
          bureauName: parserQuality.sourceBureauName,
        })) as Json,
      })
      .where("id", "=", artifactId)
      .execute();

    await assertPersistedReplayPayloadMatches(artifactId);
    await updateIngestStage(artifactId, "extraction_snapshot_stored", "stored", {
      details: { extractionSource: extractionProvenance?.selectedMethod ?? "pdf_text" },
    });
    await updateIngestStage(artifactId, "canonical_mapping_stored", "stored", {
      details: { replayHash: deterministicPipeline?.replayHash ?? null },
    });
    await updateIngestStage(artifactId, "evidence_index_stored", "stored", {
      details: {
        evidenceEntryCount: Object.keys(recordFromJson(evidenceLocationIndex)).length,
      },
    });
    await updateIngestStage(artifactId, "replay_payload_stored", "stored", {
      details: { replayHash: deterministicPipeline?.replayHash ?? null },
    });
  } catch (error) {
    if (error instanceof IngestPipelineError) throw error;
    await failCriticalIngestStage(artifactId, "evidence_index_stored", error, "INGEST_EXTRACTION_PERSISTENCE_FAILED");
  }

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

  await upsertCompletedPassExtraction(artifactId, "A", {
    channelGuess: passAExtraction.channel_guess,
    channelConfidence: null,
    bureauContext: toPersistedJson(passAExtraction.bureau_context),
    consumerProfile: toPersistedJson(passAExtraction.consumer_profile),
    rawEvidence: toPersistedJson(passAExtraction.raw_evidence),
    conflicts: toPersistedJson(passAExtraction.conflicts),
    missingRequiredFields: toPersistedJson(passAExtraction.missing_required_fields),
    qualityNotes: toPersistedJson(passAExtraction.quality_notes),
  });

  await upsertCompletedPassExtraction(artifactId, "A_FULL", {
    channelGuess: fullExtraction.channel_guess,
    bureauContext: toPersistedJson(fullExtraction.bureau_context),
    consumerProfile: toPersistedJson(fullExtraction.consumer_profile),
    portalSummary: toPersistedJson(fullExtraction.portal_summary),
    accounts: toPersistedJson(fullExtraction.accounts),
    inquiriesCreditRelated: toPersistedJson(fullExtraction.inquiries_credit_related),
    inquiriesOther: toPersistedJson(fullExtraction.inquiries_other),
    insolvencyPublicRecords: toPersistedJson(fullExtraction.insolvency_public_records),
    rawEvidence: toPersistedJson(fullExtraction.raw_evidence),
    conflicts: toPersistedJson(fullExtraction.conflicts),
    missingRequiredFields: toPersistedJson(fullExtraction.missing_required_fields),
    qualityNotes: toPersistedJson(fullExtraction.quality_notes),
  });

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
          tradelineIds: context.tradelineIds,
          createdTradelineIds: context.createdTradelineIds,
          updatedTradelineIds: context.updatedTradelineIds,
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

      const comprehensiveStorageResult = await storeComprehensiveReportData({
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
      await updateIngestStage(
        artifactId,
        "comprehensive_sidecar_stored",
        comprehensiveStorageResult.errors.length > 0 ? "degraded" : "stored",
        {
          details: {
            errorCount: comprehensiveStorageResult.errors.length,
            consumerInfoId: comprehensiveStorageResult.consumerInfoId,
            paymentHistoryCount: comprehensiveStorageResult.paymentHistoryIds.length,
          },
          error: comprehensiveStorageResult.errors.join("; ") || undefined,
        },
      );

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
      reportDate: parseResult?.reportMetadata?.reportDate ?? null,
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
  
  const persistedViolationIds: number[] = [];
  const complianceScanErrors: string[] = [];
  if (context.tradelineIds.length > 0) {
    const scanContexts = await buildComplianceScanContexts(user.id, context.tradelineIds);

    await runWithConcurrency(context.tradelineIds, COMPLIANCE_SCAN_CONCURRENCY, async (tradelineId) => {
      try {
        const scanContext = scanContexts.get(tradelineId);
        const scanResult = await scanAndPersistViolations(tradelineId, {
          ...(scanContext ?? {}),
          sourceReportArtifactId: artifactId,
        });
        persistedViolationIds.push(...scanResult.insertedIds);
      } catch (scanError) {
        console.error(`[Ingest] Compliance scan failed for tradeline ${tradelineId}:`, scanError);
        complianceScanErrors.push(
          `tradeline ${tradelineId}: ${scanError instanceof Error ? scanError.message : String(scanError)}`
        );
      }
    });

    if (complianceScanErrors.length > 0) {
      await failCriticalIngestStage(
        artifactId,
        "compliance_scan_stored",
        new Error(complianceScanErrors.join("; ")),
        "COMPLIANCE_SCAN_PERSISTENCE_FAILED",
      );
    }

    const artifactForViolationRun = await db
      .selectFrom("reportArtifact")
      .select("data")
      .where("id", "=", artifactId)
      .executeTakeFirst();
    const currentData = (artifactForViolationRun?.data ?? {}) as Record<string, unknown>;
    await db
      .updateTable("reportArtifact")
      .set({
        data: JSON.parse(JSON.stringify({
          ...currentData,
          violationReviewRun: {
            sourceReportArtifactId: artifactId,
            tradelineIds: context.tradelineIds,
            persistedViolationIds,
            tradelineCount: context.tradelineIds.length,
            persistedViolationCount: persistedViolationIds.length,
            createdAt: new Date().toISOString(),
          },
        })) as Json,
      })
      .where("id", "=", artifactId)
      .execute();
    await updateIngestStage(artifactId, "compliance_scan_stored", "stored", {
      details: {
        tradelineCount: context.tradelineIds.length,
        persistedViolationCount: persistedViolationIds.length,
      },
    });
  } else {
    await updateIngestStage(artifactId, "compliance_scan_stored", "stored", {
      details: {
        tradelineCount: 0,
        persistedViolationCount: 0,
        skipped: true,
      },
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

            console.log(
              `Dispute workflow instance mutation is reset; recorded drift challenge logs for tradeline ${tradelineId}.`
            );
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
    replayValidation,
  });

  if (silentResults && silentResults.totalDetected > 0) {
    (responseData as unknown as Record<string, unknown>).silentCorrections = silentResults;
  }

  await promoteReportArtifactComplete(artifactId);
  send({ type: "complete", data: responseData });
  await Promise.resolve();
}
