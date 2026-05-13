import { createHash } from "node:crypto";
import { sql, type Selectable } from "kysely";

import { db } from "./db";
import { logAudit } from "./auditLogger";
import { BusinessRuleError } from "./endpointErrorHandler";
import type {
  Json,
  RegulationReconciliationCandidate,
  RegulationReconciliationCandidateReviewStatus,
  RegulationReconciliationCandidateSeverity,
  RegulationReconciliationCandidateSourceFindingType,
  RegulationReconciliationCandidateType,
} from "./schema";
import type {
  RegulationReferenceMismatchType,
  RegulationReferenceReconciliationFinding,
} from "./regulationReferenceReconciliation";

export const RECONCILIATION_CANDIDATE_REVIEW_STATUSES: RegulationReconciliationCandidateReviewStatus[] = [
  "pending_review",
  "needs_source",
  "needs_admin_decision",
  "approved_for_mapping_review",
  "approved_for_registry_update",
  "rejected",
  "superseded",
  "archived",
];

const APPROVAL_REVIEW_STATUSES = new Set<RegulationReconciliationCandidateReviewStatus>([
  "approved_for_mapping_review",
  "approved_for_registry_update",
]);

const FINDING_TO_CANDIDATE_TYPE: Record<
  RegulationReferenceMismatchType,
  RegulationReconciliationCandidateType
> = {
  missing_db_registry_record: "missing_db_registry_record_candidate",
  missing_static_reference: "missing_static_reference_candidate",
  citation_mismatch: "citation_mismatch_candidate",
  jurisdiction_mismatch: "jurisdiction_mismatch_candidate",
  source_url_missing: "source_url_missing_candidate",
  effective_date_missing: "effective_date_missing_candidate",
  approval_status_missing: "approval_status_missing_candidate",
  title_mismatch: "title_mismatch_candidate",
  category_mismatch: "category_mismatch_candidate",
  unclear_mapping: "unclear_mapping_candidate",
  consumer_wording_risk: "consumer_wording_risk_candidate",
};

type JsonLike = Json | null;

export type ReconciliationFindingCandidateInput = RegulationReferenceReconciliationFinding & {
  candidateType?: RegulationReconciliationCandidateType;
  dbMappingId?: number | null;
  deterministicRuleId?: string | null;
  jurisdiction?: string | null;
  category?: string | null;
  oldValue?: unknown;
  proposedValue?: unknown;
  sourceUrl?: string | null;
  citation?: string | null;
  effectiveDate?: string | Date | null;
  staticSnapshotHash?: string | null;
  dbSnapshotHash?: string | null;
  reconciliationRunId?: string | null;
};

export type CreateReconciliationCandidatesInput = {
  findings: ReconciliationFindingCandidateInput[];
  adminUserId?: number | null;
  reconciliationRunId?: string | null;
  request?: Request;
};

export type CreateReconciliationCandidatesResult = {
  createdCandidates: Selectable<RegulationReconciliationCandidate>[];
  existingCandidates: Selectable<RegulationReconciliationCandidate>[];
};

export type ReconciliationCandidateListFilters = {
  candidateType?: RegulationReconciliationCandidateType;
  severity?: RegulationReconciliationCandidateSeverity;
  reviewStatus?: RegulationReconciliationCandidateReviewStatus;
  staticReferenceId?: string;
  dbRegulationId?: string;
  deterministicRuleId?: string;
  reconciliationRunId?: string;
  includeSnapshotData?: boolean;
};

export type UpdateReconciliationCandidateStatusInput = {
  candidateId: number;
  reviewStatus: RegulationReconciliationCandidateReviewStatus;
  adminUserId: number;
  reviewNotes?: string | null;
  rejectedReason?: string | null;
  supersedesCandidateId?: number | null;
  request?: Request;
};

let ensurePromise: Promise<void> | null = null;

async function createRegulationReconciliationCandidateSchema(): Promise<void> {
  await sql`
    create table if not exists public.regulation_reconciliation_candidate (
      id bigserial primary key,
      candidate_type text not null,
      source_finding_type text not null,
      static_reference_id text null,
      db_regulation_id text null,
      db_mapping_id bigint null,
      deterministic_rule_id text null,
      jurisdiction text null,
      category text null,
      mismatch_summary text not null,
      old_value jsonb null,
      proposed_value jsonb null,
      source_url text null,
      citation text null,
      effective_date timestamptz null,
      static_snapshot_hash text null,
      db_snapshot_hash text null,
      reconciliation_run_id text null,
      mismatch_hash text not null,
      dedupe_key text not null,
      severity text not null,
      review_status text not null default 'pending_review',
      active_status text not null default 'inert',
      created_at timestamptz not null default now(),
      created_by bigint null references public.users(id) on delete set null,
      reviewed_at timestamptz null,
      reviewed_by bigint null references public.users(id) on delete set null,
      review_notes text null,
      rejected_reason text null,
      supersedes_candidate_id bigint null references public.regulation_reconciliation_candidate(id) on delete set null,
      updated_at timestamptz not null default now(),
      constraint regulation_reconciliation_candidate_dedupe_unique unique(dedupe_key),
      constraint regulation_reconciliation_candidate_inert_check check(active_status = 'inert')
    )
  `.execute(db);

  await sql`create index if not exists idx_regulation_reconciliation_candidate_type on public.regulation_reconciliation_candidate(candidate_type)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_review_status on public.regulation_reconciliation_candidate(review_status)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_severity on public.regulation_reconciliation_candidate(severity)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_static_reference on public.regulation_reconciliation_candidate(static_reference_id)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_db_regulation on public.regulation_reconciliation_candidate(db_regulation_id)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_db_mapping on public.regulation_reconciliation_candidate(db_mapping_id)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_rule on public.regulation_reconciliation_candidate(deterministic_rule_id)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_created_at on public.regulation_reconciliation_candidate(created_at)`.execute(db);
  await sql`create index if not exists idx_regulation_reconciliation_run on public.regulation_reconciliation_candidate(reconciliation_run_id)`.execute(db);
}

export function ensureRegulationReconciliationCandidateSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = createRegulationReconciliationCandidateSchema().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

function cleanString(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toEffectiveDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|account.?number|full.?account|member.?number|packet|raw.?text|raw.?extracted|extracted.?text|credit.?report|source.?text|consumer.?personal|dob|date.?of.?birth)/i;

const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}\b/gi;
const LONG_NUMBER_PATTERN = /\b\d{9,}\b/g;
const MAX_SANITIZE_DEPTH = 8;

function redactSensitiveText(value: string): string {
  return value
    .replace(SIN_PATTERN, "[redacted SIN]")
    .replace(ACCOUNT_PHRASE_PATTERN, "[redacted account]")
    .replace(LONG_NUMBER_PATTERN, (match) => `...${match.slice(-4)}`);
}

function sanitizeValue(value: unknown, depth: number, parentKey?: string): JsonLike | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (depth > MAX_SANITIZE_DEPTH) return "[truncated]";

  if (parentKey && SENSITIVE_KEY_PATTERN.test(parentKey)) {
    return "[redacted]";
  }

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item, depth + 1, parentKey))
      .filter((item): item is Json => item !== undefined);
  }

  if (typeof value === "object") {
    const output: Record<string, Json> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue;
      const sanitized = sanitizeValue(nestedValue, depth + 1, key);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }

  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function sanitizeReconciliationCandidatePayload(input: unknown): JsonLike {
  const sanitized = sanitizeValue(input, 0);
  return sanitized === undefined ? null : sanitized;
}

function stableForHash(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableForHash);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableForHash(nestedValue)]),
    );
  }
  return value ?? null;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stableForHash(value))).digest("hex");
}

function candidateTypeForFinding(input: ReconciliationFindingCandidateInput): RegulationReconciliationCandidateType {
  return input.candidateType ?? FINDING_TO_CANDIDATE_TYPE[input.mismatchType];
}

function buildMismatchHash(input: {
  finding: ReconciliationFindingCandidateInput;
  candidateType: RegulationReconciliationCandidateType;
  oldValue: JsonLike;
  proposedValue: JsonLike;
  reconciliationRunId: string | null;
}): string {
  return hashJson({
    candidateType: input.candidateType,
    sourceFindingType: input.finding.mismatchType,
    staticReferenceId: cleanString(input.finding.staticReferenceId),
    dbRegulationId: cleanString(input.finding.dbRegulationId),
    dbMappingId: input.finding.dbMappingId ?? null,
    deterministicRuleId: cleanString(input.finding.deterministicRuleId),
    jurisdiction: cleanString(input.finding.jurisdiction),
    category: cleanString(input.finding.category),
    mismatchSummary: input.finding.message,
    oldValue: input.oldValue,
    proposedValue: input.proposedValue,
    sourceUrl: cleanString(input.finding.sourceUrl),
    citation: cleanString(input.finding.citation),
    effectiveDate: toEffectiveDate(input.finding.effectiveDate)?.toISOString() ?? null,
    staticSnapshotHash: cleanString(input.finding.staticSnapshotHash),
    dbSnapshotHash: cleanString(input.finding.dbSnapshotHash),
  });
}

function buildDedupeKey(input: {
  candidateType: RegulationReconciliationCandidateType;
  finding: ReconciliationFindingCandidateInput;
  mismatchHash: string;
}): string {
  return [
    input.candidateType,
    cleanString(input.finding.staticReferenceId) ?? "",
    cleanString(input.finding.dbRegulationId) ?? "",
    input.finding.dbMappingId ?? "",
    cleanString(input.finding.deterministicRuleId) ?? "",
    input.mismatchHash,
  ].join("|");
}

async function auditCandidateAction(input: {
  mode: string;
  candidate: Selectable<RegulationReconciliationCandidate>;
  oldStatus?: RegulationReconciliationCandidateReviewStatus | null;
  newStatus?: RegulationReconciliationCandidateReviewStatus | null;
  actorUserId?: number | null;
  notes?: string | null;
  reason?: string | null;
  request?: Request;
}) {
  await logAudit({
    action: input.mode.includes("created") ? "CREATE" : "UPDATE",
    entityType: "REGULATORY_UPDATE",
    entityId: input.candidate.id,
    userId: input.actorUserId ?? null,
    details: {
      component: "regulation_reconciliation_candidate",
      mode: input.mode,
      candidateId: input.candidate.id,
      candidateType: input.candidate.candidateType,
      sourceFindingType: input.candidate.sourceFindingType,
      oldStatus: input.oldStatus ?? null,
      newStatus: input.newStatus ?? input.candidate.reviewStatus,
      severity: input.candidate.severity,
      mismatchHash: input.candidate.mismatchHash,
      reconciliationRunId: input.candidate.reconciliationRunId,
      actor: input.actorUserId ?? null,
      notes: input.notes ?? null,
      reason: input.reason ?? null,
    },
    status: "SUCCESS",
    request: input.request,
  });
}

export async function createReconciliationCandidatesFromFindings(
  input: CreateReconciliationCandidatesInput,
): Promise<CreateReconciliationCandidatesResult> {
  await ensureRegulationReconciliationCandidateSchema();

  const result: CreateReconciliationCandidatesResult = {
    createdCandidates: [],
    existingCandidates: [],
  };

  for (const finding of input.findings) {
    const candidateType = candidateTypeForFinding(finding);
    const reconciliationRunId = cleanString(finding.reconciliationRunId) ?? cleanString(input.reconciliationRunId);
    const oldValue = sanitizeReconciliationCandidatePayload(finding.oldValue ?? null);
    const proposedValue = sanitizeReconciliationCandidatePayload(
      finding.proposedValue ?? { recommendedAction: finding.recommendedAction },
    );
    const mismatchHash = buildMismatchHash({
      finding,
      candidateType,
      oldValue,
      proposedValue,
      reconciliationRunId,
    });
    const dedupeKey = buildDedupeKey({ candidateType, finding, mismatchHash });

    const inserted = await db
      .insertInto("regulationReconciliationCandidate")
      .values({
        candidateType,
        sourceFindingType: finding.mismatchType as RegulationReconciliationCandidateSourceFindingType,
        staticReferenceId: cleanString(finding.staticReferenceId),
        dbRegulationId: cleanString(finding.dbRegulationId),
        dbMappingId: finding.dbMappingId ?? null,
        deterministicRuleId: cleanString(finding.deterministicRuleId),
        jurisdiction: cleanString(finding.jurisdiction),
        category: cleanString(finding.category),
        mismatchSummary: finding.message,
        oldValue: oldValue as any,
        proposedValue: proposedValue as any,
        sourceUrl: cleanString(finding.sourceUrl),
        citation: cleanString(finding.citation),
        effectiveDate: toEffectiveDate(finding.effectiveDate),
        staticSnapshotHash: cleanString(finding.staticSnapshotHash),
        dbSnapshotHash: cleanString(finding.dbSnapshotHash),
        reconciliationRunId,
        mismatchHash,
        dedupeKey,
        severity: finding.severity,
        reviewStatus: "pending_review",
        activeStatus: "inert",
        createdBy: input.adminUserId ?? null,
      })
      .onConflict((oc) => oc.column("dedupeKey").doNothing())
      .returningAll()
      .executeTakeFirst();

    if (inserted) {
      result.createdCandidates.push(inserted);
      await auditCandidateAction({
        mode: "reconciliation_candidate_created",
        candidate: inserted,
        newStatus: inserted.reviewStatus,
        actorUserId: input.adminUserId ?? null,
        request: input.request,
      });
      continue;
    }

    const existing = await db
      .selectFrom("regulationReconciliationCandidate")
      .selectAll()
      .where("dedupeKey", "=", dedupeKey)
      .executeTakeFirstOrThrow();
    result.existingCandidates.push(existing);
    await auditCandidateAction({
      mode: "reconciliation_candidate_existing_reused",
      candidate: existing,
      oldStatus: existing.reviewStatus,
      newStatus: existing.reviewStatus,
      actorUserId: input.adminUserId ?? null,
      request: input.request,
    });
  }

  return result;
}

export async function listRegulationReconciliationCandidates(filters: ReconciliationCandidateListFilters = {}) {
  await ensureRegulationReconciliationCandidateSchema();

  const baseColumns = [
    "id",
    "candidateType",
    "sourceFindingType",
    "staticReferenceId",
    "dbRegulationId",
    "dbMappingId",
    "deterministicRuleId",
    "jurisdiction",
    "category",
    "mismatchSummary",
    "sourceUrl",
    "citation",
    "effectiveDate",
    "staticSnapshotHash",
    "dbSnapshotHash",
    "reconciliationRunId",
    "mismatchHash",
    "dedupeKey",
    "severity",
    "reviewStatus",
    "activeStatus",
    "createdAt",
    "createdBy",
    "reviewedAt",
    "reviewedBy",
    "reviewNotes",
    "rejectedReason",
    "supersedesCandidateId",
    "updatedAt",
  ] as const;

  const columns = filters.includeSnapshotData
    ? [...baseColumns, "oldValue", "proposedValue"] as const
    : baseColumns;

  let query = db.selectFrom("regulationReconciliationCandidate").select(columns as any);

  if (filters.candidateType) query = query.where("candidateType", "=", filters.candidateType);
  if (filters.severity) query = query.where("severity", "=", filters.severity);
  if (filters.reviewStatus) query = query.where("reviewStatus", "=", filters.reviewStatus);
  if (filters.staticReferenceId) query = query.where("staticReferenceId", "=", filters.staticReferenceId);
  if (filters.dbRegulationId) query = query.where("dbRegulationId", "=", filters.dbRegulationId);
  if (filters.deterministicRuleId) query = query.where("deterministicRuleId", "=", filters.deterministicRuleId);
  if (filters.reconciliationRunId) query = query.where("reconciliationRunId", "=", filters.reconciliationRunId);

  return await query.orderBy("createdAt", "desc").limit(300).execute();
}

function auditModeForStatus(status: RegulationReconciliationCandidateReviewStatus): string {
  if (status === "rejected") return "reconciliation_candidate_rejected";
  if (status === "archived") return "reconciliation_candidate_archived";
  if (status === "superseded") return "reconciliation_candidate_superseded";
  if (status === "approved_for_mapping_review") return "reconciliation_candidate_approved_for_mapping_review";
  if (status === "approved_for_registry_update") return "reconciliation_candidate_approved_for_registry_update";
  return "reconciliation_candidate_status_changed";
}

export async function updateRegulationReconciliationCandidateStatus(
  input: UpdateReconciliationCandidateStatusInput,
): Promise<Selectable<RegulationReconciliationCandidate>> {
  await ensureRegulationReconciliationCandidateSchema();

  if (!RECONCILIATION_CANDIDATE_REVIEW_STATUSES.includes(input.reviewStatus)) {
    throw new BusinessRuleError("Unsupported reconciliation candidate review status");
  }
  if (input.reviewStatus === "rejected" && !cleanString(input.rejectedReason)) {
    throw new BusinessRuleError("Rejected reconciliation candidates require a rejectedReason");
  }
  if (APPROVAL_REVIEW_STATUSES.has(input.reviewStatus) && !cleanString(input.reviewNotes)) {
    throw new BusinessRuleError("Approval-for-review statuses require reviewNotes");
  }

  const existing = await db
    .selectFrom("regulationReconciliationCandidate")
    .selectAll()
    .where("id", "=", input.candidateId)
    .executeTakeFirst();

  if (!existing) {
    throw new BusinessRuleError("Regulation reconciliation candidate not found", 404);
  }

  const now = new Date();
  const updated = await db
    .updateTable("regulationReconciliationCandidate")
    .set({
      reviewStatus: input.reviewStatus,
      reviewedAt: now,
      reviewedBy: input.adminUserId,
      reviewNotes: cleanString(input.reviewNotes),
      rejectedReason: input.reviewStatus === "rejected" ? cleanString(input.rejectedReason) : existing.rejectedReason,
      supersedesCandidateId: input.supersedesCandidateId ?? existing.supersedesCandidateId,
      updatedAt: now,
    })
    .where("id", "=", input.candidateId)
    .returningAll()
    .executeTakeFirstOrThrow();

  await auditCandidateAction({
    mode: auditModeForStatus(input.reviewStatus),
    candidate: updated,
    oldStatus: existing.reviewStatus,
    newStatus: updated.reviewStatus,
    actorUserId: input.adminUserId,
    notes: input.reviewNotes ?? null,
    reason: input.rejectedReason ?? null,
    request: input.request,
  });

  return updated;
}
