import { sql, type Selectable } from "kysely";

import { db } from "./db";
import { logAudit } from "./auditLogger";
import { BusinessRuleError } from "./endpointErrorHandler";
import { ensureRegulationRegistrySchema } from "./regulationRegistrySchema";
import type {
  Json,
  RegulationRuntimeBridgeActivationStatus,
  RegulationRuntimeBridgeConsumerWordingMode,
  RegulationRuntimeBridgeMapping,
  RegulationRuntimeBridgeMode,
  RegulationRuntimeBridgeReferenceClass,
} from "./schema";

export const RUNTIME_BRIDGE_MAPPING_TABLE = "regulation_runtime_bridge_mapping";

export const RUNTIME_BRIDGE_MODES: [RegulationRuntimeBridgeMode, ...RegulationRuntimeBridgeMode[]] = [
  "shadow",
  "advisory",
  "limited_runtime",
];

export const RUNTIME_BRIDGE_REFERENCE_CLASSES: [
  RegulationRuntimeBridgeReferenceClass,
  ...RegulationRuntimeBridgeReferenceClass[],
] = [
  "official_law",
  "regulator_guidance",
  "private_standard",
  "local_procedural",
  "internal_only",
];

export const RUNTIME_BRIDGE_CONSUMER_WORDING_MODES: [
  RegulationRuntimeBridgeConsumerWordingMode,
  ...RegulationRuntimeBridgeConsumerWordingMode[],
] = [
  "review_reference",
  "private_standard_reference",
  "procedural_reference",
  "internal_only",
];

export const RUNTIME_BRIDGE_ACTIVATION_STATUSES: [
  RegulationRuntimeBridgeActivationStatus,
  ...RegulationRuntimeBridgeActivationStatus[],
] = [
  "draft",
  "approved_for_shadow",
  "approved_for_advisory",
  "approved_for_limited_runtime",
  "active_limited_runtime",
  "paused",
  "rolled_back",
  "rejected",
  "archived",
];

export const RUNTIME_BRIDGE_ALLOWED_REVIEW_STATUSES: Exclude<
  RegulationRuntimeBridgeActivationStatus,
  "active_limited_runtime"
>[] = [
  "draft",
  "approved_for_shadow",
  "approved_for_advisory",
  "approved_for_limited_runtime",
  "paused",
  "rolled_back",
  "rejected",
  "archived",
];

const APPROVAL_STATUSES = new Set<RegulationRuntimeBridgeActivationStatus>([
  "approved_for_shadow",
  "approved_for_advisory",
  "approved_for_limited_runtime",
]);

export type RuntimeBridgeMappingListFilters = {
  bridgeMode?: RegulationRuntimeBridgeMode;
  activationStatus?: RegulationRuntimeBridgeActivationStatus;
  deterministicRuleId?: string;
  violationCategory?: string;
  staticReferenceId?: string;
  dbRegulationId?: string;
  dbMappingId?: number;
  referenceClass?: RegulationRuntimeBridgeReferenceClass;
  consumerWordingMode?: RegulationRuntimeBridgeConsumerWordingMode;
  includeTestManifest?: boolean;
  limit?: number;
};

export type CreateRuntimeBridgeMappingDraftInput = {
  bridgeMode: RegulationRuntimeBridgeMode;
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  staticReferenceId?: string | null;
  dbRegulationId: string;
  dbMappingId?: number | string | null;
  referenceClass: RegulationRuntimeBridgeReferenceClass;
  consumerWordingMode: RegulationRuntimeBridgeConsumerWordingMode;
  rollbackStaticReferenceId?: string | null;
  activationReason?: string | null;
  testManifest?: unknown;
  sourceVersion?: string | null;
  staticSnapshotHash?: string | null;
  dbSnapshotHash?: string | null;
  adminUserId?: number | null;
  request?: Request;
};

export type UpdateRuntimeBridgeMappingStatusInput = {
  mappingId: number | string;
  activationStatus: RegulationRuntimeBridgeActivationStatus;
  activationReason?: string | null;
  rollbackStaticReferenceId?: string | null;
  testManifest?: unknown;
  adminUserId: number;
  request?: Request;
};

type JsonLike = Json | null;

let ensurePromise: Promise<void> | null = null;

async function createRegulationRuntimeBridgeMappingSchema(): Promise<void> {
  await ensureRegulationRegistrySchema();

  await sql`
    create table if not exists public.regulation_runtime_bridge_mapping (
      id bigserial primary key,
      bridge_mode text not null,
      deterministic_rule_id text null,
      violation_category text null,
      static_reference_id text null,
      db_regulation_id text not null,
      db_mapping_id bigint null references public.regulation_violation_mapping(id) on delete set null,
      reference_class text not null,
      consumer_wording_mode text not null,
      rollback_static_reference_id text null,
      activation_status text not null default 'draft',
      activation_reason text null,
      test_manifest jsonb null,
      approved_by bigint null references public.users(id) on delete set null,
      approved_at timestamptz null,
      activated_by bigint null references public.users(id) on delete set null,
      activated_at timestamptz null,
      deactivated_by bigint null references public.users(id) on delete set null,
      deactivated_at timestamptz null,
      rollback_by bigint null references public.users(id) on delete set null,
      rollback_at timestamptz null,
      source_version text null,
      static_snapshot_hash text null,
      db_snapshot_hash text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint regulation_runtime_bridge_mapping_bridge_mode_check
        check (bridge_mode in ('shadow', 'advisory', 'limited_runtime')),
      constraint regulation_runtime_bridge_mapping_reference_class_check
        check (reference_class in ('official_law', 'regulator_guidance', 'private_standard', 'local_procedural', 'internal_only')),
      constraint regulation_runtime_bridge_mapping_consumer_wording_check
        check (consumer_wording_mode in ('review_reference', 'private_standard_reference', 'procedural_reference', 'internal_only')),
      constraint regulation_runtime_bridge_mapping_activation_status_check
        check (activation_status in (
          'draft',
          'approved_for_shadow',
          'approved_for_advisory',
          'approved_for_limited_runtime',
          'active_limited_runtime',
          'paused',
          'rolled_back',
          'rejected',
          'archived'
        ))
    )
  `.execute(db);

  await sql`create index if not exists idx_reg_runtime_bridge_mapping_bridge_mode on public.regulation_runtime_bridge_mapping(bridge_mode)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_activation_status on public.regulation_runtime_bridge_mapping(activation_status)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_rule on public.regulation_runtime_bridge_mapping(deterministic_rule_id)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_violation_category on public.regulation_runtime_bridge_mapping(violation_category)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_static_reference on public.regulation_runtime_bridge_mapping(static_reference_id)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_db_regulation on public.regulation_runtime_bridge_mapping(db_regulation_id)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_db_mapping on public.regulation_runtime_bridge_mapping(db_mapping_id)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_reference_class on public.regulation_runtime_bridge_mapping(reference_class)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_consumer_wording on public.regulation_runtime_bridge_mapping(consumer_wording_mode)`.execute(db);
  await sql`create index if not exists idx_reg_runtime_bridge_mapping_created_at on public.regulation_runtime_bridge_mapping(created_at)`.execute(db);
  await sql`
    create unique index if not exists idx_reg_runtime_bridge_mapping_dedupe
    on public.regulation_runtime_bridge_mapping(
      bridge_mode,
      coalesce(deterministic_rule_id, ''),
      coalesce(violation_category, ''),
      coalesce(static_reference_id, ''),
      db_regulation_id,
      coalesce(db_mapping_id, 0)
    )
  `.execute(db);
}

export function ensureRegulationRuntimeBridgeMappingSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = createRegulationRuntimeBridgeMappingSchema().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  return ensurePromise;
}

function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRuntimeBridgeMode(value: unknown): value is RegulationRuntimeBridgeMode {
  return RUNTIME_BRIDGE_MODES.includes(value as RegulationRuntimeBridgeMode);
}

function isReferenceClass(value: unknown): value is RegulationRuntimeBridgeReferenceClass {
  return RUNTIME_BRIDGE_REFERENCE_CLASSES.includes(value as RegulationRuntimeBridgeReferenceClass);
}

function isConsumerWordingMode(value: unknown): value is RegulationRuntimeBridgeConsumerWordingMode {
  return RUNTIME_BRIDGE_CONSUMER_WORDING_MODES.includes(value as RegulationRuntimeBridgeConsumerWordingMode);
}

function isAllowedReviewStatus(
  value: unknown,
): value is Exclude<RegulationRuntimeBridgeActivationStatus, "active_limited_runtime"> {
  return RUNTIME_BRIDGE_ALLOWED_REVIEW_STATUSES.includes(value as never);
}

const SENSITIVE_KEY_PATTERN =
  /(sin|ssn|social.?insurance|account.?number|full.?account|member.?number|packet|raw.?text|raw.?extracted|extracted.?text|credit.?report|source.?text|consumer.?personal|dob|date.?of.?birth|address|phone|email|name)/i;
const SIN_PATTERN = /\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g;
const ACCOUNT_PHRASE_PATTERN = /\b(?:account|acct|member)\s*(?:number|no\.?|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9 -]{5,}\b/gi;
const UNMASKED_ACCOUNT_PATTERN = /\b(?:[A-Z]{1,4}\d{6,}|\d{10,})\b/g;
const MAX_SANITIZE_DEPTH = 8;

function redactSensitiveText(value: string): string {
  return value
    .replace(SIN_PATTERN, "[redacted SIN]")
    .replace(ACCOUNT_PHRASE_PATTERN, "[redacted account]")
    .replace(UNMASKED_ACCOUNT_PATTERN, (match) => `...${match.slice(-4)}`);
}

function sanitizeValue(value: unknown, depth: number, parentKey?: string): JsonLike | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (depth > MAX_SANITIZE_DEPTH) return "[truncated]";
  if (parentKey && SENSITIVE_KEY_PATTERN.test(parentKey)) return "[redacted]";

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

export function sanitizeRuntimeBridgeMappingPayload(input: unknown): JsonLike {
  const sanitized = sanitizeValue(input, 0);
  return sanitized === undefined ? null : sanitized;
}

function sanitizeGovernanceText(value: string | null | undefined): string | null {
  const text = cleanString(value);
  return text ? redactSensitiveText(text) : null;
}

function toPositiveInteger(value: number | string | null | undefined, fieldName: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BusinessRuleError(`${fieldName} must be a positive integer when provided`);
  }
  return parsed;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

function validateCreateInput(input: CreateRuntimeBridgeMappingDraftInput) {
  if (!isRuntimeBridgeMode(input.bridgeMode)) {
    throw new BusinessRuleError("Unsupported runtime bridge mode");
  }
  if (!isReferenceClass(input.referenceClass)) {
    throw new BusinessRuleError("Unsupported runtime bridge reference class");
  }
  if (!isConsumerWordingMode(input.consumerWordingMode)) {
    throw new BusinessRuleError("Unsupported runtime bridge consumer wording mode");
  }
  if (!cleanString(input.dbRegulationId)) {
    throw new BusinessRuleError("dbRegulationId is required");
  }
  if (
    !cleanString(input.deterministicRuleId) &&
    !cleanString(input.violationCategory) &&
    !cleanString(input.staticReferenceId)
  ) {
    throw new BusinessRuleError("A deterministicRuleId, violationCategory, or staticReferenceId is required");
  }
  toPositiveInteger(input.dbMappingId, "dbMappingId");
}

function auditModeForStatus(status: RegulationRuntimeBridgeActivationStatus): string {
  if (status === "approved_for_shadow") return "runtime_bridge_mapping_approved_for_shadow";
  if (status === "approved_for_advisory") return "runtime_bridge_mapping_approved_for_advisory";
  if (status === "approved_for_limited_runtime") return "runtime_bridge_mapping_approved_for_limited_runtime";
  if (status === "paused") return "runtime_bridge_mapping_paused";
  if (status === "rolled_back") return "runtime_bridge_mapping_rolled_back";
  if (status === "rejected") return "runtime_bridge_mapping_rejected";
  if (status === "archived") return "runtime_bridge_mapping_archived";
  return "runtime_bridge_mapping_status_changed";
}

async function auditBridgeMappingAction(input: {
  mode: string;
  mapping: Selectable<RegulationRuntimeBridgeMapping>;
  oldStatus?: RegulationRuntimeBridgeActivationStatus | null;
  newStatus?: RegulationRuntimeBridgeActivationStatus | null;
  actorUserId?: number | null;
  notes?: string | null;
  reason?: string | null;
  status?: "SUCCESS" | "FAILURE";
  errorMessage?: string | null;
  request?: Request;
}) {
  const notes = sanitizeGovernanceText(input.notes);
  const reason = sanitizeGovernanceText(input.reason);

  await logAudit({
    action: input.mode === "runtime_bridge_mapping_draft_created" ? "CREATE" : "UPDATE",
    entityType: "REGULATORY_UPDATE",
    entityId: input.mapping.id,
    userId: input.actorUserId ?? null,
    details: {
      component: "regulation_runtime_bridge_mapping",
      mode: input.mode,
      mappingId: input.mapping.id,
      bridgeMode: input.mapping.bridgeMode,
      activationStatus: input.mapping.activationStatus,
      oldStatus: input.oldStatus ?? null,
      newStatus: input.newStatus ?? input.mapping.activationStatus,
      deterministicRuleId: input.mapping.deterministicRuleId,
      violationCategory: input.mapping.violationCategory,
      staticReferenceId: input.mapping.staticReferenceId,
      dbRegulationId: input.mapping.dbRegulationId,
      dbMappingId: input.mapping.dbMappingId,
      referenceClass: input.mapping.referenceClass,
      consumerWordingMode: input.mapping.consumerWordingMode,
      sourceVersion: input.mapping.sourceVersion,
      actor: input.actorUserId ?? null,
      notes,
      reason,
    },
    status: input.status ?? "SUCCESS",
    errorMessage: input.errorMessage ?? null,
    request: input.request,
  });
}

export async function createRuntimeBridgeMappingDraft(
  input: CreateRuntimeBridgeMappingDraftInput,
): Promise<Selectable<RegulationRuntimeBridgeMapping>> {
  await ensureRegulationRuntimeBridgeMappingSchema();
  validateCreateInput(input);
  const dbMappingId = toPositiveInteger(input.dbMappingId, "dbMappingId");

  let mapping: Selectable<RegulationRuntimeBridgeMapping>;
  try {
    mapping = await db
      .insertInto("regulationRuntimeBridgeMapping")
      .values({
        bridgeMode: input.bridgeMode,
        deterministicRuleId: cleanString(input.deterministicRuleId),
        violationCategory: cleanString(input.violationCategory),
        staticReferenceId: cleanString(input.staticReferenceId),
        dbRegulationId: cleanString(input.dbRegulationId) as string,
        dbMappingId,
        referenceClass: input.referenceClass,
        consumerWordingMode: input.consumerWordingMode,
        rollbackStaticReferenceId: cleanString(input.rollbackStaticReferenceId),
        activationStatus: "draft",
        activationReason: sanitizeGovernanceText(input.activationReason),
        testManifest: (input.testManifest === undefined
          ? null
          : sanitizeRuntimeBridgeMappingPayload(input.testManifest)) as any,
        sourceVersion: cleanString(input.sourceVersion),
        staticSnapshotHash: cleanString(input.staticSnapshotHash),
        dbSnapshotHash: cleanString(input.dbSnapshotHash),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new BusinessRuleError("Runtime bridge mapping already exists for this logical tuple", 409);
    }
    throw error;
  }

  await auditBridgeMappingAction({
    mode: "runtime_bridge_mapping_draft_created",
    mapping,
    newStatus: mapping.activationStatus,
    actorUserId: input.adminUserId ?? null,
    notes: input.activationReason ?? null,
    request: input.request,
  });

  return mapping;
}

function normalizeLimit(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.trunc(value as number), 1), 300);
}

export async function listRuntimeBridgeMappings(filters: RuntimeBridgeMappingListFilters = {}) {
  await ensureRegulationRuntimeBridgeMappingSchema();

  const baseColumns = [
    "id",
    "bridgeMode",
    "deterministicRuleId",
    "violationCategory",
    "staticReferenceId",
    "dbRegulationId",
    "dbMappingId",
    "referenceClass",
    "consumerWordingMode",
    "rollbackStaticReferenceId",
    "activationStatus",
    "activationReason",
    "approvedBy",
    "approvedAt",
    "activatedBy",
    "activatedAt",
    "deactivatedBy",
    "deactivatedAt",
    "rollbackBy",
    "rollbackAt",
    "sourceVersion",
    "staticSnapshotHash",
    "dbSnapshotHash",
    "createdAt",
    "updatedAt",
  ] as const;

  const columns = filters.includeTestManifest ? [...baseColumns, "testManifest"] as const : baseColumns;
  let query = db.selectFrom("regulationRuntimeBridgeMapping").select(columns as any);

  if (filters.bridgeMode) query = query.where("bridgeMode", "=", filters.bridgeMode);
  if (filters.activationStatus) query = query.where("activationStatus", "=", filters.activationStatus);
  if (filters.deterministicRuleId) query = query.where("deterministicRuleId", "=", filters.deterministicRuleId);
  if (filters.violationCategory) query = query.where("violationCategory", "=", filters.violationCategory);
  if (filters.staticReferenceId) query = query.where("staticReferenceId", "=", filters.staticReferenceId);
  if (filters.dbRegulationId) query = query.where("dbRegulationId", "=", filters.dbRegulationId);
  if (filters.dbMappingId) query = query.where("dbMappingId", "=", filters.dbMappingId);
  if (filters.referenceClass) query = query.where("referenceClass", "=", filters.referenceClass);
  if (filters.consumerWordingMode) query = query.where("consumerWordingMode", "=", filters.consumerWordingMode);

  return await query.orderBy("createdAt", "desc").limit(normalizeLimit(filters.limit)).execute();
}

export async function updateRuntimeBridgeMappingStatus(
  input: UpdateRuntimeBridgeMappingStatusInput,
): Promise<Selectable<RegulationRuntimeBridgeMapping>> {
  await ensureRegulationRuntimeBridgeMappingSchema();
  const mappingId = toPositiveInteger(input.mappingId, "mappingId") as number;

  const existing = await db
    .selectFrom("regulationRuntimeBridgeMapping")
    .selectAll()
    .where("id", "=", mappingId)
    .executeTakeFirst();

  if (!existing) {
    throw new BusinessRuleError("Runtime bridge mapping not found", 404);
  }

  if (input.activationStatus === "active_limited_runtime") {
    const message = "Runtime bridge activation is unavailable in this governance layer";
    await auditBridgeMappingAction({
      mode: "runtime_bridge_activation_rejected_unavailable",
      mapping: existing,
      oldStatus: existing.activationStatus,
      newStatus: "active_limited_runtime",
      actorUserId: input.adminUserId,
      reason: input.activationReason ?? null,
      status: "FAILURE",
      errorMessage: message,
      request: input.request,
    });
    throw new BusinessRuleError(message);
  }

  if (!isAllowedReviewStatus(input.activationStatus)) {
    throw new BusinessRuleError("Unsupported runtime bridge mapping activation status");
  }

  const activationReason = sanitizeGovernanceText(input.activationReason);
  if (APPROVAL_STATUSES.has(input.activationStatus) && !activationReason) {
    throw new BusinessRuleError("Approval statuses require activationReason");
  }
  if (input.activationStatus === "rejected" && !activationReason) {
    throw new BusinessRuleError("Rejected runtime bridge mappings require activationReason");
  }
  if (input.activationStatus === "approved_for_limited_runtime") {
    if (!cleanString(input.rollbackStaticReferenceId)) {
      throw new BusinessRuleError("approved_for_limited_runtime requires rollbackStaticReferenceId");
    }
    if (input.testManifest === undefined || input.testManifest === null) {
      throw new BusinessRuleError("approved_for_limited_runtime requires testManifest");
    }
  }

  const now = new Date();
  const updateValues: Record<string, unknown> = {
    activationStatus: input.activationStatus,
    activationReason: activationReason ?? existing.activationReason,
    updatedAt: now,
  };

  if (input.rollbackStaticReferenceId !== undefined) {
    updateValues.rollbackStaticReferenceId = cleanString(input.rollbackStaticReferenceId);
  }
  if (input.testManifest !== undefined) {
    updateValues.testManifest = sanitizeRuntimeBridgeMappingPayload(input.testManifest);
  }
  if (APPROVAL_STATUSES.has(input.activationStatus)) {
    updateValues.approvedBy = input.adminUserId;
    updateValues.approvedAt = now;
  }
  if (input.activationStatus === "paused") {
    updateValues.deactivatedBy = input.adminUserId;
    updateValues.deactivatedAt = now;
  }
  if (input.activationStatus === "rolled_back") {
    updateValues.rollbackBy = input.adminUserId;
    updateValues.rollbackAt = now;
  }

  const updated = await db
    .updateTable("regulationRuntimeBridgeMapping")
    .set(updateValues as any)
    .where("id", "=", mappingId)
    .returningAll()
    .executeTakeFirstOrThrow();

  await auditBridgeMappingAction({
    mode: auditModeForStatus(input.activationStatus),
    mapping: updated,
    oldStatus: existing.activationStatus,
    newStatus: updated.activationStatus,
    actorUserId: input.adminUserId,
    notes: activationReason,
    reason: activationReason,
    request: input.request,
  });

  return updated;
}
