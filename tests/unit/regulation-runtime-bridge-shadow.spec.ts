import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { localLegalAuthorities } from "../../helpers/legalAuthorityRegistry";
import { buildSimpleDisputePacketContent } from "../../helpers/disputePacketTemplate";
import { regulationRegistry } from "../../helpers/regulationRegistry";
import {
  buildShadowConsumerReferenceLabel,
  buildRegulationRuntimeBridgeShadowReport,
  containsForbiddenConsumerReferenceLanguage,
  type DbRuntimeMappingSnapshot,
  type DbRuntimeReferenceSnapshot,
  type StaticRuntimeReferenceMappingSnapshot,
  type StaticRuntimeReferenceSnapshot,
} from "../../helpers/regulationRuntimeBridgeShadow";
import { buildDeterministicViolationRuleEnvelope } from "../../helpers/violationRuleEvidence";
import { evaluateViolationPacketConfidenceGate } from "../../helpers/violationPacketConfidenceGate";

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
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    regulationId: "PIPEDA_4_6",
  },
];

const approvedDbPipeda: DbRuntimeReferenceSnapshot = {
  regulationId: "PIPEDA_4_6",
  title: "Accuracy",
  citationFormat: "Schedule 1, Principle 4.6",
  jurisdiction: "Federal",
  category: "category_principle",
  officialSourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
  effectiveDate: "2001-01-01",
  updateVersion: 1,
  reviewStatus: "approved",
  activeStatus: "active",
  repealOrSupersededStatus: "current",
  sourceHash: "db-source-hash",
};

function activeMapping(overrides: Partial<DbRuntimeMappingSnapshot> = {}): DbRuntimeMappingSnapshot {
  return {
    mappingId: "mapping-1",
    regulationId: "PIPEDA_4_6",
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    reviewStatus: "approved",
    activeStatus: "active",
    referenceClass: "official_law",
    consumerWordingMode: "review_reference",
    ...overrides,
  };
}

function report(overrides: {
  dbRegulations?: DbRuntimeReferenceSnapshot[];
  dbMappings?: DbRuntimeMappingSnapshot[];
  staticReferences?: StaticRuntimeReferenceSnapshot[];
  staticViolationMappings?: StaticRuntimeReferenceMappingSnapshot[];
  consumerFacing?: boolean;
} = {}) {
  return buildRegulationRuntimeBridgeShadowReport({
    staticReferences: overrides.staticReferences ?? [staticPipeda],
    staticViolationMappings: overrides.staticViolationMappings ?? staticMappings,
    dbRegulations: overrides.dbRegulations ?? [approvedDbPipeda],
    dbMappings: overrides.dbMappings ?? [activeMapping()],
    context: {
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      consumerFacing: overrides.consumerFacing ?? true,
    },
  });
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
    reportDate: "2026-05-13",
    dateGenerated: "2026-05-13",
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

describe("read-only regulation runtime bridge shadow report", () => {
  it("returns static runtime references as the active result even when a DB alternative exists", () => {
    const result = report({
      dbRegulations: [
        {
          ...approvedDbPipeda,
          citationFormat: "Schedule 1, Principle 9.9",
        },
      ],
    });

    expect(result.bridgeMode).toBe("shadow");
    expect(result.runtimeSourceUsed).toBe("static_runtime");
    expect(result.activeReferenceResult).toEqual({
      runtimeSourceUsed: "static_runtime",
      references: [staticPipeda],
    });
    expect(result.shadowFindings).toHaveLength(1);
    expect(result.shadowFindings[0]).toEqual(
      expect.objectContaining({
        staticReferenceId: "PIPEDA_4_6",
        dbRegulationId: "PIPEDA_4_6",
        mismatchType: "db_alternative_differs_from_static",
        referenceClass: "official_law",
        consumerWordingMode: "review_reference",
      }),
    );
    expect(result.shadowFindings[0].dbReferenceCandidate.citation).toBe("Schedule 1, Principle 9.9");
    expect(result.activeReferenceResult.references[0].citation).toBe("Schedule 1, Principle 4.6");
  });

  it("computes an approved active DB alternative for shadow comparison only", () => {
    const result = report();

    expect(result.shadowFindings).toHaveLength(1);
    expect(result.ignoredDbReferences).toEqual([]);
    expect(result.shadowFindings[0]).toEqual(
      expect.objectContaining({
        mismatchType: "db_alternative_matches_static",
        reason: expect.stringContaining("shadow comparison only"),
        limitedRuntimeUnsafe: true,
        limitedRuntimeUnsafeReasons: expect.arrayContaining(["shadow_mode_only"]),
      }),
    );
    expect(result.activeReferenceResult.references.map((ref) => ref.id)).toEqual(["PIPEDA_4_6"]);
  });

  it("ignores unapproved, inactive, superseded, missing-source, and unclear DB records", () => {
    const result = report({
      dbRegulations: [
        {
          ...approvedDbPipeda,
          regulationId: "UNAPPROVED",
          reviewStatus: "pending_review",
        },
        {
          ...approvedDbPipeda,
          regulationId: "INACTIVE",
          activeStatus: "inactive",
        },
        {
          ...approvedDbPipeda,
          regulationId: "SUPERSEDED",
          repealOrSupersededStatus: "superseded",
        },
        {
          ...approvedDbPipeda,
          regulationId: "MISSING_SOURCE",
          officialSourceUrl: null,
          sourceUrl: null,
          sourceDocumentUrl: null,
        },
        {
          ...approvedDbPipeda,
          regulationId: "MISSING_FIELDS",
          citationFormat: null,
          jurisdiction: null,
        },
      ],
      dbMappings: [
        activeMapping({ mappingId: "unapproved-map", regulationId: "UNAPPROVED" }),
        activeMapping({ mappingId: "inactive-map", regulationId: "INACTIVE" }),
        activeMapping({ mappingId: "superseded-map", regulationId: "SUPERSEDED" }),
        activeMapping({ mappingId: "missing-source-map", regulationId: "MISSING_SOURCE" }),
        activeMapping({ mappingId: "missing-fields-map", regulationId: "MISSING_FIELDS" }),
        activeMapping({
          mappingId: "unclear-map",
          regulationId: "PIPEDA_4_6",
          violationCategory: null,
          deterministicRuleId: null,
          ruleId: null,
        }),
      ],
    });

    expect(result.shadowFindings).toEqual([]);
    const reasonsById = new Map(result.ignoredDbReferences.map((item) => [item.dbRegulationId, item.reasons]));
    expect(reasonsById.get("UNAPPROVED")).toContain("db_record_unapproved");
    expect(reasonsById.get("INACTIVE")).toContain("db_record_inactive");
    expect(reasonsById.get("SUPERSEDED")).toContain("db_record_superseded_or_repealed");
    expect(reasonsById.get("MISSING_SOURCE")).toContain("db_record_missing_source_url");
    expect(reasonsById.get("MISSING_FIELDS")).toEqual(
      expect.arrayContaining(["db_record_missing_jurisdiction", "db_record_missing_citation"]),
    );
    expect(reasonsById.get("PIPEDA_4_6")).toContain("mapping_unclear");
    expect(result.activeReferenceResult.references).toEqual([staticPipeda]);
  });

  it("keeps private standards neutral and separate from official law", () => {
    const result = report({
      dbRegulations: [
        {
          ...approvedDbPipeda,
          regulationId: "METRO2_BASE_SEGMENT",
          title: "Base Segment",
          citationFormat: "Metro2 Base Segment",
          jurisdiction: "Universal",
          category: "reporting_standard",
          officialSourceUrl: null,
          sourceQuality: "private_standard",
          supportLevel: "reporting_standard",
        },
      ],
      dbMappings: [
        activeMapping({
          mappingId: "metro2-map",
          regulationId: "METRO2_BASE_SEGMENT",
          referenceClass: "private_standard",
          consumerWordingMode: "private_standard_reference",
        }),
      ],
    });
    const label = buildShadowConsumerReferenceLabel({
      referenceClass: "private_standard",
      consumerWordingMode: "private_standard_reference",
      referenceText: "Metro2 Base Segment",
    });

    expect(result.shadowFindings).toHaveLength(1);
    expect(result.shadowFindings[0]).toEqual(
      expect.objectContaining({
        referenceClass: "private_standard",
        consumerWordingMode: "private_standard_reference",
        consumerFacingAllowed: true,
      }),
    );
    expect(label).toBe("This item may require review against an industry reporting standard.");
    expect(label).not.toMatch(/\blaw\b/i);
    expect(containsForbiddenConsumerReferenceLanguage(label)).toBe(false);
  });

  it("prevents internal-only references from becoming consumer-facing", () => {
    const result = report({
      dbMappings: [
        activeMapping({
          referenceClass: "internal_only",
          consumerWordingMode: "internal_only",
        }),
      ],
    });

    expect(result.shadowFindings).toEqual([]);
    expect(result.ignoredDbReferences).toHaveLength(1);
    expect(result.ignoredDbReferences[0].reasons).toContain("internal_only_consumer_context");
    expect(
      buildShadowConsumerReferenceLabel({
        referenceClass: "internal_only",
        consumerWordingMode: "internal_only",
        referenceText: "Internal reference",
      }),
    ).toBeNull();
  });

  it("falls back to static references when DB bridge data is missing", () => {
    const result = report({
      dbRegulations: [],
      dbMappings: [activeMapping({ regulationId: "DB_ONLY_REFERENCE" })],
    });

    expect(result.activeReferenceResult.references).toEqual([staticPipeda]);
    expect(result.shadowFindings).toEqual([]);
    expect(result.ignoredDbReferences).toEqual([
      expect.objectContaining({
        dbRegulationId: "DB_ONLY_REFERENCE",
        reasons: expect.arrayContaining(["db_record_missing"]),
        limitedRuntimeUnsafe: true,
      }),
    ]);
  });

  it("does not mutate static mappings, local authority output, violation metadata, packet readiness, packet wording, or inert candidate boundaries", () => {
    const staticMapBefore = JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP);
    const authoritiesBefore = JSON.stringify(localLegalAuthorities);
    const violationBefore = buildDeterministicViolationRuleEnvelope(sampleViolation());
    const readinessBefore = evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    });
    const packetBefore = samplePacketContent();

    report({
      dbRegulations: [
        {
          ...approvedDbPipeda,
          citationFormat: "Schedule 1, Principle 9.9",
        },
      ],
    });

    expect(JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP)).toBe(staticMapBefore);
    expect(JSON.stringify(localLegalAuthorities)).toBe(authoritiesBefore);
    expect(buildDeterministicViolationRuleEnvelope(sampleViolation())).toEqual(violationBefore);
    expect(evaluateViolationPacketConfidenceGate({
      technicalDetails: {
        extractionConfidenceGate: { status: "confirmed", packetReady: true },
      },
      validationStatus: "PENDING",
      userStatus: "active",
    })).toEqual(readinessBefore);
    expect(samplePacketContent()).toEqual(packetBefore);

    const helperSource = readFileSync(
      join(process.cwd(), "helpers", "regulationRuntimeBridgeShadow.ts"),
      "utf8",
    );
    const candidateSource = readFileSync(
      join(process.cwd(), "helpers", "regulationReconciliationCandidateService.ts"),
      "utf8",
    );

    expect(helperSource).not.toContain("regulationRegistryService");
    expect(helperSource).not.toContain("approveRegulationCandidate");
    expect(helperSource).not.toContain("upsertRegulationViolationMapping");
    expect(helperSource).not.toContain("insertInto(");
    expect(helperSource).not.toContain("updateTable(");
    expect(helperSource).not.toContain("deleteFrom(");
    expect(helperSource).not.toMatch(/from\s+["']\.\/db["']/);
    expect(helperSource).not.toContain("VIOLATION_REGULATION_MAP");
    expect(candidateSource).toContain("check(active_status = 'inert')");
  });

  it("keeps shadow wording neutral for official law and regulator guidance", () => {
    const official = buildShadowConsumerReferenceLabel({
      referenceClass: "official_law",
      consumerWordingMode: "review_reference",
      referenceText: "PIPEDA Schedule 1, Principle 4.6",
    });
    const guidance = buildShadowConsumerReferenceLabel({
      referenceClass: "regulator_guidance",
      consumerWordingMode: "review_reference",
      referenceText: "OPC guidance",
    });
    const procedural = buildShadowConsumerReferenceLabel({
      referenceClass: "local_procedural",
      consumerWordingMode: "procedural_reference",
      referenceText: "Local procedure",
    });

    expect(official).toBe("This item may require review under PIPEDA Schedule 1, Principle 4.6.");
    expect(guidance).toBe("This item may require review against OPC guidance.");
    expect(procedural).toBe("This item may require procedural review.");
    for (const label of [official, guidance, procedural]) {
      expect(containsForbiddenConsumerReferenceLanguage(label)).toBe(false);
    }
    expect(containsForbiddenConsumerReferenceLanguage("This is illegal and the bureau broke the law.")).toBe(true);
  });
});
