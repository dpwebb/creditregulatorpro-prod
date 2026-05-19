import { sql } from "kysely";

import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { ensureResponseDocumentSchema } from "./responseDocumentSchema";
import type { ResponseDocumentUser } from "./responseDocumentService";
import { getResponseReplayReadinessMetrics, type ResponseReplayReadinessMetrics } from "./responseReplayService";
import type { Json } from "./schema";

export type ResponseProcessingMetricAlert = {
  key:
    | "parser_failure_spike"
    | "ocr_fallback_spike"
    | "classification_uncertainty"
    | "ingestion_dead_letters"
    | "readiness_regression"
    | "suspicious_response_patterns"
    | "repeated_parser_mismatches"
    | "workflow_stalls";
  severity: "info" | "warning" | "critical";
  active: boolean;
  count: number;
  threshold: number;
  message: string;
};

export type ResponseProcessingMetrics = {
  lookbackHours: number;
  generatedAt: string;
  totals: {
    processed: number;
    completed: number;
    manualReview: number;
    unknownManualReview: number;
    suspicious: number;
    deadLetters: number;
    failed: number;
    fallbackRequested: number;
    fallbackAllowed: number;
    ocrFallback: number;
    readinessRegression: number;
    repeatedParserMismatch: number;
    workflowStalls: number;
  };
  classificationCounts: Array<{ classification: string; count: number }>;
  alerts: ResponseProcessingMetricAlert[];
  replayReadiness: ResponseReplayReadinessMetrics;
  boundaries: {
    redacted: true;
    structuredOnly: true;
    noRawResponseText: true;
    noCanonicalMutation: true;
    noPacketReadinessMutation: true;
  };
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function alert(params: Omit<ResponseProcessingMetricAlert, "active">): ResponseProcessingMetricAlert {
  return {
    ...params,
    active: params.count >= params.threshold,
  };
}

export async function getResponseProcessingMetrics(
  input: { lookbackHours?: number } | undefined,
  user: ResponseDocumentUser,
): Promise<ResponseProcessingMetrics> {
  await ensureResponseDocumentSchema();
  if (user.role !== "admin") throw new BusinessRuleError("Admin privileges required", 403);

  const lookbackHours = Math.min(Math.max(Number(input?.lookbackHours ?? 24), 1), 168);
  const summaryResult = await sql<any>`
    with windowed as (
      select *
      from public.response_processing_event
      where created_at >= now() - make_interval(hours => ${lookbackHours})
    ),
    stalls as (
      select count(*)::int as workflow_stalls
      from public.bureau_response_event
      where created_at < now() - make_interval(hours => 24)
        and response_status in ('received', 'needs_review')
        and latest_requires_manual_review = true
    )
    select
      count(*)::int as processed,
      coalesce(sum(case when processing_status = 'completed' then 1 else 0 end), 0)::int as completed,
      coalesce(sum(case when requires_manual_review = true then 1 else 0 end), 0)::int as manual_review,
      coalesce(sum(case when classification = 'unknown_manual_review' then 1 else 0 end), 0)::int as unknown_manual_review,
      coalesce(sum(case when classification = 'suspicious_non_compliant' then 1 else 0 end), 0)::int as suspicious,
      coalesce(sum(case when processing_status = 'dead_letter' then 1 else 0 end), 0)::int as dead_letters,
      coalesce(sum(case when processing_status = 'failed' then 1 else 0 end), 0)::int as failed,
      coalesce(sum(case when fallback_requested = true then 1 else 0 end), 0)::int as fallback_requested,
      coalesce(sum(case when fallback_allowed = true then 1 else 0 end), 0)::int as fallback_allowed,
      coalesce(sum(case when lower(coalesce(raw_artifact_metadata ->> 'ocrFallbackUsed', '')) = 'true'
        or lower(coalesce(raw_artifact_metadata ->> 'ocr_fallback_used', '')) = 'true'
        or uncertainty_codes ? 'OCR_FALLBACK_USED'
        or uncertainty_codes::text ilike '%OCR_FALLBACK_USED%'
        then 1 else 0 end), 0)::int as ocr_fallback,
      coalesce(sum(case when readiness_impact ->> 'readinessRegression' = 'true' then 1 else 0 end), 0)::int as readiness_regression,
      coalesce(sum(case when uncertainty_codes ? 'REPEATED_PARSER_MISMATCH' then 1 else 0 end), 0)::int as repeated_parser_mismatch,
      (select workflow_stalls from stalls)::int as workflow_stalls
    from windowed
  `.execute(db);

  const row = summaryResult.rows[0] ?? {};
  const totals = {
    processed: toNumber(row.processed),
    completed: toNumber(row.completed),
    manualReview: toNumber(row.manual_review ?? row.manualReview),
    unknownManualReview: toNumber(row.unknown_manual_review ?? row.unknownManualReview),
    suspicious: toNumber(row.suspicious),
    deadLetters: toNumber(row.dead_letters ?? row.deadLetters),
    failed: toNumber(row.failed),
    fallbackRequested: toNumber(row.fallback_requested ?? row.fallbackRequested),
    fallbackAllowed: toNumber(row.fallback_allowed ?? row.fallbackAllowed),
    ocrFallback: toNumber(row.ocr_fallback ?? row.ocrFallback),
    readinessRegression: toNumber(row.readiness_regression ?? row.readinessRegression),
    repeatedParserMismatch: toNumber(row.repeated_parser_mismatch ?? row.repeatedParserMismatch),
    workflowStalls: toNumber(row.workflow_stalls ?? row.workflowStalls),
  };

  const countsResult = await sql<any>`
    select classification, count(*)::int as count
    from public.response_processing_event
    where created_at >= now() - make_interval(hours => ${lookbackHours})
    group by classification
    order by count desc, classification asc
  `.execute(db);

  const alerts: ResponseProcessingMetricAlert[] = [
    alert({
      key: "parser_failure_spike",
      severity: "critical",
      count: totals.failed,
      threshold: 3,
      message: "Deterministic response parser failures crossed the review threshold.",
    }),
    alert({
      key: "ocr_fallback_spike",
      severity: "warning",
      count: totals.ocrFallback,
      threshold: 5,
      message: "OCR fallback usage crossed the review threshold for response artifacts.",
    }),
    alert({
      key: "classification_uncertainty",
      severity: "warning",
      count: totals.manualReview,
      threshold: 5,
      message: "Manual-review response classifications crossed the review threshold.",
    }),
    alert({
      key: "ingestion_dead_letters",
      severity: "critical",
      count: totals.deadLetters,
      threshold: 1,
      message: "Response ingestion dead letters require operator review.",
    }),
    alert({
      key: "readiness_regression",
      severity: "critical",
      count: totals.readinessRegression,
      threshold: 1,
      message: "A response-processing event reported readiness regression.",
    }),
    alert({
      key: "suspicious_response_patterns",
      severity: "warning",
      count: totals.suspicious,
      threshold: 1,
      message: "Suspicious response patterns are present and should remain in manual review.",
    }),
    alert({
      key: "repeated_parser_mismatches",
      severity: "warning",
      count: totals.repeatedParserMismatch,
      threshold: 1,
      message: "Repeated parser mismatches require replay and rule review.",
    }),
    alert({
      key: "workflow_stalls",
      severity: "warning",
      count: totals.workflowStalls,
      threshold: 1,
      message: "Response workflows have unresolved manual-review records older than 24 hours.",
    }),
  ];
  const replayReadiness = await getResponseReplayReadinessMetrics();

  return {
    lookbackHours,
    generatedAt: new Date().toISOString(),
    totals,
    classificationCounts: countsResult.rows.map((countRow) => ({
      classification: String(countRow.classification),
      count: toNumber(countRow.count),
    })),
    alerts,
    replayReadiness,
    boundaries: {
      redacted: true,
      structuredOnly: true,
      noRawResponseText: true,
      noCanonicalMutation: true,
      noPacketReadinessMutation: true,
    } satisfies Record<string, Json>,
  };
}
