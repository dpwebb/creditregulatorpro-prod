import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAdvisoryBridgeReferenceLabel,
  buildRegulationRuntimeBridgeAdvisoryResult,
  containsForbiddenAdvisoryReferenceLanguage,
  type AdvisoryBridgeActivationStatus,
  type AdvisoryBridgeMappingSnapshot,
} from "../../helpers/regulationRuntimeBridgeAdvisory";
import type {
  DbRuntimeMappingSnapshot,
  DbRuntimeReferenceSnapshot,
  StaticRuntimeReferenceMappingSnapshot,
  StaticRuntimeReferenceSnapshot,
} from "../../helpers/regulationRuntimeBridgeShadow";

const ruleId = "deterministic-violation-balance-calculation-violation-v1";
const violationCategory = "BALANCE_CALCULATION_VIOLATION";

const staticPipeda: StaticRuntimeReferenceSnapshot = {
  id: "PIPEDA_4_6",
  title: "Accuracy",
  shortLabel: "Accuracy",
  citation: "Schedule 1, Principle 4.6",
  jurisdiction: "Federal",
  category: "category_principle",
  sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
  authorityType: "privacy_principle",
  sourceQuality: "official",
  supportLevel: "category_principle",
};

const staticMappings: StaticRuntimeReferenceMappingSnapshot[] = [
  {
    deterministicRuleId: ruleId,
    violationCategory,
    regulationId: "PIPEDA_4_6",
  },
];

const approvedDbPipeda: DbRuntimeReferenceSnapshot = {
  regulationId: "PIPEDA_4_6",
  title: "Accuracy DB Review",
  citationFormat: "Schedule 1, Principle 4.6",
  jurisdiction: "Federal",
  category: "category_principle",
  officialSourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
  effectiveDate: "2001-01-01",
  updateVersion: 1,
  reviewStatus: "approved",
  activeStatus: "active",
  repealSupersededStatus: "current",
};

function bridgeMapping(
  overrides: Partial<AdvisoryBridgeMappingSnapshot> = {},
): AdvisoryBridgeMappingSnapshot {
  return {
    id: "bridge-1",
    bridgeMode: "advisory",
    activationStatus: "approved_for_advisory",
    deterministicRuleId: ruleId,
    violationCategory,
    staticReferenceId: "PIPEDA_4_6",
    dbRegulationId: "PIPEDA_4_6",
    dbMappingId: "7",
    referenceClass: "official_law",
    consumerWordingMode: "review_reference",
    activationReason: "Admin advisory review only.",
    sourceVersion: "unit-advisory",
    ...overrides,
  };
}

function dbMapping(overrides: Partial<DbRuntimeMappingSnapshot> = {}): DbRuntimeMappingSnapshot {
  return {
    mappingId: "7",
    regulationId: "PIPEDA_4_6",
    deterministicRuleId: ruleId,
    violationCategory,
    reviewStatus: "approved",
    activeStatus: "active",
    referenceClass: "official_law",
    consumerWordingMode: "review_reference",
    ...overrides,
  };
}

function advisoryInput(overrides: {
  staticReferences?: StaticRuntimeReferenceSnapshot[];
  staticViolationMappings?: StaticRuntimeReferenceMappingSnapshot[];
  dbRegulations?: DbRuntimeReferenceSnapshot[];
  dbMappings?: DbRuntimeMappingSnapshot[];
  bridgeMappings?: AdvisoryBridgeMappingSnapshot[];
  consumerFacing?: boolean;
} = {}) {
  return {
    staticReferences: overrides.staticReferences ?? [staticPipeda],
    staticViolationMappings: overrides.staticViolationMappings ?? staticMappings,
    dbRegulations: overrides.dbRegulations ?? [approvedDbPipeda],
    dbMappings: overrides.dbMappings ?? [dbMapping()],
    bridgeMappings: overrides.bridgeMappings ?? [bridgeMapping()],
    context: {
      deterministicRuleId: ruleId,
      violationCategory,
      consumerFacing: overrides.consumerFacing,
    },
  };
}

describe("advisory regulation runtime bridge helper", () => {
  it("preserves static runtime truth as the consumer reference", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      dbRegulations: [
        {
          ...approvedDbPipeda,
          citationFormat: "Different DB Citation",
        },
      ],
    }));

    expect(result.mode).toBe("advisory");
    expect(result.runtimeSourceUsed).toBe("static_runtime");
    expect(result.consumerReference).toEqual(staticPipeda);
    expect(result.consumerReference?.citation).toBe("Schedule 1, Principle 4.6");
    expect(result.advisoryReference?.citation).toBe("Different DB Citation");
  });

  it("allows approved_for_advisory advisory mappings to produce admin-only metadata", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput());

    expect(result.advisoryReference).toEqual(
      expect.objectContaining({
        displayScope: "admin_internal_only",
        bridgeMappingId: "bridge-1",
        dbRegulationId: "PIPEDA_4_6",
        dbMappingId: "7",
        referenceClass: "official_law",
        consumerWordingMode: "review_reference",
        sourceVersion: "unit-advisory",
        advisoryReason: "This DB reference may be relevant for admin review.",
      }),
    );
    expect(result.fallbackUsed).toBe(false);
  });

  it.each([
    "draft",
    "approved_for_shadow",
    "approved_for_limited_runtime",
    "active_limited_runtime",
    "paused",
    "rolled_back",
    "rejected",
    "archived",
  ] satisfies AdvisoryBridgeActivationStatus[])("%s does not produce advisory metadata", (activationStatus) => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      bridgeMappings: [bridgeMapping({ activationStatus })],
    }));

    expect(result.advisoryReference).toBeUndefined();
    expect(result.runtimeSourceUsed).toBe("static_runtime");
    expect(result.consumerReference).toEqual(staticPipeda);
    expect(result.warnings).toEqual(
      expect.arrayContaining([`bridge_mapping_not_advisory_eligible:${activationStatus}`]),
    );
  });

  it("does not treat non-advisory bridge modes as advisory", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      bridgeMappings: [bridgeMapping({ bridgeMode: "shadow" })],
    }));

    expect(result.advisoryReference).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining(["bridge_mapping_not_advisory_eligible:approved_for_advisory"]),
    );
  });

  it.each([
    [{ reviewStatus: "pending_review" }, "db_record_unapproved"],
    [{ activeStatus: "inactive" }, "db_record_inactive"],
    [{ repealSupersededStatus: "superseded" }, "db_record_superseded_or_repealed"],
    [{ officialSourceUrl: null, sourceUrl: null, sourceDocumentUrl: null }, "db_record_missing_source_url"],
    [{ citationFormat: null, citation: null, sectionNumber: null }, "db_record_missing_citation"],
    [{ jurisdiction: null }, "db_record_missing_jurisdiction"],
    [{ category: null, regulationCategory: null }, "db_record_missing_category"],
    [{ title: null, regulationTitle: null, shortTitle: null }, "db_record_missing_title"],
  ] as Array<[Partial<DbRuntimeReferenceSnapshot>, string]>)(
    "fails closed when DB record has %s",
    (dbOverride, warning) => {
      const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
        dbRegulations: [{ ...approvedDbPipeda, ...dbOverride }],
      }));

      expect(result.advisoryReference).toBeUndefined();
      expect(result.consumerReference).toEqual(staticPipeda);
      expect(result.warnings).toContain(warning);
    },
  );

  it("requires supplied DB mapping IDs to resolve to approved active mappings", () => {
    const missing = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({ dbMappings: [] }));
    const unapproved = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      dbMappings: [dbMapping({ reviewStatus: "pending_review" })],
    }));
    const inactive = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      dbMappings: [dbMapping({ activeStatus: "inactive" })],
    }));

    expect(missing.advisoryReference).toBeUndefined();
    expect(missing.warnings).toContain("db_mapping_missing");
    expect(unapproved.advisoryReference).toBeUndefined();
    expect(unapproved.warnings).toContain("db_mapping_unapproved");
    expect(inactive.advisoryReference).toBeUndefined();
    expect(inactive.warnings).toContain("db_mapping_inactive");
  });

  it("fails closed on multiple matching advisory mappings", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      bridgeMappings: [
        bridgeMapping({ id: "bridge-1" }),
        bridgeMapping({ id: "bridge-2", dbMappingId: "8" }),
      ],
      dbMappings: [dbMapping(), dbMapping({ mappingId: "8" })],
    }));

    expect(result.advisoryReference).toBeUndefined();
    expect(result.consumerReference).toEqual(staticPipeda);
    expect(result.warnings).toContain("ambiguous_advisory_bridge_mapping");
  });

  it("does not substitute DB advisory records when static fallback is missing", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      staticReferences: [],
      staticViolationMappings: [],
    }));

    expect(result.consumerReference).toBeNull();
    expect(result.advisoryReference).toBeUndefined();
    expect(result.warnings).toContain("static_fallback_missing");
  });

  it("keeps private standards separate from law in advisory wording", () => {
    const privateStandardDb: DbRuntimeReferenceSnapshot = {
      ...approvedDbPipeda,
      regulationId: "METRO2_BASE_SEGMENT",
      title: "Metro 2 Base Segment",
      citationFormat: "Metro 2 Base Segment",
      category: "reporting_standard",
      officialSourceUrl: null,
      sourceQuality: "private_standard",
    };
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      dbRegulations: [privateStandardDb],
      bridgeMappings: [
        bridgeMapping({
          dbRegulationId: "METRO2_BASE_SEGMENT",
          dbMappingId: null,
          referenceClass: "private_standard",
          consumerWordingMode: "private_standard_reference",
        }),
      ],
      dbMappings: [],
    }));

    expect(result.advisoryReference).toEqual(
      expect.objectContaining({
        displayScope: "admin_internal_only",
        referenceClass: "private_standard",
        advisoryReason: "This private or industry standard may be relevant for admin review; it is not presented as law.",
      }),
    );
    expect(result.advisoryReference?.advisoryReason).not.toMatch(/official law/i);
    expect(containsForbiddenAdvisoryReferenceLanguage(result.advisoryReference?.advisoryReason)).toBe(false);
  });

  it("prevents internal-only references from becoming consumer-facing", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      bridgeMappings: [
        bridgeMapping({
          referenceClass: "internal_only",
          consumerWordingMode: "internal_only",
        }),
      ],
    }));
    const label = buildAdvisoryBridgeReferenceLabel({ referenceClass: "internal_only" });

    expect(result.advisoryReference).toBeUndefined();
    expect(result.warnings).toContain("internal_only_not_consumer_facing");
    expect(label).toBe("Internal reference only. Not consumer-facing.");
    expect(containsForbiddenAdvisoryReferenceLanguage(label)).toBe(false);
  });

  it("allows internal-only advisory metadata only for explicit internal diagnostic context", () => {
    const result = buildRegulationRuntimeBridgeAdvisoryResult(advisoryInput({
      consumerFacing: false,
      bridgeMappings: [
        bridgeMapping({
          referenceClass: "internal_only",
          consumerWordingMode: "internal_only",
        }),
      ],
    }));

    expect(result.advisoryReference).toEqual(
      expect.objectContaining({
        displayScope: "admin_internal_only",
        referenceClass: "internal_only",
        advisoryReason: "Internal reference only. Not consumer-facing.",
      }),
    );
  });

  it("does not mutate supplied static or DB snapshots and imports no runtime mutation paths", () => {
    const input = advisoryInput();
    const staticBefore = JSON.stringify(input.staticReferences);
    const staticMappingBefore = JSON.stringify(input.staticViolationMappings);
    const dbBefore = JSON.stringify(input.dbRegulations);
    const dbMappingBefore = JSON.stringify(input.dbMappings);
    const bridgeBefore = JSON.stringify(input.bridgeMappings);

    buildRegulationRuntimeBridgeAdvisoryResult(input);

    expect(JSON.stringify(input.staticReferences)).toBe(staticBefore);
    expect(JSON.stringify(input.staticViolationMappings)).toBe(staticMappingBefore);
    expect(JSON.stringify(input.dbRegulations)).toBe(dbBefore);
    expect(JSON.stringify(input.dbMappings)).toBe(dbMappingBefore);
    expect(JSON.stringify(input.bridgeMappings)).toBe(bridgeBefore);

    const helperSource = readFileSync(
      join(process.cwd(), "helpers", "regulationRuntimeBridgeAdvisory.ts"),
      "utf8",
    );

    expect(helperSource).not.toContain("complianceScanner");
    expect(helperSource).not.toContain("regulationRegistryService");
    expect(helperSource).not.toContain("approveRegulationCandidate");
    expect(helperSource).not.toContain("upsertRegulationViolationMapping");
    expect(helperSource).not.toContain("insertInto(");
    expect(helperSource).not.toContain("updateTable(");
    expect(helperSource).not.toContain("deleteFrom(");
    expect(helperSource).not.toMatch(/from\s+["']\.\/db["']/);
    expect(helperSource).not.toMatch(/from\s+["'].*packet/i);
    expect(helperSource).not.toMatch(/from\s+["'].*parser/i);
    expect(helperSource).not.toMatch(/from\s+["'].*canonical/i);
    expect(helperSource).not.toMatch(/from\s+["'].*ocr/i);
    expect(helperSource).not.toMatch(/runtimeSelector|limitedRuntimeSelector|selectRuntimeReference/);
  });
});
