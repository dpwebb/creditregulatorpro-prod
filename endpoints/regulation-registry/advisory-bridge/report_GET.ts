import {
  ADVISORY_BRIDGE_REPORT_MAX_LIMIT,
  ADVISORY_BRIDGE_SAFETY_MESSAGES,
  schema,
  type AdvisoryBridgeDiagnosticIgnoredMapping,
  type AdvisoryBridgeDiagnosticResult,
  type InputType,
  type OutputType,
} from "./report_GET.schema";
import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { localLegalAuthorities } from "../../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../../helpers/regulationRegistry";
import {
  buildRegulationRuntimeBridgeAdvisoryResult,
  type AdvisoryBridgeMappingSnapshot,
} from "../../../helpers/regulationRuntimeBridgeAdvisory";
import type {
  DbRuntimeMappingSnapshot,
  DbRuntimeReferenceSnapshot,
  StaticRuntimeReferenceMappingSnapshot,
  StaticRuntimeReferenceSnapshot,
} from "../../../helpers/regulationRuntimeBridgeShadow";
import { isAdmin } from "../../../helpers/userRoleUtils";

type RuntimeBridgeMappingDiagnosticRow = {
  id: number;
  bridgeMode: string;
  activationStatus: string;
  deterministicRuleId: string | null;
  violationCategory: string | null;
  staticReferenceId: string | null;
  dbRegulationId: string;
  dbMappingId: number | null;
  referenceClass: string;
  consumerWordingMode: string;
  rollbackStaticReferenceId: string | null;
  sourceVersion: string | null;
  staticSnapshotHash: string | null;
  dbSnapshotHash: string | null;
};

type AdvisoryContext = {
  deterministicRuleId?: string | null;
  violationCategory?: string | null;
  staticReferenceId?: string | null;
};

function deterministicRuleIdForCategory(violationCategory: string | null | undefined): string | null {
  const category = String(violationCategory ?? "").trim();
  if (!category) return null;
  return `deterministic-violation-${category.toLowerCase().replace(/_/g, "-")}-v1`;
}

function cleanString(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function uniqueById(rows: RuntimeBridgeMappingDiagnosticRow[]): RuntimeBridgeMappingDiagnosticRow[] {
  const seen = new Set<string>();
  const unique: RuntimeBridgeMappingDiagnosticRow[] = [];
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(row);
  }
  return unique;
}

function toStaticReferenceSnapshots(): StaticRuntimeReferenceSnapshot[] {
  return localLegalAuthorities.map((authority) => ({
    id: authority.regulationId,
    title: authority.shortLabel,
    citation: authority.citation,
    shortLabel: authority.shortLabel,
    jurisdiction: authority.jurisdiction,
    category: authority.supportLevel,
    sourceUrl: authority.sourceUrl,
    authorityType: authority.authorityType,
    sourceQuality: authority.sourceQuality,
    supportLevel: authority.supportLevel,
  }));
}

function toStaticMappingSnapshots(): StaticRuntimeReferenceMappingSnapshot[] {
  return Object.entries(regulationRegistry.VIOLATION_REGULATION_MAP).flatMap(
    ([violationCategory, regulationIds]) =>
      regulationIds.map((regulationId) => {
        const deterministicRuleId = deterministicRuleIdForCategory(violationCategory);
        return {
          regulationId,
          violationCategory,
          deterministicRuleId,
          ruleId: deterministicRuleId,
        };
      }),
  );
}

function toBridgeMappingSnapshot(row: RuntimeBridgeMappingDiagnosticRow): AdvisoryBridgeMappingSnapshot {
  return {
    id: row.id,
    bridgeMode: row.bridgeMode,
    activationStatus: row.activationStatus,
    deterministicRuleId: row.deterministicRuleId,
    violationCategory: row.violationCategory,
    staticReferenceId: row.staticReferenceId,
    dbRegulationId: row.dbRegulationId,
    dbMappingId: row.dbMappingId,
    referenceClass: row.referenceClass,
    consumerWordingMode: row.consumerWordingMode,
    sourceVersion: row.sourceVersion,
  };
}

function contextForMapping(row: RuntimeBridgeMappingDiagnosticRow, filters: InputType): AdvisoryContext {
  if (filters.deterministicRuleId) return { deterministicRuleId: filters.deterministicRuleId };
  if (filters.violationCategory) return { violationCategory: filters.violationCategory };
  if (filters.staticReferenceId) return { staticReferenceId: filters.staticReferenceId };
  if (row.deterministicRuleId) return { deterministicRuleId: row.deterministicRuleId };
  if (row.violationCategory) return { violationCategory: row.violationCategory };
  return {
    staticReferenceId: row.staticReferenceId,
  };
}

function bridgeMappingMatchesContext(row: RuntimeBridgeMappingDiagnosticRow, context: AdvisoryContext): boolean {
  if (context.deterministicRuleId && normalizeId(row.deterministicRuleId) === normalizeId(context.deterministicRuleId)) {
    return true;
  }
  if (context.violationCategory && normalizeId(row.violationCategory) === normalizeId(context.violationCategory)) {
    return true;
  }
  if (context.staticReferenceId && normalizeId(row.staticReferenceId) === normalizeId(context.staticReferenceId)) {
    return true;
  }
  return false;
}

function baseBridgeMappingQuery() {
  return db
    .selectFrom("regulationRuntimeBridgeMapping")
    .select([
      "id",
      "bridgeMode",
      "activationStatus",
      "deterministicRuleId",
      "violationCategory",
      "staticReferenceId",
      "dbRegulationId",
      "dbMappingId",
      "referenceClass",
      "consumerWordingMode",
      "rollbackStaticReferenceId",
      "sourceVersion",
      "staticSnapshotHash",
      "dbSnapshotHash",
    ]);
}

async function readRuntimeBridgeMappings(filters: InputType): Promise<RuntimeBridgeMappingDiagnosticRow[]> {
  let query = baseBridgeMappingQuery();

  if (filters.bridgeMappingId) query = query.where("id", "=", filters.bridgeMappingId);
  if (filters.bridgeMode) query = query.where("bridgeMode", "=", filters.bridgeMode);
  if (filters.activationStatus) query = query.where("activationStatus", "=", filters.activationStatus);
  if (filters.deterministicRuleId) query = query.where("deterministicRuleId", "=", filters.deterministicRuleId);
  if (filters.violationCategory) query = query.where("violationCategory", "=", filters.violationCategory);
  if (filters.staticReferenceId) query = query.where("staticReferenceId", "=", filters.staticReferenceId);
  if (filters.dbRegulationId) query = query.where("dbRegulationId", "=", filters.dbRegulationId);
  if (filters.dbMappingId) query = query.where("dbMappingId", "=", filters.dbMappingId);
  if (filters.referenceClass) query = query.where("referenceClass", "=", filters.referenceClass);
  if (filters.consumerWordingMode) query = query.where("consumerWordingMode", "=", filters.consumerWordingMode);

  return await query.orderBy("id", "asc").limit(filters.limit).execute();
}

async function readSiblingBridgeMappings(
  rows: RuntimeBridgeMappingDiagnosticRow[],
  filters: InputType,
): Promise<RuntimeBridgeMappingDiagnosticRow[]> {
  if (!filters.bridgeMappingId || rows.length === 0) return rows;

  const siblingRows: RuntimeBridgeMappingDiagnosticRow[] = [...rows];
  const target = rows[0];
  const siblingFilters: Array<Partial<InputType>> = target.deterministicRuleId
    ? [{ deterministicRuleId: target.deterministicRuleId }]
    : target.violationCategory
      ? [{ violationCategory: target.violationCategory }]
      : target.staticReferenceId
        ? [{ staticReferenceId: target.staticReferenceId }]
        : [];

  for (const siblingFilter of siblingFilters) {
    let query = baseBridgeMappingQuery();
    if (siblingFilter.deterministicRuleId) query = query.where("deterministicRuleId", "=", siblingFilter.deterministicRuleId);
    if (siblingFilter.violationCategory) query = query.where("violationCategory", "=", siblingFilter.violationCategory);
    if (siblingFilter.staticReferenceId) query = query.where("staticReferenceId", "=", siblingFilter.staticReferenceId);
    const matches = await query.orderBy("id", "asc").limit(ADVISORY_BRIDGE_REPORT_MAX_LIMIT).execute();
    siblingRows.push(...matches);
  }

  return uniqueById(siblingRows);
}

async function readDbRegulationSnapshots(dbRegulationIds: string[]): Promise<DbRuntimeReferenceSnapshot[]> {
  if (dbRegulationIds.length === 0) return [];

  const rows = await db
    .selectFrom("regulationRegistry")
    .select([
      "regulationId",
      "regulationTitle",
      "shortTitle",
      "citationFormat",
      "sectionNumber",
      "jurisdiction",
      "authoritySource",
      "officialSourceUrl",
      "effectiveDate",
      "updateVersion",
      "repealSupersededStatus",
      "regulationCategory",
      "reviewStatus",
      "activeStatus",
      "sourceContentHash",
      "sourceDocumentUrl",
    ])
    .where("regulationId", "in", dbRegulationIds)
    .orderBy("regulationId", "asc")
    .orderBy("updateVersion", "desc")
    .limit(ADVISORY_BRIDGE_REPORT_MAX_LIMIT)
    .execute();

  return rows.map((row) => ({
    regulationId: row.regulationId,
    regulationTitle: row.regulationTitle,
    shortTitle: row.shortTitle,
    citationFormat: row.citationFormat,
    sectionNumber: row.sectionNumber,
    jurisdiction: row.jurisdiction,
    authoritySource: row.authoritySource,
    officialSourceUrl: row.officialSourceUrl,
    effectiveDate: row.effectiveDate,
    updateVersion: row.updateVersion,
    repealSupersededStatus: row.repealSupersededStatus,
    regulationCategory: row.regulationCategory,
    reviewStatus: row.reviewStatus,
    activeStatus: row.activeStatus,
    sourceContentHash: row.sourceContentHash,
    sourceDocumentUrl: row.sourceDocumentUrl,
    referenceType: row.regulationCategory,
    supportLevel: row.regulationCategory,
  }));
}

async function readDbMappingSnapshots(dbMappingIds: number[]): Promise<DbRuntimeMappingSnapshot[]> {
  if (dbMappingIds.length === 0) return [];

  const rows = await db
    .selectFrom("regulationViolationMapping")
    .select(["id", "regulationId", "violationCategory", "active", "reviewStatus"])
    .where("id", "in", dbMappingIds)
    .orderBy("id", "asc")
    .limit(ADVISORY_BRIDGE_REPORT_MAX_LIMIT)
    .execute();

  return rows.map((row) => {
    const deterministicRuleId = deterministicRuleIdForCategory(row.violationCategory);
    return {
      mappingId: row.id,
      regulationId: row.regulationId,
      violationCategory: row.violationCategory,
      deterministicRuleId,
      ruleId: deterministicRuleId,
      reviewStatus: row.reviewStatus,
      active: row.active,
      activeStatus: row.active,
    };
  });
}

function decorateResult(input: {
  row: RuntimeBridgeMappingDiagnosticRow;
  result: ReturnType<typeof buildRegulationRuntimeBridgeAdvisoryResult>;
}): AdvisoryBridgeDiagnosticResult {
  return {
    ...input.result,
    bridgeMappingId: String(input.row.id),
    bridgeMode: input.row.bridgeMode,
    activationStatus: input.row.activationStatus,
    deterministicRuleId: input.row.deterministicRuleId,
    violationCategory: input.row.violationCategory,
    staticReferenceId: input.row.staticReferenceId,
    dbRegulationId: input.row.dbRegulationId,
    dbMappingId: input.row.dbMappingId === null ? null : String(input.row.dbMappingId),
    referenceClass: input.row.referenceClass,
    consumerWordingMode: input.row.consumerWordingMode,
    runtimeSourceUsed: "static_runtime",
    safetyWarnings: [
      "Advisory diagnostics do not change active static runtime output.",
      ...input.result.warnings,
    ],
  };
}

function decorateIgnored(result: AdvisoryBridgeDiagnosticResult): AdvisoryBridgeDiagnosticIgnoredMapping | null {
  if (result.advisoryReference) return null;
  return {
    bridgeMappingId: result.bridgeMappingId,
    bridgeMode: result.bridgeMode,
    activationStatus: result.activationStatus,
    deterministicRuleId: result.deterministicRuleId,
    violationCategory: result.violationCategory,
    staticReferenceId: result.staticReferenceId,
    dbRegulationId: result.dbRegulationId,
    dbMappingId: result.dbMappingId,
    referenceClass: result.referenceClass,
    consumerWordingMode: result.consumerWordingMode,
    runtimeSourceUsed: "static_runtime",
    dbReferenceStatus: "ignored",
    reasons: result.warnings,
    safetyWarnings: [
      "Bridge mapping was ignored or returned static fallback only; static runtime reference remains active.",
      ...result.warnings,
    ],
  };
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(request.url);
    const filters = schema.parse({
      deterministicRuleId: url.searchParams.get("deterministicRuleId") || undefined,
      violationCategory: url.searchParams.get("violationCategory") || undefined,
      staticReferenceId: url.searchParams.get("staticReferenceId") || undefined,
      dbRegulationId: url.searchParams.get("dbRegulationId") || undefined,
      dbMappingId: url.searchParams.get("dbMappingId") || undefined,
      bridgeMappingId: url.searchParams.get("bridgeMappingId") || undefined,
      referenceClass: url.searchParams.get("referenceClass") || undefined,
      consumerWordingMode: url.searchParams.get("consumerWordingMode") || undefined,
      activationStatus: url.searchParams.get("activationStatus") || undefined,
      bridgeMode: url.searchParams.get("bridgeMode") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    const staticReferences = toStaticReferenceSnapshots();
    const staticViolationMappings = toStaticMappingSnapshots();
    const primaryBridgeMappings = await readRuntimeBridgeMappings(filters);
    const bridgeMappingsForEvaluation = await readSiblingBridgeMappings(primaryBridgeMappings, filters);
    const dbRegulationIds = [
      ...new Set(bridgeMappingsForEvaluation.map((row) => row.dbRegulationId).filter(Boolean)),
    ];
    const dbMappingIds = [
      ...new Set(
        bridgeMappingsForEvaluation
          .map((row) => row.dbMappingId)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
      ),
    ];
    const dbRegulations = await readDbRegulationSnapshots(dbRegulationIds);
    const dbMappings = await readDbMappingSnapshots(dbMappingIds);
    const bridgeSnapshots = bridgeMappingsForEvaluation.map(toBridgeMappingSnapshot);

    const results = primaryBridgeMappings.slice(0, filters.limit).map((row) => {
      const context = contextForMapping(row, filters);
      const contextBridgeMappings = bridgeMappingsForEvaluation
        .filter((candidate) => bridgeMappingMatchesContext(candidate, context))
        .map(toBridgeMappingSnapshot);
      const targetEligible = row.activationStatus === "approved_for_advisory" && row.bridgeMode === "advisory";
      return decorateResult({
        row,
        result: buildRegulationRuntimeBridgeAdvisoryResult({
          staticReferences,
          staticViolationMappings,
          dbRegulations,
          dbMappings,
          bridgeMappings: filters.bridgeMappingId && !targetEligible
            ? [toBridgeMappingSnapshot(row)]
            : contextBridgeMappings.length > 0
              ? contextBridgeMappings
              : bridgeSnapshots,
          context: {
            ...context,
            consumerFacing: false,
          },
        }),
      });
    });
    const ignoredMappings = results
      .map(decorateIgnored)
      .filter((ignored): ignored is AdvisoryBridgeDiagnosticIgnoredMapping => ignored !== null);

    const response: OutputType = {
      mode: "advisory",
      runtimeSourceUsed: "static_runtime",
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalBridgeMappingsConsidered: primaryBridgeMappings.length,
        totalAdvisoryEligible: primaryBridgeMappings.filter(
          (row) => row.activationStatus === "approved_for_advisory" && row.bridgeMode === "advisory",
        ).length,
        totalAdvisoryReferences: results.filter((result) => Boolean(result.advisoryReference)).length,
        totalFallbackOnly: results.filter((result) => result.fallbackUsed).length,
        totalIgnoredMappings: ignoredMappings.length,
        totalWarnings: results.reduce((count, result) => count + result.warnings.length, 0),
      },
      results,
      ignoredMappings,
      safetyMessages: [...ADVISORY_BRIDGE_SAFETY_MESSAGES],
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
