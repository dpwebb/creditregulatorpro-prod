import { sql } from "kysely";

import { logAudit } from "./auditLogger";
import { db } from "./db";
import {
  classifyResponseDocument,
  RESPONSE_CLASSIFIER_PARSER_VERSION,
  RESPONSE_CLASSIFIER_RULE_ID,
  type ResponseClassification,
  type ResponseProcessingResult,
} from "./responseClassificationEngine";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import type {
  BureauResponseChannel,
  BureauResponseDocumentType,
  BureauResponseStatus,
  Json,
} from "./schema";

export const RESPONSE_REPLAY_TOOL_VERSION = "response-processing-replay-2026-05-19" as const;

export type ResponseReplayMode = "dry_run" | "apply";
export type ResponseReplaySourceType = "manual_admin" | "simulated_inbox" | "future_mailbox" | string;

export type ResponseReplayFilters = {
  userId?: number;
  consumerId?: number;
  packetId?: number;
  responseId?: number;
  sourceType?: ResponseReplaySourceType;
  classification?: ResponseClassification;
  manualReviewRequired?: boolean;
  startDate?: Date | string;
  endDate?: Date | string;
  limit?: number;
};

export type ResponseReplayOptions = {
  mode?: ResponseReplayMode;
  filters?: ResponseReplayFilters;
  actorUserId?: number | null;
};

export type ResponseReplayNonReplayableReason =
  | "raw_response_text_not_stored"
  | "missing_sanitized_response_summary";

export type ResponseReplayRecordResult = {
  responseId: number;
  userId: number;
  packetId: number | null;
  sourceType: string;
  responseReceivedAt: string;
  replayable: boolean;
  nonReplayableReason: ResponseReplayNonReplayableReason | null;
  latestProcessingEventId: number | null;
  latestParserVersion: string | null;
  latestClassifierRuleId: string | null;
  latestClassification: ResponseClassification | null;
  replayClassification: ResponseClassification | null;
  replayParserVersion: typeof RESPONSE_CLASSIFIER_PARSER_VERSION | null;
  replayClassifierRuleId: typeof RESPONSE_CLASSIFIER_RULE_ID | null;
  requiresManualReview: boolean;
  uncertaintyCodes: string[];
  staleClassifierMetadata: boolean;
  missingOrMalformedProcessingSummary: boolean;
  wouldAppendProcessingEvent: boolean;
  appendedProcessingEventId: number | null;
};

export type ResponseReplayReasonCount = {
  reason: ResponseReplayNonReplayableReason | "stale_or_missing_classifier_metadata" | "manual_review_required" | "uncertainty";
  count: number;
};

export type ResponseReplayRunResult = {
  mode: ResponseReplayMode;
  generatedAt: string;
  replayToolVersion: typeof RESPONSE_REPLAY_TOOL_VERSION;
  classifierRuleId: typeof RESPONSE_CLASSIFIER_RULE_ID;
  parserVersion: typeof RESPONSE_CLASSIFIER_PARSER_VERSION;
  filters: ResponseReplayFilters;
  totals: {
    scanned: number;
    replayable: number;
    nonReplayable: number;
    staleOrMissingClassifierMetadata: number;
    missingOrMalformedProcessingSummary: number;
    manualReviewRequired: number;
    uncertainty: number;
    wouldAppendProcessingEvents: number;
    appendedProcessingEvents: number;
  };
  reasonCounts: ResponseReplayReasonCount[];
  records: ResponseReplayRecordResult[];
  boundaries: {
    dryRunDefault: boolean;
    applyRequiresExplicitMode: boolean;
    noRawResponseTextStored: true;
    noRawResponseTextLogged: true;
    appendOnlyProcessingEvents: true;
    originalResponseEvidenceMutated: false;
    canonicalFactsMutated: false;
    violationTruthMutated: false;
    packetReadinessMutated: false;
    liveMailboxIntegrationUsed: false;
  };
};

export type ResponseReplayReadinessMetrics = {
  generatedAt: string;
  totalResponseRecords: number;
  replayableRecords: number;
  nonReplayableRecords: number;
  nonReplayableReasonCounts: Array<{ reason: string; count: number }>;
  staleOrMissingClassifierMetadata: number;
  missingProcessingSummary: number;
  manualReviewRequired: number;
  uncertainty: number;
  duplicateAttemptAudits: number;
  lastReplayDryRunAt: string | null;
  lastReplayApplyAt: string | null;
  boundaries: {
    noRawResponseText: true;
    dryRunDoesNotPersist: true;
    applyIsAppendOnly: true;
    liveMailboxIntegrationUsed: false;
  };
};

type ReplayRow = {
  responseId: number;
  userId: number;
  packetId: number | null;
  disputePacketFindingId: number | null;
  findingOutcomeId: number | null;
  comparisonRunId: number | null;
  bureauId: number | null;
  agencyId: number | null;
  tradelineId: number | null;
  violationId: number | null;
  responseChannel: BureauResponseChannel;
  responseDocumentType: BureauResponseDocumentType;
  responseStatus: BureauResponseStatus;
  responseReceivedAt: Date | string;
  responseSource: string;
  responseSubject: string | null;
  responseSenderDomain: string | null;
  responseReferenceId: string | null;
  attachmentEvidenceId: number | null;
  evidenceAttachmentId: number | null;
  normalizedResponseHash: string | null;
  responseSummary: string | null;
  rawArtifactMetadata: Record<string, Json>;
  normalizedResponseMetadata: Record<string, Json>;
  latestProcessingEventId: number | null;
  latestParserVersion: string | null;
  latestClassifierRuleId: string | null;
  latestClassification: ResponseClassification | null;
  latestRequiresManualReview: boolean | null;
  latestUncertaintyCodes: string[];
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredNumber(value: unknown): number {
  const parsed = toNumber(value);
  if (!parsed) throw new Error(`Expected numeric response replay value, received ${String(value)}`);
  return parsed;
}

function jsonRecord(value: unknown): Record<string, Json> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return jsonRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, Json>;
}

function jsonStringArray(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return jsonStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function toBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return value === true || value === "true" || value === 1 || value === "1";
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function normalizedLimit(value: unknown): number {
  const parsed = Number(value ?? 500);
  if (!Number.isFinite(parsed) || parsed <= 0) return 500;
  return Math.min(Math.trunc(parsed), 1000);
}

function normalizeFilters(filters: ResponseReplayFilters | undefined): ResponseReplayFilters {
  return {
    ...filters,
    userId: filters?.consumerId ?? filters?.userId,
    limit: normalizedLimit(filters?.limit),
  };
}

function rowValue(row: any, snakeCaseKey: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, snakeCaseKey)) return row[snakeCaseKey];
  const camelCaseKey = snakeCaseKey.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return row[camelCaseKey];
}

function mapReplayRow(row: any): ReplayRow {
  const rawArtifactMetadata = jsonRecord(rowValue(row, "raw_artifact_metadata"));
  const normalizedResponseMetadata = jsonRecord(rowValue(row, "normalized_response_metadata"));
  return {
    responseId: requiredNumber(rowValue(row, "response_id")),
    userId: requiredNumber(rowValue(row, "user_id")),
    packetId: toNumber(rowValue(row, "packet_id")),
    disputePacketFindingId: toNumber(rowValue(row, "dispute_packet_finding_id")),
    findingOutcomeId: toNumber(rowValue(row, "finding_outcome_id")),
    comparisonRunId: toNumber(rowValue(row, "comparison_run_id")),
    bureauId: toNumber(rowValue(row, "bureau_id")),
    agencyId: toNumber(rowValue(row, "agency_id")),
    tradelineId: toNumber(rowValue(row, "replay_tradeline_id")),
    violationId: toNumber(rowValue(row, "replay_violation_id")),
    responseChannel: rowValue(row, "response_channel") as BureauResponseChannel,
    responseDocumentType: rowValue(row, "response_document_type") as BureauResponseDocumentType,
    responseStatus: rowValue(row, "response_status") as BureauResponseStatus,
    responseReceivedAt: rowValue(row, "response_received_at") as Date | string,
    responseSource: String(rowValue(row, "response_source") ?? "manual_record"),
    responseSubject: (rowValue(row, "response_subject") as string | null | undefined) ?? null,
    responseSenderDomain: (rowValue(row, "response_sender_domain") as string | null | undefined) ?? null,
    responseReferenceId: (rowValue(row, "response_reference_id") as string | null | undefined) ?? null,
    attachmentEvidenceId: toNumber(rowValue(row, "attachment_evidence_id")),
    evidenceAttachmentId: toNumber(rowValue(row, "evidence_attachment_id")),
    normalizedResponseHash: (rowValue(row, "normalized_response_hash") as string | null | undefined) ?? null,
    responseSummary: (rowValue(row, "response_summary") as string | null | undefined) ?? null,
    rawArtifactMetadata,
    normalizedResponseMetadata,
    latestProcessingEventId: toNumber(rowValue(row, "latest_processing_event_id")),
    latestParserVersion: (rowValue(row, "latest_parser_version") as string | null | undefined) ?? null,
    latestClassifierRuleId: (rowValue(row, "latest_classifier_rule_id") as string | null | undefined) ?? null,
    latestClassification: (rowValue(row, "latest_classification") as ResponseClassification | null | undefined) ?? null,
    latestRequiresManualReview: toBool(rowValue(row, "latest_requires_manual_review")),
    latestUncertaintyCodes: jsonStringArray(rowValue(row, "latest_uncertainty_codes")),
  };
}

function intakeSourceType(metadata: Record<string, Json>, responseSource: string): string {
  const intake = jsonRecord(metadata.intake);
  const sourceType = String(intake.sourceType ?? "").trim();
  return sourceType || responseSource;
}

function responseTextWasIntentionallyNotStored(metadata: Record<string, Json>): boolean {
  const intake = jsonRecord(metadata.intake);
  return intake.responseTextStored === false && typeof intake.responseTextHash === "string" && intake.responseTextHash.length > 0;
}

function classifyForReplay(row: ReplayRow): ResponseProcessingResult {
  return classifyResponseDocument({
    responseEventId: row.responseId,
    responseChannel: row.responseChannel,
    responseDocumentType: row.responseDocumentType,
    responseStatus: row.responseStatus,
    responseReceivedAt: row.responseReceivedAt,
    responseSource: row.responseSource,
    responseSubject: row.responseSubject,
    responseSenderDomain: row.responseSenderDomain,
    responseReferenceId: row.responseReferenceId,
    responseSummary: row.responseSummary,
    normalizedResponseHash: row.normalizedResponseHash,
    attachmentEvidenceId: row.attachmentEvidenceId,
    evidenceAttachmentId: row.evidenceAttachmentId,
    rawArtifactMetadata: row.rawArtifactMetadata,
    normalizedResponseMetadata: row.normalizedResponseMetadata,
    relationships: {
      userId: row.userId,
      packetId: row.packetId,
      disputePacketFindingId: row.disputePacketFindingId,
      findingOutcomeId: row.findingOutcomeId,
      comparisonRunId: row.comparisonRunId,
      bureauId: row.bureauId,
      agencyId: row.agencyId,
      tradelineId: row.tradelineId,
      violationId: row.violationId,
    },
  });
}

async function loadReplayRows(filters: ResponseReplayFilters): Promise<ReplayRow[]> {
  const conditions = [sql`true`];
  if (filters.userId !== undefined) conditions.push(sql`bre.user_id = ${filters.userId}`);
  if (filters.packetId !== undefined) conditions.push(sql`bre.packet_id = ${filters.packetId}`);
  if (filters.responseId !== undefined) conditions.push(sql`bre.id = ${filters.responseId}`);
  if (filters.sourceType !== undefined) {
    conditions.push(sql`coalesce(bre.normalized_response_metadata #>> '{intake,sourceType}', bre.response_source) = ${filters.sourceType}`);
  }
  if (filters.classification !== undefined) {
    conditions.push(sql`coalesce(latest.classification, bre.latest_classification) = ${filters.classification}`);
  }
  if (filters.manualReviewRequired !== undefined) {
    conditions.push(sql`coalesce(latest.requires_manual_review, bre.latest_requires_manual_review) = ${filters.manualReviewRequired}`);
  }
  if (filters.startDate !== undefined) conditions.push(sql`bre.response_received_at >= ${new Date(filters.startDate)}`);
  if (filters.endDate !== undefined) conditions.push(sql`bre.response_received_at < ${new Date(filters.endDate)}`);

  const result = await sql<any>`
    with latest as (
      select distinct on (response_event_id) *
      from public.response_processing_event
      order by response_event_id, created_at desc, id desc
    )
    select
      bre.id as response_id,
      bre.user_id,
      bre.packet_id,
      bre.dispute_packet_finding_id,
      bre.finding_outcome_id,
      bre.comparison_run_id,
      bre.bureau_id,
      bre.agency_id,
      coalesce(latest.tradeline_id, dpf.tradeline_id, fo.previous_tradeline_id, p.tradeline_id) as replay_tradeline_id,
      coalesce(latest.violation_id, dpf.creditor_obligation_test_id, fo.creditor_obligation_test_id, p.creditor_obligation_test_id) as replay_violation_id,
      bre.response_channel,
      bre.response_document_type,
      bre.response_status,
      bre.response_received_at,
      bre.response_source,
      bre.response_subject,
      bre.response_sender_domain,
      bre.response_reference_id,
      bre.attachment_evidence_id,
      bre.evidence_attachment_id,
      bre.normalized_response_hash,
      bre.response_summary,
      bre.raw_artifact_metadata,
      bre.normalized_response_metadata,
      latest.id as latest_processing_event_id,
      latest.parser_version as latest_parser_version,
      latest.classifier_rule_id as latest_classifier_rule_id,
      latest.classification as latest_classification,
      latest.requires_manual_review as latest_requires_manual_review,
      latest.uncertainty_codes as latest_uncertainty_codes
    from public.bureau_response_event bre
    left join latest on latest.response_event_id = bre.id
    left join public.dispute_packet_findings dpf on dpf.id = bre.dispute_packet_finding_id
    left join public.finding_outcome fo on fo.id = bre.finding_outcome_id
    left join public.packet p on p.id = bre.packet_id
    where ${sql.join(conditions, sql` and `)}
    order by bre.created_at asc, bre.id asc
    limit ${filters.limit ?? 500}
  `.execute(db);

  return result.rows.map(mapReplayRow);
}

function nonReplayableReason(row: ReplayRow): ResponseReplayNonReplayableReason | null {
  if (String(row.responseSummary ?? "").trim()) return null;
  if (responseTextWasIntentionallyNotStored(row.normalizedResponseMetadata)) return "raw_response_text_not_stored";
  return "missing_sanitized_response_summary";
}

function staleClassifierMetadata(row: ReplayRow): boolean {
  return (
    row.latestProcessingEventId === null ||
    row.latestParserVersion !== RESPONSE_CLASSIFIER_PARSER_VERSION ||
    row.latestClassifierRuleId !== RESPONSE_CLASSIFIER_RULE_ID
  );
}

function missingOrMalformedProcessingSummary(row: ReplayRow): boolean {
  return (
    row.latestProcessingEventId === null ||
    !row.latestParserVersion ||
    !row.latestClassifierRuleId ||
    !row.latestClassification
  );
}

async function appendReplayProcessingEvent(params: {
  row: ReplayRow;
  processing: ResponseProcessingResult;
  actorUserId: number;
  replayedAt: string;
}): Promise<number> {
  const replayMetadata = {
    replay: {
      replayedAt: params.replayedAt,
      replaySource: RESPONSE_REPLAY_TOOL_VERSION,
      replayMode: "apply",
      originalLatestProcessingEventId: params.row.latestProcessingEventId,
      originalParserVersion: params.row.latestParserVersion,
      originalClassifierRuleId: params.row.latestClassifierRuleId,
      responseTextStored: false,
    },
  };
  const normalizedResponseMetadata = {
    ...params.row.normalizedResponseMetadata,
    ...replayMetadata,
  };
  const deterministicExtraction = {
    ...params.processing.deterministicExtraction,
    replayedAt: params.replayedAt,
    replaySource: RESPONSE_REPLAY_TOOL_VERSION,
    replayMode: "apply",
  };

  const result = await sql<{ id: string | number }>`
    insert into public.response_processing_event (
      response_event_id,
      user_id,
      packet_id,
      dispute_packet_finding_id,
      finding_outcome_id,
      comparison_run_id,
      bureau_id,
      agency_id,
      tradeline_id,
      violation_id,
      processing_kind,
      processing_status,
      extraction_source,
      classifier_rule_id,
      parser_version,
      classification,
      classification_confidence,
      confidence_threshold,
      requires_manual_review,
      uncertainty_codes,
      raw_artifact_metadata,
      normalized_response_metadata,
      deterministic_extraction,
      field_provenance,
      rationale,
      regulation_references,
      readiness_impact,
      violation_impact,
      idempotency_key,
      normalized_response_hash,
      original_evidence_hash,
      fallback_requested,
      fallback_allowed,
      fallback_reason,
      dead_letter_reason,
      created_by
    ) values (
      ${params.row.responseId},
      ${params.row.userId},
      ${params.row.packetId},
      ${params.row.disputePacketFindingId},
      ${params.row.findingOutcomeId},
      ${params.row.comparisonRunId},
      ${params.row.bureauId},
      ${params.row.agencyId},
      ${params.row.tradelineId},
      ${params.row.violationId},
      ${params.processing.processingKind},
      ${params.processing.processingStatus},
      ${params.processing.extractionSource},
      ${params.processing.classifierRuleId},
      ${params.processing.parserVersion},
      ${params.processing.classification},
      ${params.processing.classificationConfidence},
      ${params.processing.confidenceThreshold},
      ${params.processing.requiresManualReview},
      ${JSON.stringify(params.processing.uncertaintyCodes)}::jsonb,
      ${JSON.stringify(params.row.rawArtifactMetadata)}::jsonb,
      ${JSON.stringify(normalizedResponseMetadata)}::jsonb,
      ${JSON.stringify(deterministicExtraction)}::jsonb,
      ${JSON.stringify(params.processing.fieldProvenance)}::jsonb,
      ${JSON.stringify(params.processing.rationale)}::jsonb,
      ${JSON.stringify(params.processing.regulationReferences)}::jsonb,
      ${JSON.stringify(params.processing.readinessImpact)}::jsonb,
      ${JSON.stringify(params.processing.violationImpact)}::jsonb,
      ${`${params.processing.idempotencyKey}:replay:${params.replayedAt}:${params.row.responseId}`},
      ${params.processing.normalizedResponseHash},
      ${params.processing.originalEvidenceHash},
      ${params.processing.fallbackRequested},
      ${params.processing.fallbackAllowed},
      ${params.processing.fallbackReason},
      ${params.processing.deadLetterReason},
      ${params.actorUserId}
    )
    returning id
  `.execute(db);

  return requiredNumber(result.rows[0]?.id);
}

async function auditReplayApply(params: {
  row: ReplayRow;
  processing: ResponseProcessingResult;
  actorUserId: number;
  appendedProcessingEventId: number;
  replayedAt: string;
}): Promise<void> {
  const audit = await logAudit({
    action: "RESPONSE_RECORDED",
    entityType: "SYSTEM",
    entityId: params.row.responseId,
    userId: params.actorUserId,
    details: {
      component: "response_replay_backfill",
      action: "response_processing_replay_applied",
      responseId: params.row.responseId,
      previousProcessingEventId: params.row.latestProcessingEventId,
      appendOnlyProcessingEventId: params.appendedProcessingEventId,
      replayMode: "apply",
      replaySource: RESPONSE_REPLAY_TOOL_VERSION,
      replayedAt: params.replayedAt,
      parserVersion: params.processing.parserVersion,
      classifierRuleId: params.processing.classifierRuleId,
      classification: params.processing.classification,
      requiresManualReview: params.processing.requiresManualReview,
      uncertaintyCodes: params.processing.uncertaintyCodes,
      rawResponseTextLogged: false,
      responseTextStored: false,
      originalResponseEvidenceMutated: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadyStateChanged: false,
      liveMailboxIntegrationUsed: false,
    },
    status: "SUCCESS",
  });

  if (!audit.success) {
    throw new Error("Response replay audit log write failed.");
  }
}

function incrementReason(reasons: Map<ResponseReplayReasonCount["reason"], number>, reason: ResponseReplayReasonCount["reason"]): void {
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
}

export async function runResponseProcessingReplay(options: ResponseReplayOptions = {}): Promise<ResponseReplayRunResult> {
  await ensureResponseDocumentSchema();
  const mode = options.mode ?? "dry_run";
  if (mode === "apply" && (!Number.isInteger(options.actorUserId) || Number(options.actorUserId) <= 0)) {
    throw new Error("Response replay apply mode requires a positive actorUserId.");
  }

  const filters = normalizeFilters(options.filters);
  const rows = await loadReplayRows(filters);
  const generatedAt = new Date().toISOString();
  const reasonCounts = new Map<ResponseReplayReasonCount["reason"], number>();
  const records: ResponseReplayRecordResult[] = [];

  for (const row of rows) {
    const reason = nonReplayableReason(row);
    const replayable = reason === null;
    const stale = staleClassifierMetadata(row);
    const malformed = missingOrMalformedProcessingSummary(row);
    if (reason) incrementReason(reasonCounts, reason);
    if (stale) incrementReason(reasonCounts, "stale_or_missing_classifier_metadata");

    let processing: ResponseProcessingResult | null = null;
    let appendedProcessingEventId: number | null = null;
    if (replayable) {
      processing = classifyForReplay(row);
      if (processing.requiresManualReview) incrementReason(reasonCounts, "manual_review_required");
      if (processing.uncertaintyCodes.length > 0) incrementReason(reasonCounts, "uncertainty");
      if (mode === "apply") {
        appendedProcessingEventId = await appendReplayProcessingEvent({
          row,
          processing,
          actorUserId: Number(options.actorUserId),
          replayedAt: generatedAt,
        });
        await auditReplayApply({
          row,
          processing,
          actorUserId: Number(options.actorUserId),
          appendedProcessingEventId,
          replayedAt: generatedAt,
        });
      }
    }

    records.push({
      responseId: row.responseId,
      userId: row.userId,
      packetId: row.packetId,
      sourceType: intakeSourceType(row.normalizedResponseMetadata, row.responseSource),
      responseReceivedAt: toIso(row.responseReceivedAt),
      replayable,
      nonReplayableReason: reason,
      latestProcessingEventId: row.latestProcessingEventId,
      latestParserVersion: row.latestParserVersion,
      latestClassifierRuleId: row.latestClassifierRuleId,
      latestClassification: row.latestClassification,
      replayClassification: processing?.classification ?? null,
      replayParserVersion: processing?.parserVersion ?? null,
      replayClassifierRuleId: processing?.classifierRuleId ?? null,
      requiresManualReview: processing?.requiresManualReview ?? row.latestRequiresManualReview ?? true,
      uncertaintyCodes: processing?.uncertaintyCodes ?? row.latestUncertaintyCodes,
      staleClassifierMetadata: stale,
      missingOrMalformedProcessingSummary: malformed,
      wouldAppendProcessingEvent: replayable,
      appendedProcessingEventId,
    });
  }

  const totals = {
    scanned: records.length,
    replayable: records.filter((record) => record.replayable).length,
    nonReplayable: records.filter((record) => !record.replayable).length,
    staleOrMissingClassifierMetadata: records.filter((record) => record.staleClassifierMetadata).length,
    missingOrMalformedProcessingSummary: records.filter((record) => record.missingOrMalformedProcessingSummary).length,
    manualReviewRequired: records.filter((record) => record.requiresManualReview).length,
    uncertainty: records.filter((record) => record.uncertaintyCodes.length > 0).length,
    wouldAppendProcessingEvents: records.filter((record) => record.wouldAppendProcessingEvent).length,
    appendedProcessingEvents: records.filter((record) => record.appendedProcessingEventId !== null).length,
  };

  return {
    mode,
    generatedAt,
    replayToolVersion: RESPONSE_REPLAY_TOOL_VERSION,
    classifierRuleId: RESPONSE_CLASSIFIER_RULE_ID,
    parserVersion: RESPONSE_CLASSIFIER_PARSER_VERSION,
    filters,
    totals,
    reasonCounts: Array.from(reasonCounts.entries()).map(([reason, count]) => ({ reason, count })),
    records,
    boundaries: {
      dryRunDefault: true,
      applyRequiresExplicitMode: true,
      noRawResponseTextStored: true,
      noRawResponseTextLogged: true,
      appendOnlyProcessingEvents: true,
      originalResponseEvidenceMutated: false,
      canonicalFactsMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
      liveMailboxIntegrationUsed: false,
    },
  };
}

export async function getResponseReplayReadinessMetrics(): Promise<ResponseReplayReadinessMetrics> {
  await ensureResponseDocumentSchema();
  const result = await sql<any>`
    with latest as (
      select distinct on (response_event_id) *
      from public.response_processing_event
      order by response_event_id, created_at desc, id desc
    ),
    base as (
      select
        bre.id,
        bre.response_summary,
        bre.normalized_response_metadata,
        latest.id as latest_processing_event_id,
        latest.parser_version,
        latest.classifier_rule_id,
        latest.classification,
        latest.requires_manual_review,
        latest.uncertainty_codes
      from public.bureau_response_event bre
      left join latest on latest.response_event_id = bre.id
    ),
    duplicate_audits as (
      select count(*)::int as duplicate_attempt_audits
      from public.audit_log
      where entity_type = 'SYSTEM'
        and details ->> 'action' = 'response_intake_duplicate'
    ),
    replay_audits as (
      select
        max(case when details ->> 'action' = 'response_processing_replay_applied' then timestamp else null end) as last_replay_apply_at
      from public.audit_log
      where entity_type = 'SYSTEM'
        and details ->> 'component' = 'response_replay_backfill'
    )
    select
      count(*)::int as total_response_records,
      coalesce(sum(case when nullif(trim(coalesce(response_summary, '')), '') is not null then 1 else 0 end), 0)::int as replayable_records,
      coalesce(sum(case when nullif(trim(coalesce(response_summary, '')), '') is null then 1 else 0 end), 0)::int as non_replayable_records,
      coalesce(sum(case when nullif(trim(coalesce(response_summary, '')), '') is null
        and normalized_response_metadata #>> '{intake,responseTextStored}' = 'false'
        and nullif(normalized_response_metadata #>> '{intake,responseTextHash}', '') is not null
        then 1 else 0 end), 0)::int as raw_response_text_not_stored,
      coalesce(sum(case when nullif(trim(coalesce(response_summary, '')), '') is null
        and not (
          normalized_response_metadata #>> '{intake,responseTextStored}' = 'false'
          and nullif(normalized_response_metadata #>> '{intake,responseTextHash}', '') is not null
        )
        then 1 else 0 end), 0)::int as missing_sanitized_response_summary,
      coalesce(sum(case when latest_processing_event_id is null
        or parser_version is distinct from ${RESPONSE_CLASSIFIER_PARSER_VERSION}
        or classifier_rule_id is distinct from ${RESPONSE_CLASSIFIER_RULE_ID}
        then 1 else 0 end), 0)::int as stale_or_missing_classifier_metadata,
      coalesce(sum(case when latest_processing_event_id is null
        or parser_version is null
        or classifier_rule_id is null
        or classification is null
        then 1 else 0 end), 0)::int as missing_processing_summary,
      coalesce(sum(case when requires_manual_review = true then 1 else 0 end), 0)::int as manual_review_required,
      coalesce(sum(case when classification = 'unknown_manual_review'
        or (jsonb_typeof(uncertainty_codes) = 'array' and jsonb_array_length(uncertainty_codes) > 0)
        then 1 else 0 end), 0)::int as uncertainty,
      (select duplicate_attempt_audits from duplicate_audits)::int as duplicate_attempt_audits,
      (select last_replay_apply_at from replay_audits) as last_replay_apply_at
    from base
  `.execute(db);

  const row = result.rows[0] ?? {};
  const rawNotStored = Number(rowValue(row, "raw_response_text_not_stored") ?? 0);
  const missingSummary = Number(rowValue(row, "missing_sanitized_response_summary") ?? 0);
  return {
    generatedAt: new Date().toISOString(),
    totalResponseRecords: Number(rowValue(row, "total_response_records") ?? 0),
    replayableRecords: Number(rowValue(row, "replayable_records") ?? 0),
    nonReplayableRecords: Number(rowValue(row, "non_replayable_records") ?? 0),
    nonReplayableReasonCounts: [
      { reason: "raw_response_text_not_stored", count: rawNotStored },
      { reason: "missing_sanitized_response_summary", count: missingSummary },
    ].filter((item) => item.count > 0),
    staleOrMissingClassifierMetadata: Number(rowValue(row, "stale_or_missing_classifier_metadata") ?? 0),
    missingProcessingSummary: Number(rowValue(row, "missing_processing_summary") ?? 0),
    manualReviewRequired: Number(rowValue(row, "manual_review_required") ?? 0),
    uncertainty: Number(rowValue(row, "uncertainty") ?? 0),
    duplicateAttemptAudits: Number(rowValue(row, "duplicate_attempt_audits") ?? 0),
    lastReplayDryRunAt: null,
    lastReplayApplyAt: rowValue(row, "last_replay_apply_at") ? toIso(rowValue(row, "last_replay_apply_at") as Date | string) : null,
    boundaries: {
      noRawResponseText: true,
      dryRunDoesNotPersist: true,
      applyIsAppendOnly: true,
      liveMailboxIntegrationUsed: false,
    },
  };
}
