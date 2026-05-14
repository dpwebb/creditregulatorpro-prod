import {
  schema,
  SHADOW_BRIDGE_REPORT_MAX_LIMIT,
  SHADOW_BRIDGE_SAFETY_MESSAGES,
  type InputType,
  type OutputType,
  type ShadowBridgeDiagnosticFinding,
  type ShadowBridgeDiagnosticIgnoredDbReference,
} from "./report_GET.schema";
import { db } from "../../../helpers/db";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { localLegalAuthorities } from "../../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../../helpers/regulationRegistry";
import {
  buildRegulationRuntimeBridgeShadowReport,
  type DbRuntimeMappingSnapshot,
  type DbRuntimeReferenceSnapshot,
  type IgnoredDbReference,
  type LimitedRuntimeUnsafeReason,
  type RegulationRuntimeBridgeShadowFinding,
  type StaticRuntimeReferenceMappingSnapshot,
  type StaticRuntimeReferenceSnapshot,
} from "../../../helpers/regulationRuntimeBridgeShadow";
import { isAdmin } from "../../../helpers/userRoleUtils";

function deterministicRuleIdForCategory(violationCategory: string | null | undefined): string | null {
  const category = String(violationCategory ?? "").trim();
  if (!category) return null;
  return `deterministic-violation-${category.toLowerCase().replace(/_/g, "-")}-v1`;
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

async function readDbRegulationSnapshots(filters: InputType): Promise<DbRuntimeReferenceSnapshot[]> {
  let query = db
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
    ]);

  if (filters.dbRegulationId) query = query.where("regulationId", "=", filters.dbRegulationId);

  const rows = await query
    .orderBy("regulationId", "asc")
    .orderBy("updateVersion", "desc")
    .limit(SHADOW_BRIDGE_REPORT_MAX_LIMIT)
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

async function readDbMappingSnapshots(filters: InputType): Promise<DbRuntimeMappingSnapshot[]> {
  let query = db
    .selectFrom("regulationViolationMapping")
    .select(["id", "regulationId", "violationCategory", "active", "reviewStatus"]);

  if (filters.dbRegulationId) query = query.where("regulationId", "=", filters.dbRegulationId);
  if (filters.violationCategory) query = query.where("violationCategory", "=", filters.violationCategory);

  const rows = await query
    .orderBy("violationCategory", "asc")
    .orderBy("regulationId", "asc")
    .limit(SHADOW_BRIDGE_REPORT_MAX_LIMIT)
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

function findingMatchesFilters(finding: RegulationRuntimeBridgeShadowFinding, filters: InputType): boolean {
  if (filters.staticReferenceId && finding.staticReferenceId !== filters.staticReferenceId) return false;
  if (filters.dbRegulationId && finding.dbRegulationId !== filters.dbRegulationId) return false;
  if (filters.violationCategory && finding.violationCategory !== filters.violationCategory) return false;
  if (filters.deterministicRuleId && finding.deterministicRuleId !== filters.deterministicRuleId) return false;
  if (filters.referenceClass && finding.referenceClass !== filters.referenceClass) return false;
  if (filters.consumerWordingMode && finding.consumerWordingMode !== filters.consumerWordingMode) return false;
  if (filters.findingType) {
    if (filters.findingType === "shadow_alternative") return true;
    return (
      finding.mismatchType === filters.findingType ||
      finding.limitedRuntimeUnsafeReasons.includes(filters.findingType as LimitedRuntimeUnsafeReason)
    );
  }
  return true;
}

function ignoredMatchesFilters(ignored: IgnoredDbReference, filters: InputType): boolean {
  if (filters.staticReferenceId && ignored.dbRegulationId !== filters.staticReferenceId) return false;
  if (filters.dbRegulationId && ignored.dbRegulationId !== filters.dbRegulationId) return false;
  if (filters.violationCategory && ignored.violationCategory !== filters.violationCategory) return false;
  if (filters.deterministicRuleId && ignored.deterministicRuleId !== filters.deterministicRuleId) return false;
  if (filters.referenceClass && ignored.referenceClass !== filters.referenceClass) return false;
  if (filters.consumerWordingMode && ignored.consumerWordingMode !== filters.consumerWordingMode) return false;
  if (filters.findingType) {
    if (filters.findingType === "ignored_db_reference") return true;
    return ignored.reasons.includes(filters.findingType as never);
  }
  return true;
}

function decorateFinding(finding: RegulationRuntimeBridgeShadowFinding): ShadowBridgeDiagnosticFinding {
  return {
    ...finding,
    bridgeMode: "shadow",
    runtimeSourceUsed: "static_runtime",
    staticRuntimeReferenceStatus: "active_static_runtime",
    dbReferenceStatus: "shadow_only",
    safetyWarnings: [
      "DB reference is shadow-only and does not change active static runtime output.",
      ...finding.limitedRuntimeUnsafeReasons,
    ],
  };
}

function decorateIgnored(ignored: IgnoredDbReference): ShadowBridgeDiagnosticIgnoredDbReference {
  return {
    ...ignored,
    bridgeMode: "shadow",
    runtimeSourceUsed: "static_runtime",
    dbReferenceStatus: "ignored",
    safetyWarnings: [
      "DB reference was ignored or flagged and does not change active static runtime output.",
      ...ignored.reasons,
    ],
  };
}

function warningCount(input: {
  findings: RegulationRuntimeBridgeShadowFinding[];
  ignoredDbReferences: IgnoredDbReference[];
}): number {
  return (
    input.findings.reduce((count, finding) => count + finding.limitedRuntimeUnsafeReasons.length, 0) +
    input.ignoredDbReferences.reduce((count, ignored) => count + ignored.reasons.length, 0)
  );
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
      findingType: url.searchParams.get("findingType") || undefined,
      referenceClass: url.searchParams.get("referenceClass") || undefined,
      consumerWordingMode: url.searchParams.get("consumerWordingMode") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    const staticReferences = toStaticReferenceSnapshots();
    const staticViolationMappings = toStaticMappingSnapshots();
    const dbRegulations = await readDbRegulationSnapshots(filters);
    const dbMappings = await readDbMappingSnapshots(filters);

    const report = buildRegulationRuntimeBridgeShadowReport({
      staticReferences,
      staticViolationMappings,
      dbRegulations,
      dbMappings,
      context: {
        deterministicRuleId: filters.deterministicRuleId,
        violationCategory: filters.violationCategory,
        consumerFacing: true,
      },
    });

    const filteredFindings = report.shadowFindings.filter((finding) => findingMatchesFilters(finding, filters));
    const filteredIgnored = report.ignoredDbReferences.filter((ignored) => ignoredMatchesFilters(ignored, filters));

    const response: OutputType = {
      bridgeMode: "shadow",
      runtimeSourceUsed: "static_runtime",
      generatedAt: new Date().toISOString(),
      filters,
      summary: {
        totalStaticReferences: staticReferences.length,
        totalDbRecordsConsidered: dbRegulations.length,
        totalShadowAlternatives: filteredFindings.length,
        totalIgnoredDbReferences: filteredIgnored.length,
        totalWarnings: warningCount({
          findings: filteredFindings,
          ignoredDbReferences: filteredIgnored,
        }),
      },
      findings: filteredFindings.slice(0, filters.limit).map(decorateFinding),
      ignoredDbReferences: filteredIgnored.slice(0, filters.limit).map(decorateIgnored),
      safetyMessages: [...SHADOW_BRIDGE_SAFETY_MESSAGES],
    };

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
