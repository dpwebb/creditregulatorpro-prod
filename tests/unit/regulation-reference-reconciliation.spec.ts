import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { localLegalAuthorities } from "../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../helpers/regulationRegistry";
import {
  detectConsumerReferenceWordingRisk,
  reconcileRegulationReferences,
  type DbRegulationSnapshot,
  type StaticReferenceSnapshot,
  type StaticViolationReferenceMappingSnapshot,
} from "../../helpers/regulationReferenceReconciliation";
import { buildDeterministicViolationRuleEnvelope } from "../../helpers/violationRuleEvidence";

const staticPipeda: StaticReferenceSnapshot = {
  id: "PIPEDA_4_6",
  title: "Accuracy",
  jurisdiction: "Federal",
  category: "record_accuracy",
  citation: "Schedule 1, Principle 4.6",
  sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
  referenceType: "privacy_principle",
  sourceQuality: "official",
  consumerFacing: true,
  label: "This item may require review under PIPEDA Schedule 1, Principle 4.6",
  description: "Accuracy reference for review purposes.",
};

const staticMappings: StaticViolationReferenceMappingSnapshot[] = [
  {
    violationCategory: "BALANCE_CALCULATION_VIOLATION",
    regulationId: "PIPEDA_4_6",
  },
];

const dbPipeda: DbRegulationSnapshot = {
  regulationId: "PIPEDA_4_6",
  title: "Accuracy",
  jurisdiction: "Federal",
  category: "record_accuracy",
  citationFormat: "Schedule 1, Principle 4.6",
  sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
  effectiveDate: "2001-01-01",
  reviewStatus: "approved",
  activeStatus: "active",
  updateVersion: 1,
  referenceType: "privacy_principle",
};

function findingTypes(findings: ReturnType<typeof reconcileRegulationReferences>) {
  return findings.map((finding) => finding.mismatchType);
}

function runtimeStaticReferences(): StaticReferenceSnapshot[] {
  return localLegalAuthorities.map((authority) => ({
    id: authority.id,
    title: authority.shortLabel,
    jurisdiction: authority.jurisdiction,
    category: authority.supportLevel,
    citation: authority.citation,
    sourceUrl: authority.sourceUrl,
    referenceType: authority.authorityType,
    sourceQuality: authority.sourceQuality,
    consumerFacing: false,
    description: authority.textExcerpt,
  }));
}

function runtimeStaticMappings(): StaticViolationReferenceMappingSnapshot[] {
  return Object.entries(regulationRegistry.VIOLATION_REGULATION_MAP).flatMap(
    ([violationCategory, regulationIds]) =>
      regulationIds.map((regulationId) => ({
        violationCategory,
        regulationId,
      })),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

describe("regulation reference reconciliation", () => {
  it("detects a missing DB registry record for a static runtime reference", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [staticPipeda],
      staticViolationMappings: staticMappings,
      dbRegulations: [],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staticReferenceId: "PIPEDA_4_6",
          mismatchType: "missing_db_registry_record",
        }),
      ]),
    );
  });

  it("detects a missing static runtime reference for a DB registry row", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [],
      dbRegulations: [
        {
          ...dbPipeda,
          regulationId: "DB_ONLY_REFERENCE",
        },
      ],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dbRegulationId: "DB_ONLY_REFERENCE",
          mismatchType: "missing_static_reference",
        }),
      ]),
    );
  });

  it("detects citation and title mismatches deterministically", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [staticPipeda],
      staticViolationMappings: staticMappings,
      dbRegulations: [
        {
          ...dbPipeda,
          title: "Accuracy Principle Updated",
          citationFormat: "Schedule 1, Principle 4.7",
        },
      ],
    });

    expect(findingTypes(findings)).toEqual(expect.arrayContaining(["citation_mismatch", "title_mismatch"]));
  });

  it("detects jurisdiction and category mismatches", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [staticPipeda],
      staticViolationMappings: staticMappings,
      dbRegulations: [
        {
          ...dbPipeda,
          jurisdiction: "Ontario",
          category: "privacy",
        },
      ],
    });

    expect(findingTypes(findings)).toEqual(expect.arrayContaining(["jurisdiction_mismatch", "category_mismatch"]));
  });

  it("detects missing source URLs on static official references and DB records", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [
        {
          ...staticPipeda,
          sourceUrl: null,
        },
      ],
      staticViolationMappings: staticMappings,
      dbRegulations: [
        {
          ...dbPipeda,
          sourceUrl: null,
        },
      ],
    });

    expect(findings.filter((finding) => finding.mismatchType === "source_url_missing")).toHaveLength(2);
  });

  it("detects missing effective date and approval status", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [staticPipeda],
      staticViolationMappings: staticMappings,
      dbRegulations: [
        {
          ...dbPipeda,
          effectiveDate: null,
          reviewStatus: "pending_review",
        },
      ],
    });

    expect(findingTypes(findings)).toEqual(
      expect.arrayContaining(["effective_date_missing", "approval_status_missing"]),
    );
  });

  it("detects unclear mappings that cannot be tied to static runtime references or deterministic rules", () => {
    const findings = reconcileRegulationReferences({
      staticReferences: [staticPipeda],
      staticViolationMappings: staticMappings,
      dbRegulations: [dbPipeda],
      dbMappings: [
        {
          regulationId: "DB_ONLY_REFERENCE",
          violationCategory: "BALANCE_CALCULATION_VIOLATION",
          reviewStatus: "approved",
          active: true,
        },
        {
          regulationId: "PIPEDA_4_6",
          reviewStatus: "approved",
          active: true,
        },
      ],
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dbRegulationId: "DB_ONLY_REFERENCE",
          mismatchType: "unclear_mapping",
        }),
        expect.objectContaining({
          dbRegulationId: "PIPEDA_4_6",
          mismatchType: "unclear_mapping",
        }),
      ]),
    );
  });

  it("detects risky consumer-facing reference wording without changing UI copy", () => {
    expect(
      detectConsumerReferenceWordingRisk({
        label: "Confirmed legal violation",
        title: "Accuracy",
        description: "Review reference",
      }),
    ).toBe(true);

    const findings = reconcileRegulationReferences({
      staticReferences: [
        {
          ...staticPipeda,
          label: "Confirmed legal violation",
        },
      ],
      staticViolationMappings: staticMappings,
      dbRegulations: [dbPipeda],
      dbMappings: [
        {
          regulationId: "PIPEDA_4_6",
          violationCategory: "BALANCE_CALCULATION_VIOLATION",
          reviewStatus: "approved",
          active: true,
          explanationTemplate: "This is illegal and the bureau broke the law.",
        },
      ],
    });

    expect(findings.filter((finding) => finding.mismatchType === "consumer_wording_risk")).toHaveLength(2);
  });

  it("does not mutate input arrays or objects", () => {
    const input = deepFreeze({
      staticReferences: [staticPipeda],
      staticViolationMappings: staticMappings,
      dbRegulations: [dbPipeda],
      dbMappings: [
        {
          regulationId: "PIPEDA_4_6",
          violationCategory: "BALANCE_CALCULATION_VIOLATION",
          reviewStatus: "approved",
          active: true,
        },
      ],
    });
    const before = JSON.stringify(input);

    reconcileRegulationReferences(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it("does not alter static runtime mapping or local authority output", () => {
    const mappingBefore = JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP);
    const authoritiesBefore = JSON.stringify(localLegalAuthorities);

    reconcileRegulationReferences({
      staticReferences: runtimeStaticReferences(),
      staticViolationMappings: runtimeStaticMappings(),
      dbRegulations: [],
    });

    expect(JSON.stringify(regulationRegistry.VIOLATION_REGULATION_MAP)).toBe(mappingBefore);
    expect(JSON.stringify(localLegalAuthorities)).toBe(authoritiesBefore);
  });

  it("keeps approved and unapproved DB rows from changing runtime references", () => {
    const before = regulationRegistry
      .getRegulationsForViolationCategory("BALANCE_CALCULATION_VIOLATION" as any)
      .map((entry) => `${entry.id}:${entry.citation}`);

    reconcileRegulationReferences({
      staticReferences: runtimeStaticReferences(),
      staticViolationMappings: runtimeStaticMappings(),
      dbRegulations: [
        {
          ...dbPipeda,
          citationFormat: "Schedule 1, Principle 9.9",
          reviewStatus: "approved",
          activeStatus: "active",
        },
        {
          ...dbPipeda,
          regulationId: "UNAPPROVED_DB_REFERENCE",
          reviewStatus: "pending_review",
          activeStatus: "active",
        },
      ],
    });

    const after = regulationRegistry
      .getRegulationsForViolationCategory("BALANCE_CALCULATION_VIOLATION" as any)
      .map((entry) => `${entry.id}:${entry.citation}`);
    const envelope = buildDeterministicViolationRuleEnvelope({
      violationCategory: "BALANCE_CALCULATION_VIOLATION",
      severity: "WARNING",
      confidenceScore: 90,
      userExplanation: "The reported balance appears inconsistent.",
      technicalDetails: {
        fieldName: "balance",
        detectedValue: 1250,
        regulationIds: ["PIPEDA_4_6"],
      },
      recommendedAction: "Review the reported balance.",
      tradelineId: 1,
      responsibleEntity: "CREDITOR",
    } as any);

    expect(after).toEqual(before);
    expect(envelope?.regulationReferences.find((ref) => ref.id === "PIPEDA_4_6")?.citation).toBe(
      "Schedule 1, Principle 4.6",
    );
  });

  it("does not make unapproved DB references active runtime truth", () => {
    expect(regulationRegistry.getRegulationById("UNAPPROVED_DB_REFERENCE")).toBeUndefined();

    const findings = reconcileRegulationReferences({
      staticReferences: runtimeStaticReferences(),
      staticViolationMappings: runtimeStaticMappings(),
      dbRegulations: [
        {
          regulationId: "UNAPPROVED_DB_REFERENCE",
          title: "Unapproved DB Reference",
          jurisdiction: "Federal",
          category: "record_accuracy",
          citationFormat: "Unapproved section",
          sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-7.html",
          effectiveDate: "2025-01-01",
          reviewStatus: "pending_review",
          activeStatus: "active",
          updateVersion: 1,
          referenceType: "statute",
        },
      ],
    });

    expect(regulationRegistry.getRegulationById("UNAPPROVED_DB_REFERENCE")).toBeUndefined();
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dbRegulationId: "UNAPPROVED_DB_REFERENCE",
          mismatchType: "missing_static_reference",
        }),
        expect.objectContaining({
          dbRegulationId: "UNAPPROVED_DB_REFERENCE",
          mismatchType: "approval_status_missing",
        }),
      ]),
    );
  });

  it("does not import mutation services, DB helpers, or runtime packet creation", () => {
    const source = readFileSync(
      join(process.cwd(), "helpers", "regulationReferenceReconciliation.ts"),
      "utf8",
    );

    expect(source).not.toContain("regulationRegistryService");
    expect(source).not.toContain("createRegulationCandidate");
    expect(source).not.toContain("upsertRegulationViolationMapping");
    expect(source).not.toContain("insertInto(");
    expect(source).not.toContain("updateTable(");
    expect(source).not.toContain("deleteFrom(");
    expect(source).not.toMatch(/from\s+["']\.\/db["']/);
    expect(source).not.toMatch(/from\s+["'].*packet/i);
  });
});
