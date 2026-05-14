import { beforeEach, describe, expect, it, vi } from "vitest";

import { localLegalAuthorities } from "../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../helpers/regulationRegistry";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import { evaluateViolationPacketConfidenceGate } from "../../helpers/violationPacketConfidenceGate";
import { buildDeterministicViolationRuleEnvelope } from "../../helpers/violationRuleEvidence";

const mocks = vi.hoisted(() => ({
  getServerUserSession: vi.fn(),
  selectFrom: vi.fn((table: string) => {
    const state = {
      filters: [] as Array<{ column: string; value: unknown }>,
      limit: null as number | null,
    };
    const builder = {
      select: vi.fn(() => builder),
      where: vi.fn((column: string, _operator: string, value: unknown) => {
        state.filters.push({ column, value });
        return builder;
      }),
      orderBy: vi.fn(() => builder),
      limit: vi.fn((value: number) => {
        state.limit = value;
        return builder;
      }),
      execute: vi.fn(async () => {
        const sourceRows = table === "regulationRegistry" ? mocks.regulationRows : mocks.mappingRows;
        const rows = sourceRows.filter((row: Record<string, unknown>) =>
          state.filters.every((filter) => row[filter.column] === filter.value),
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

import { handle } from "../../endpoints/regulation-registry/shadow-bridge/report_GET";

const activeRuleId = "deterministic-violation-balance-calculation-violation-v1";

function getRequest(path = "/_api/regulation-registry/shadow-bridge/report") {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

function registryRow(overrides: Record<string, unknown> = {}) {
  return {
    regulationId: "PIPEDA_4_6",
    regulationTitle: "Accuracy",
    shortTitle: "Accuracy",
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
    id: 1,
    regulationId: "PIPEDA_4_6",
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    active: true,
    reviewStatus: "approved",
    ...overrides,
  };
}

function seedRows() {
  mocks.regulationRows = [
    registryRow(),
    registryRow({
      regulationId: "PIPEDA_4_6_DIFF",
      citationFormat: "Schedule 1, Principle 9.9",
      sourceContentHash: "hash-diff",
    }),
    registryRow({
      regulationId: "UNAPPROVED_DB_REFERENCE",
      reviewStatus: "pending_review",
      sourceContentHash: "hash-unapproved",
    }),
    registryRow({
      regulationId: "INACTIVE_DB_REFERENCE",
      activeStatus: "inactive",
      sourceContentHash: "hash-inactive",
    }),
    registryRow({
      regulationId: "SUPERSEDED_DB_REFERENCE",
      repealSupersededStatus: "superseded",
      sourceContentHash: "hash-superseded",
    }),
    registryRow({
      regulationId: "MISSING_FIELDS_REFERENCE",
      officialSourceUrl: "",
      sourceDocumentUrl: null,
      citationFormat: "",
      sectionNumber: "",
      jurisdiction: "",
      sourceContentHash: "hash-missing",
    }),
    registryRow({
      regulationId: "METRO2_BASE_SEGMENT",
      regulationTitle: "Base Segment",
      shortTitle: "Metro2 Base Segment",
      citationFormat: "Metro2 Base Segment",
      sectionNumber: "Metro2 Base Segment",
      jurisdiction: "Universal",
      authoritySource: "Private reporting standard",
      officialSourceUrl: "",
      sourceDocumentUrl: null,
      regulationCategory: "reporting_standard",
      sourceContentHash: "hash-metro2",
    }),
    registryRow({
      regulationId: "INTERNAL_ONLY_REFERENCE",
      regulationTitle: "Internal Review Reference",
      shortTitle: "Internal Review Reference",
      citationFormat: "Internal reference",
      sectionNumber: "Internal reference",
      jurisdiction: "Internal",
      authoritySource: "internal_only",
      regulationCategory: "internal_only",
      sourceContentHash: "hash-internal",
    }),
  ];

  mocks.mappingRows = [
    mappingRow({ id: 1, regulationId: "PIPEDA_4_6" }),
    mappingRow({ id: 2, regulationId: "PIPEDA_4_6_DIFF" }),
    mappingRow({ id: 3, regulationId: "UNAPPROVED_DB_REFERENCE" }),
    mappingRow({ id: 4, regulationId: "INACTIVE_DB_REFERENCE" }),
    mappingRow({ id: 5, regulationId: "SUPERSEDED_DB_REFERENCE" }),
    mappingRow({ id: 6, regulationId: "MISSING_FIELDS_REFERENCE" }),
    mappingRow({ id: 7, regulationId: "METRO2_BASE_SEGMENT", violationCategory: "DOCUMENTATION_CHAIN_FAILURE" }),
    mappingRow({ id: 8, regulationId: "INTERNAL_ONLY_REFERENCE" }),
  ];
}

function sampleViolation() {
  return {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    severity: "WARNING",
    confidenceScore: 95,
    userExplanation: "Reported balance appears inconsistent.",
    recommendedAction: "Review the reported balance.",
    responsibleEntity: "CREDITOR",
    technicalDetails: {
      fieldName: "balance",
      reportedValue: 200,
      expectedValue: 100,
      regulationIds: ["PIPEDA_4_6"],
    },
  } as any;
}

function samplePacketContent() {
  return buildSimpleDisputePacketContent({
    packetType: "credit_bureau",
    reportType: "Synthetic report",
    reportDate: "2026-05-14",
    dateGenerated: "2026-05-14",
    recipient: { type: "credit_bureau", name: "Synthetic Bureau", address: ["1 Bureau St"] },
    consumer: { name: "Test Consumer", address: ["1 Consumer St"] },
    disputedItems: [
      {
        issueId: 1,
        tradelineId: 2,
        creditorCollectorName: "Test Creditor",
        accountNumber: "1234567890",
        disputedField: "Balance",
        reportedValue: "$200",
        expectedValue: "$100",
        issueType: "BALANCE_CALCULATION_VIOLATION",
        evidenceReference: "Source report; field: balance; page 1",
        requestedAction: "correct balance",
      },
    ],
    generatedByUserId: 1,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seedRows();
  mocks.getServerUserSession.mockResolvedValue({
    user: { id: 10, role: "admin" },
  });
});

describe("shadow regulation bridge report endpoint", () => {
  it("lets admins read a shadow report with safety messaging", async () => {
    const response = await handle(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bridgeMode).toBe("shadow");
    expect(body.runtimeSourceUsed).toBe("static_runtime");
    expect(body.safetyMessages).toEqual(
      expect.arrayContaining([
        "This is a shadow diagnostic only.",
        "Static runtime references remain active.",
        "DB references shown here do not change consumer output.",
        "Runtime activation requires a separate approved bridge implementation.",
      ]),
    );
    expect(body.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staticReferenceId: "PIPEDA_4_6",
          dbRegulationId: "PIPEDA_4_6",
          bridgeMode: "shadow",
          runtimeSourceUsed: "static_runtime",
          staticRuntimeReferenceStatus: "active_static_runtime",
          dbReferenceStatus: "shadow_only",
        }),
      ]),
    );
  });

  it("blocks non-admins before DB reads", async () => {
    mocks.getServerUserSession.mockResolvedValueOnce({
      user: { id: 11, role: "user" },
    });

    const response = await handle(getRequest());

    expect(response.status).toBe(403);
    expect(mocks.selectFrom).not.toHaveBeenCalled();
  });

  it("is read-only against DB tables and static runtime mappings", async () => {
    const mappingBefore = JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP);
    const authoritiesBefore = JSON.stringify(localLegalAuthorities);

    const response = await handle(getRequest());

    expect(response.status).toBe(200);
    expect(mocks.selectFrom).toHaveBeenCalledWith("regulationRegistry");
    expect(mocks.selectFrom).toHaveBeenCalledWith("regulationViolationMapping");
    expect(mocks.insertInto).not.toHaveBeenCalled();
    expect(mocks.updateTable).not.toHaveBeenCalled();
    expect(mocks.deleteFrom).not.toHaveBeenCalled();
    expect(JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP)).toBe(mappingBefore);
    expect(JSON.stringify(localLegalAuthorities)).toBe(authoritiesBefore);
  });

  it("keeps approved DB references shadow-only and invalid DB rows ignored or flagged", async () => {
    const response = await handle(getRequest());
    const body = await response.json();

    expect(body.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dbRegulationId: "PIPEDA_4_6_DIFF",
          dbReferenceStatus: "shadow_only",
          reason: expect.stringContaining("shadow comparison only"),
          limitedRuntimeUnsafeReasons: expect.arrayContaining(["shadow_mode_only"]),
        }),
      ]),
    );
    const ignoredById = new Map(
      body.ignoredDbReferences.map((item: { dbRegulationId: string; reasons: string[] }) => [
        item.dbRegulationId,
        item.reasons,
      ]),
    );
    expect(ignoredById.get("UNAPPROVED_DB_REFERENCE")).toContain("db_record_unapproved");
    expect(ignoredById.get("INACTIVE_DB_REFERENCE")).toContain("db_record_inactive");
    expect(ignoredById.get("SUPERSEDED_DB_REFERENCE")).toContain("db_record_superseded_or_repealed");
    expect(ignoredById.get("MISSING_FIELDS_REFERENCE")).toEqual(
      expect.arrayContaining([
        "db_record_missing_jurisdiction",
        "db_record_missing_citation",
        "db_record_missing_source_url",
      ]),
    );
  });

  it("keeps consumer wording neutral for private standards and internal-only references", async () => {
    const response = await handle(getRequest());
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dbRegulationId: "METRO2_BASE_SEGMENT",
          referenceClass: "private_standard",
          consumerWordingMode: "private_standard_reference",
          consumerFacingAllowed: true,
        }),
      ]),
    );
    expect(body.ignoredDbReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dbRegulationId: "INTERNAL_ONLY_REFERENCE",
          referenceClass: "internal_only",
          consumerWordingMode: "internal_only",
          reasons: expect.arrayContaining(["internal_only_consumer_context"]),
        }),
      ]),
    );
    expect(serialized).not.toMatch(/confirmed legal violation/i);
    expect(serialized).not.toMatch(/\bthis is illegal\b/i);
    expect(serialized).not.toMatch(/\bviolates? the law\b/i);
    expect(serialized).not.toMatch(/\bentitled to damages\b/i);
  });

  it("supports diagnostic filters and bounds result arrays", async () => {
    await expect(
      (await handle(getRequest(`/_api/regulation-registry/shadow-bridge/report?deterministicRuleId=${activeRuleId}`))).json(),
    ).resolves.toEqual(expect.objectContaining({ filters: expect.objectContaining({ deterministicRuleId: activeRuleId }) }));

    const violationCategory = await (
      await handle(getRequest("/_api/regulation-registry/shadow-bridge/report?violationCategory=DOCUMENTATION_CHAIN_FAILURE"))
    ).json();
    expect(violationCategory.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ dbRegulationId: "METRO2_BASE_SEGMENT" })]),
    );

    const staticReference = await (
      await handle(getRequest("/_api/regulation-registry/shadow-bridge/report?staticReferenceId=PIPEDA_4_6"))
    ).json();
    expect(staticReference.findings.every((item: { staticReferenceId: string }) => item.staticReferenceId === "PIPEDA_4_6")).toBe(true);

    const dbRegulation = await (
      await handle(getRequest("/_api/regulation-registry/shadow-bridge/report?dbRegulationId=METRO2_BASE_SEGMENT"))
    ).json();
    expect(dbRegulation.findings).toHaveLength(1);
    expect(dbRegulation.findings[0].dbRegulationId).toBe("METRO2_BASE_SEGMENT");

    const referenceClass = await (
      await handle(getRequest("/_api/regulation-registry/shadow-bridge/report?referenceClass=private_standard"))
    ).json();
    expect(referenceClass.findings.every((item: { referenceClass: string }) => item.referenceClass === "private_standard")).toBe(true);

    const wordingMode = await (
      await handle(getRequest("/_api/regulation-registry/shadow-bridge/report?consumerWordingMode=private_standard_reference"))
    ).json();
    expect(
      wordingMode.findings.every(
        (item: { consumerWordingMode: string }) => item.consumerWordingMode === "private_standard_reference",
      ),
    ).toBe(true);

    const limited = await (await handle(getRequest("/_api/regulation-registry/shadow-bridge/report?limit=1"))).json();
    expect(limited.findings.length).toBeLessThanOrEqual(1);
    expect(limited.ignoredDbReferences.length).toBeLessThanOrEqual(1);
  });

  it("returns safe validation errors for invalid filters", async () => {
    const response = await handle(
      getRequest("/_api/regulation-registry/shadow-bridge/report?referenceClass=confirmed_legal_violation&limit=999"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
  });

  it("does not change violation output, packet readiness, or packet wording", async () => {
    const violationBefore = buildDeterministicViolationRuleEnvelope(sampleViolation());
    const readinessBefore = evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    });
    const packetBefore = samplePacketContent();

    const response = await handle(getRequest());

    expect(response.status).toBe(200);
    expect(buildDeterministicViolationRuleEnvelope(sampleViolation())).toEqual(violationBefore);
    expect(evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    })).toEqual(readinessBefore);
    expect(samplePacketContent()).toEqual(packetBefore);
  });
});
