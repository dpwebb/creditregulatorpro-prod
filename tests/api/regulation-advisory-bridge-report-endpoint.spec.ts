import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { localLegalAuthorities } from "../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../helpers/regulationRegistry";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  selectFrom: vi.fn((table: string) => {
    const state = {
      filters: [] as Array<{ column: string; operator: string; value: unknown }>,
      limit: null as number | null,
    };
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn((column: string, operator: string, value: unknown) => {
        state.filters.push({ column, operator, value });
        return builder;
      }),
      orderBy: vi.fn(() => builder),
      limit: vi.fn((value: number) => {
        state.limit = value;
        return builder;
      }),
      execute: vi.fn(async () => {
        const sourceRows =
          table === "regulationRuntimeBridgeMapping"
            ? mocks.bridgeRows
            : table === "regulationRegistry"
              ? mocks.regulationRows
              : table === "regulationViolationMapping"
                ? mocks.mappingRows
                : [];
        const rows = sourceRows.filter((row: Record<string, unknown>) =>
          state.filters.every((filter) => {
            if (filter.operator === "in") {
              return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
            }
            return row[filter.column] === filter.value;
          }),
        );
        return rows.slice(0, state.limit ?? rows.length);
      }),
    };
    return builder;
  }),
  insertInto: vi.fn(() => {
    throw new Error("unexpected insert");
  }),
  updateTable: vi.fn(() => {
    throw new Error("unexpected update");
  }),
  deleteFrom: vi.fn(() => {
    throw new Error("unexpected delete");
  }),
  createReconciliationCandidatesFromFindings: vi.fn(),
  approveRegulationCandidate: vi.fn(),
  upsertRegulationViolationMapping: vi.fn(),
  bridgeRows: [] as Array<Record<string, unknown>>,
  regulationRows: [] as Array<Record<string, unknown>>,
  mappingRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../helpers/getServerUserSession", () => ({
  getServerUserSession: mocks.getServerUserSession,
}));

vi.mock("../../helpers/db", () => ({
  db: {
    selectFrom: mocks.selectFrom,
    insertInto: mocks.insertInto,
    updateTable: mocks.updateTable,
    deleteFrom: mocks.deleteFrom,
  },
}));

vi.mock("../../helpers/regulationReconciliationCandidateService", () => ({
  createReconciliationCandidatesFromFindings: mocks.createReconciliationCandidatesFromFindings,
}));

vi.mock("../../helpers/regulationRegistryService", () => ({
  approveRegulationCandidate: mocks.approveRegulationCandidate,
  upsertRegulationViolationMapping: mocks.upsertRegulationViolationMapping,
}));

import { handle } from "../../endpoints/regulation-registry/advisory-bridge/report_GET";

const ruleId = "deterministic-violation-balance-calculation-violation-v1";
const violationCategory = "BALANCE_CALCULATION_VIOLATION";

function getRequest(path = "/_api/regulation-registry/advisory-bridge/report") {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function bridgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    bridgeMode: "advisory",
    activationStatus: "approved_for_advisory",
    deterministicRuleId: ruleId,
    violationCategory,
    staticReferenceId: "PIPEDA_4_6",
    dbRegulationId: "PIPEDA_4_6",
    dbMappingId: 7,
    referenceClass: "official_law",
    consumerWordingMode: "review_reference",
    rollbackStaticReferenceId: "PIPEDA_4_6",
    sourceVersion: "api-advisory-test",
    staticSnapshotHash: "static-hash",
    dbSnapshotHash: "db-hash",
    ...overrides,
  };
}

function regulationRow(overrides: Record<string, unknown> = {}) {
  return {
    regulationId: "PIPEDA_4_6",
    regulationTitle: "Accuracy DB Review",
    shortTitle: "Accuracy DB",
    citationFormat: "Schedule 1, Principle 4.6",
    sectionNumber: "Schedule 1, Principle 4.6",
    jurisdiction: "Federal",
    authoritySource: "PIPEDA",
    officialSourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
    sourceDocumentUrl: null,
    effectiveDate: "2001-01-01T00:00:00.000Z",
    updateVersion: 1,
    repealSupersededStatus: "current",
    regulationCategory: "category_principle",
    reviewStatus: "approved",
    activeStatus: "active",
    sourceContentHash: "hash-pipeda",
    ...overrides,
  };
}

function mappingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    regulationId: "PIPEDA_4_6",
    violationCategory,
    active: true,
    reviewStatus: "approved",
    ...overrides,
  };
}

function seedRows() {
  mocks.bridgeRows = [
    bridgeRow(),
    bridgeRow({
      id: 2,
      activationStatus: "draft",
      dbRegulationId: "DRAFT_REFERENCE",
      dbMappingId: 8,
    }),
    bridgeRow({
      id: 3,
      activationStatus: "approved_for_shadow",
      dbRegulationId: "SHADOW_REFERENCE",
      dbMappingId: 9,
    }),
    bridgeRow({
      id: 4,
      activationStatus: "approved_for_limited_runtime",
      dbRegulationId: "LIMITED_REVIEW_REFERENCE",
      dbMappingId: 10,
    }),
    bridgeRow({
      id: 5,
      activationStatus: "active_limited_runtime",
      dbRegulationId: "ACTIVE_LIMITED_REFERENCE",
      dbMappingId: 11,
    }),
    bridgeRow({
      id: 6,
      activationStatus: "paused",
      dbRegulationId: "PAUSED_REFERENCE",
      dbMappingId: 12,
    }),
    bridgeRow({
      id: 7,
      activationStatus: "rolled_back",
      dbRegulationId: "ROLLED_BACK_REFERENCE",
      dbMappingId: 13,
    }),
    bridgeRow({
      id: 8,
      activationStatus: "rejected",
      dbRegulationId: "REJECTED_REFERENCE",
      dbMappingId: 14,
    }),
    bridgeRow({
      id: 9,
      activationStatus: "archived",
      dbRegulationId: "ARCHIVED_REFERENCE",
      dbMappingId: 15,
    }),
    bridgeRow({
      id: 20,
      dbRegulationId: "UNAPPROVED_REFERENCE",
      dbMappingId: null,
      deterministicRuleId: "deterministic-violation-unapproved-v1",
      violationCategory: "UNAPPROVED_CATEGORY",
    }),
    bridgeRow({
      id: 21,
      dbRegulationId: "INACTIVE_REFERENCE",
      dbMappingId: null,
      deterministicRuleId: "deterministic-violation-inactive-v1",
      violationCategory: "INACTIVE_CATEGORY",
    }),
    bridgeRow({
      id: 22,
      dbRegulationId: "SUPERSEDED_REFERENCE",
      dbMappingId: null,
      deterministicRuleId: "deterministic-violation-superseded-v1",
      violationCategory: "SUPERSEDED_CATEGORY",
    }),
    bridgeRow({
      id: 23,
      dbRegulationId: "MISSING_FIELDS_REFERENCE",
      dbMappingId: null,
      deterministicRuleId: "deterministic-violation-missing-fields-v1",
      violationCategory: "MISSING_FIELDS_CATEGORY",
    }),
    bridgeRow({
      id: 24,
      dbRegulationId: "PIPEDA_4_6",
      dbMappingId: 99,
      deterministicRuleId: "deterministic-violation-invalid-mapping-v1",
      violationCategory: "INVALID_MAPPING_CATEGORY",
    }),
    bridgeRow({
      id: 30,
      dbRegulationId: "METRO2_BASE_SEGMENT",
      dbMappingId: null,
      deterministicRuleId: "deterministic-violation-private-standard-v1",
      violationCategory: "PRIVATE_STANDARD_CATEGORY",
      referenceClass: "private_standard",
      consumerWordingMode: "private_standard_reference",
    }),
    bridgeRow({
      id: 31,
      dbRegulationId: "INTERNAL_ONLY_REFERENCE",
      dbMappingId: null,
      deterministicRuleId: "deterministic-violation-internal-only-v1",
      violationCategory: "INTERNAL_ONLY_CATEGORY",
      referenceClass: "internal_only",
      consumerWordingMode: "internal_only",
    }),
  ];

  mocks.regulationRows = [
    regulationRow(),
    regulationRow({ regulationId: "DRAFT_REFERENCE" }),
    regulationRow({ regulationId: "SHADOW_REFERENCE" }),
    regulationRow({ regulationId: "LIMITED_REVIEW_REFERENCE" }),
    regulationRow({ regulationId: "ACTIVE_LIMITED_REFERENCE" }),
    regulationRow({ regulationId: "PAUSED_REFERENCE" }),
    regulationRow({ regulationId: "ROLLED_BACK_REFERENCE" }),
    regulationRow({ regulationId: "REJECTED_REFERENCE" }),
    regulationRow({ regulationId: "ARCHIVED_REFERENCE" }),
    regulationRow({ regulationId: "UNAPPROVED_REFERENCE", reviewStatus: "pending_review" }),
    regulationRow({ regulationId: "INACTIVE_REFERENCE", activeStatus: "inactive" }),
    regulationRow({ regulationId: "SUPERSEDED_REFERENCE", repealSupersededStatus: "superseded" }),
    regulationRow({
      regulationId: "MISSING_FIELDS_REFERENCE",
      regulationTitle: "",
      shortTitle: "",
      citationFormat: "",
      sectionNumber: "",
      jurisdiction: "",
      officialSourceUrl: "",
      regulationCategory: "",
    }),
    regulationRow({
      regulationId: "METRO2_BASE_SEGMENT",
      regulationTitle: "Metro 2 Base Segment",
      shortTitle: "Metro 2 Base Segment",
      citationFormat: "Metro 2 Base Segment",
      sectionNumber: "Metro 2 Base Segment",
      jurisdiction: "Universal",
      authoritySource: "Private reporting standard",
      officialSourceUrl: "",
      regulationCategory: "reporting_standard",
    }),
    regulationRow({
      regulationId: "INTERNAL_ONLY_REFERENCE",
      regulationTitle: "Internal Review Reference",
      shortTitle: "Internal Review Reference",
      citationFormat: "Internal reference",
      sectionNumber: "Internal reference",
      jurisdiction: "Internal",
      authoritySource: "internal_only",
      regulationCategory: "internal_only",
    }),
  ];

  mocks.mappingRows = [
    mappingRow(),
    mappingRow({ id: 8, regulationId: "DRAFT_REFERENCE" }),
    mappingRow({ id: 9, regulationId: "SHADOW_REFERENCE" }),
    mappingRow({ id: 10, regulationId: "LIMITED_REVIEW_REFERENCE" }),
    mappingRow({ id: 11, regulationId: "ACTIVE_LIMITED_REFERENCE" }),
    mappingRow({ id: 12, regulationId: "PAUSED_REFERENCE" }),
    mappingRow({ id: 13, regulationId: "ROLLED_BACK_REFERENCE" }),
    mappingRow({ id: 14, regulationId: "REJECTED_REFERENCE" }),
    mappingRow({ id: 15, regulationId: "ARCHIVED_REFERENCE" }),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  seedRows();
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "admin" },
  });
});

describe("advisory regulation bridge report endpoint", () => {
  it("lets admins read an advisory report with static runtime safety messaging", async () => {
    const response = await handle(getRequest("/_api/regulation-registry/advisory-bridge/report?bridgeMappingId=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("advisory");
    expect(body.runtimeSourceUsed).toBe("static_runtime");
    expect(body.summary).toEqual(expect.objectContaining({
      totalBridgeMappingsConsidered: 1,
      totalAdvisoryEligible: 1,
      totalAdvisoryReferences: 1,
    }));
    expect(body.safetyMessages).toEqual(expect.arrayContaining([
      "This is an advisory diagnostic only.",
      "Static runtime references remain active consumer-facing truth.",
      "DB advisory references are admin/internal only.",
      "This endpoint does not change packet wording, packet readiness, or violation firing.",
    ]));
    expect(body.results).toEqual([
      expect.objectContaining({
        mode: "advisory",
        runtimeSourceUsed: "static_runtime",
        deterministicRuleId: ruleId,
        violationCategory,
        staticReferenceId: "PIPEDA_4_6",
        consumerReference: expect.objectContaining({ id: "PIPEDA_4_6" }),
        advisoryReference: expect.objectContaining({
          displayScope: "admin_internal_only",
          bridgeMappingId: "1",
          dbRegulationId: "PIPEDA_4_6",
        }),
        fallbackUsed: false,
      }),
    ]);
  });

  it("denies unauthenticated and non-admin requests before DB reads", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({ user: null });
    const unauthenticated = await handle(getRequest());

    mocks.getServerUserSession.mockResolvedValueOnce({ user: { id: 11, role: "user" } });
    const nonAdmin = await handle(getRequest());

    expect(unauthenticated.status).toBe(403);
    expect(nonAdmin.status).toBe(403);
    expect(mocks.selectFrom).not.toHaveBeenCalled();
  });

  it("is read-only and leaves static runtime mappings unchanged", async () => {
    const staticMappingsBefore = JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP);
    const authoritiesBefore = JSON.stringify(localLegalAuthorities);

    const response = await handle(getRequest("/_api/regulation-registry/advisory-bridge/report?bridgeMappingId=1"));

    expect(response.status).toBe(200);
    expect(mocks.selectFrom).toHaveBeenCalledWith("regulationRuntimeBridgeMapping");
    expect(mocks.selectFrom).toHaveBeenCalledWith("regulationRegistry");
    expect(mocks.selectFrom).toHaveBeenCalledWith("regulationViolationMapping");
    expect(mocks.insertInto).not.toHaveBeenCalled();
    expect(mocks.updateTable).not.toHaveBeenCalled();
    expect(mocks.deleteFrom).not.toHaveBeenCalled();
    expect(mocks.createReconciliationCandidatesFromFindings).not.toHaveBeenCalled();
    expect(mocks.approveRegulationCandidate).not.toHaveBeenCalled();
    expect(mocks.upsertRegulationViolationMapping).not.toHaveBeenCalled();
    expect(JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP)).toBe(staticMappingsBefore);
    expect(JSON.stringify(localLegalAuthorities)).toBe(authoritiesBefore);
  });

  it.each([
    ["draft", 2],
    ["approved_for_shadow", 3],
    ["approved_for_limited_runtime", 4],
    ["active_limited_runtime", 5],
    ["paused", 6],
    ["rolled_back", 7],
    ["rejected", 8],
    ["archived", 9],
  ])("%s mapping produces no advisory reference", async (activationStatus, bridgeMappingId) => {
    const response = await handle(
      getRequest(`/_api/regulation-registry/advisory-bridge/report?bridgeMappingId=${bridgeMappingId}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results[0].advisoryReference).toBeUndefined();
    expect(body.results[0].runtimeSourceUsed).toBe("static_runtime");
    expect(body.results[0].consumerReference).toEqual(expect.objectContaining({ id: "PIPEDA_4_6" }));
    expect(body.results[0].warnings).toEqual(
      expect.arrayContaining([`bridge_mapping_not_advisory_eligible:${activationStatus}`]),
    );
  });

  it("warns and falls back for unsafe DB records and invalid DB mappings", async () => {
    const response = await handle(
      getRequest("/_api/regulation-registry/advisory-bridge/report?bridgeMode=advisory&activationStatus=approved_for_advisory&limit=300"),
    );
    const body = await response.json();
    const ignoredByBridgeId = new Map(
      body.ignoredMappings.map((item: { bridgeMappingId: string; reasons: string[] }) => [
        item.bridgeMappingId,
        item.reasons,
      ]),
    );

    expect(ignoredByBridgeId.get("20")).toContain("db_record_unapproved");
    expect(ignoredByBridgeId.get("21")).toContain("db_record_inactive");
    expect(ignoredByBridgeId.get("22")).toContain("db_record_superseded_or_repealed");
    expect(ignoredByBridgeId.get("23")).toEqual(
      expect.arrayContaining([
        "db_record_missing_jurisdiction",
        "db_record_missing_category",
        "db_record_missing_title",
        "db_record_missing_citation",
        "db_record_missing_source_url",
      ]),
    );
    expect(ignoredByBridgeId.get("24")).toContain("db_mapping_missing");
  });

  it("does not let a bridgeMappingId filter hide sibling ambiguity", async () => {
    mocks.bridgeRows = [
      bridgeRow({ id: 1 }),
      bridgeRow({ id: 40, dbRegulationId: "PIPEDA_4_6_ALT", dbMappingId: null }),
    ];
    mocks.regulationRows = [
      regulationRow(),
      regulationRow({ regulationId: "PIPEDA_4_6_ALT", citationFormat: "Schedule 1, Principle 4.6 ALT" }),
    ];
    mocks.mappingRows = [mappingRow()];

    const response = await handle(getRequest("/_api/regulation-registry/advisory-bridge/report?bridgeMappingId=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].bridgeMappingId).toBe("1");
    expect(body.results[0].advisoryReference).toBeUndefined();
    expect(body.results[0].warnings).toContain("ambiguous_advisory_bridge_mapping");
  });

  it("keeps private standards separate from law and internal-only records admin/internal scoped", async () => {
    const privateResponse = await handle(
      getRequest("/_api/regulation-registry/advisory-bridge/report?bridgeMappingId=30"),
    );
    const privateBody = await privateResponse.json();
    const internalResponse = await handle(
      getRequest("/_api/regulation-registry/advisory-bridge/report?bridgeMappingId=31"),
    );
    const internalBody = await internalResponse.json();
    const serialized = JSON.stringify({ privateBody, internalBody });

    expect(privateBody.results[0].advisoryReference).toEqual(
      expect.objectContaining({
        displayScope: "admin_internal_only",
        referenceClass: "private_standard",
        advisoryReason: "This private or industry standard may be relevant for admin review; it is not presented as law.",
      }),
    );
    expect(privateBody.results[0].advisoryReference.advisoryReason).not.toMatch(/official law/i);
    expect(internalBody.results[0].advisoryReference).toEqual(
      expect.objectContaining({
        displayScope: "admin_internal_only",
        referenceClass: "internal_only",
        advisoryReason: "Internal reference only. Not consumer-facing.",
      }),
    );
    expect(serialized).not.toMatch(/\billegal\b/i);
    expect(serialized).not.toMatch(/\bviolates? the law\b/i);
    expect(serialized).not.toMatch(/confirmed violation/i);
    expect(serialized).not.toMatch(/entitled to damages/i);
    expect(serialized).not.toMatch(/must pay/i);
    expect(serialized).not.toMatch(/\benforce\b/i);
    expect(serialized).not.toMatch(/\bdemand\b/i);
  });

  it("supports diagnostic filters and bounds result arrays", async () => {
    const filterChecks = [
      `deterministicRuleId=${encodeURIComponent(ruleId)}`,
      `violationCategory=${violationCategory}`,
      "staticReferenceId=PIPEDA_4_6",
      "dbRegulationId=PIPEDA_4_6",
      "dbMappingId=7",
      "bridgeMappingId=1",
      "referenceClass=official_law",
      "consumerWordingMode=review_reference",
      "activationStatus=approved_for_advisory",
      "bridgeMode=advisory",
    ];

    for (const query of filterChecks) {
      const response = await handle(getRequest(`/_api/regulation-registry/advisory-bridge/report?${query}`));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.results.length).toBeGreaterThan(0);
    }

    const limited = await (await handle(getRequest("/_api/regulation-registry/advisory-bridge/report?limit=1"))).json();
    expect(limited.results.length).toBeLessThanOrEqual(1);
    expect(limited.summary.totalBridgeMappingsConsidered).toBe(1);
  });

  it("returns safe validation errors for invalid filters", async () => {
    const response = await handle(
      getRequest("/_api/regulation-registry/advisory-bridge/report?referenceClass=confirmed_legal_violation&limit=999"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
  });

  it("imports no runtime selector, packet, parser, registry mutation, or candidate creation paths", () => {
    const source = readFileSync(
      join(process.cwd(), "endpoints", "regulation-registry", "advisory-bridge", "report_GET.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/runtimeSelector|limitedRuntimeSelector|selectRuntimeReference/);
    expect(source).not.toMatch(/complianceScanner/);
    expect(source).not.toMatch(/from\s+["'].*packet/i);
    expect(source).not.toMatch(/from\s+["'].*parser/i);
    expect(source).not.toMatch(/from\s+["'].*canonical/i);
    expect(source).not.toMatch(/from\s+["'].*ocr/i);
    expect(source).not.toMatch(/approveRegulationCandidate|upsertRegulationViolationMapping/);
    expect(source).not.toMatch(/createReconciliationCandidatesFromFindings/);
    expect(source).not.toMatch(/insertInto\(|updateTable\(|deleteFrom\(/);
  });
});
