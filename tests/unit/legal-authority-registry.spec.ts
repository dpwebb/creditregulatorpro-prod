import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  authorityIssueLabel,
  classifyAuthorityIssue,
  getLegalAuthorityById,
  hasFieldSpecificAuthority,
  isBonaFideLegalAuthority,
  searchLegalAuthorities,
} from "../../helpers/legalAuthorityRegistry";
import { regulationRegistry } from "../../helpers/regulationRegistry";
import { buildDeterministicViolationRuleEnvelope } from "../../helpers/violationRuleEvidence";
import { ViolationCategoryArrayValues, type CanadianProvince } from "../../helpers/schema";

const PROVINCES: CanadianProvince[] = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
];

describe("local legal authority registry", () => {
  it("searches locally stored authority text and metadata", () => {
    const results = searchLegalAuthorities({ query: "PIPEDA accurate complete up-to-date", limit: 5 });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "PIPEDA_4_6",
          sourceQuality: "official",
          sourceUrl: expect.stringContaining("laws-lois.justice.gc.ca"),
          textExcerpt: expect.stringContaining("accurate, complete"),
        }),
      ]),
    );
  });

  it("does not treat a generic accuracy principle as a field-specific mandate", () => {
    expect(
      hasFieldSpecificAuthority({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "dateAssignedToCollection",
        regulationIds: ["PIPEDA_4_6"],
      }),
    ).toBe(false);
  });

  it("does not treat generic Metro2 base-segment authority as an exact closed-date mandate", () => {
    expect(
      hasFieldSpecificAuthority({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "dateClosed",
        accountType: "INSTALLMENT",
        regulationIds: ["PIPEDA_4_6", "METRO2_BASE_SEGMENT"],
        jurisdiction: "NS",
      }),
    ).toBe(false);
  });

  it("resolves scoped Canadian field mandates only when province and account type match", () => {
    expect(
      hasFieldSpecificAuthority({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "judgmentCreditorName",
        accountType: "judgment",
        regulationIds: ["NS_CRA_JUDGMENT_FIELDS"],
        jurisdiction: "NS",
      }),
    ).toBe(true);

    expect(
      hasFieldSpecificAuthority({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "judgmentCreditorName",
        regulationIds: ["NS_CRA_JUDGMENT_FIELDS"],
        jurisdiction: "NS",
      }),
    ).toBe(false);

    expect(
      hasFieldSpecificAuthority({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "judgmentCreditorName",
        accountType: "judgment",
        regulationIds: ["NS_CRA_JUDGMENT_FIELDS"],
      }),
    ).toBe(false);

    expect(
      hasFieldSpecificAuthority({
        violationCategory: "DOCUMENTATION_CHAIN_FAILURE",
        fieldName: "judgmentCreditorName",
        accountType: "judgment",
        regulationIds: ["NS_CRA_JUDGMENT_FIELDS"],
        jurisdiction: "ON",
      }),
    ).toBe(false);
  });

  it("exposes local source metadata for deterministic rule evidence", () => {
    expect(getLegalAuthorityById("PIPEDA_4_6")).toEqual(
      expect.objectContaining({
        authorityType: "privacy_principle",
        supportLevel: "category_principle",
        allowsFieldRequiredLanguage: false,
      }),
    );
  });

  it("includes local authority records for specialized active detector references", () => {
    expect(getLegalAuthorityById("PIPEDA_4_3_8")).toEqual(
      expect.objectContaining({
        statute: "PIPEDA",
        citation: "Schedule 1, Principle 4.3.8",
        sourceQuality: "official",
      }),
    );
    expect(getLegalAuthorityById("ON_FAIRNESS_CRA_2017")).toEqual(
      expect.objectContaining({
        statute: "Ontario CRA",
        sourceQuality: "official",
        sourceUrl: expect.stringContaining("ontario.ca/laws/statute/90c33"),
      }),
    );
  });

  it("keeps violation-category registry mappings resolvable locally", () => {
    const missing = Object.values(regulationRegistry.VIOLATION_REGULATION_MAP)
      .flat()
      .filter((id) => !getLegalAuthorityById(id));

    expect(missing).toEqual([]);
  });

  it("keeps violation-category registry mappings deduplicated", () => {
    for (const [category, ids] of Object.entries(regulationRegistry.VIOLATION_REGULATION_MAP)) {
      expect(ids, `${category} should not include duplicate regulation ids`).toHaveLength(new Set(ids).size);
    }
  });

  it("keeps generated provincial authority records official and source-backed", () => {
    const generatedProvinceIds = Object.keys(regulationRegistry.STATUTE_ENTRIES)
      .filter((id) =>
        /^[A-Z]{2}_(CRA_(ACCURACY|REPORTING_LIMIT|REINVESTIGATION|REINSERTION|CONSUMER_STATEMENT|PERMISSIBLE_PURPOSE|DISCLOSURE)|COLLECTION_ACT|LIMITATIONS_ACT)$/.test(
          id,
        ),
      )
      .sort();

    expect(generatedProvinceIds).toHaveLength(PROVINCES.length * 9);

    for (const id of generatedProvinceIds) {
      expect(getLegalAuthorityById(id)).toEqual(
        expect.objectContaining({
          sourceQuality: "official",
          supportLevel: "category_principle",
          sourceUrl: expect.stringMatching(/^https:\/\//),
          allowsFieldRequiredLanguage: false,
        }),
      );
    }
  });

  it("keeps exact field requirement authority records official, sourced, and scoped", () => {
    const fieldRequirementAuthorities = searchLegalAuthorities({
      supportLevel: "field_requirement",
      limit: 200,
    });

    expect(fieldRequirementAuthorities).toHaveLength(28);

    for (const authority of fieldRequirementAuthorities) {
      const registryEntry = regulationRegistry.getRegulationById(authority.id);
      expect(authority.sourceQuality, `${authority.id} should be official`).toBe("official");
      expect(authority.authorityType, `${authority.id} should be a statute record`).toBe("statute");
      expect(authority.jurisdiction, `${authority.id} should store jurisdiction`).toBeTruthy();
      expect(authority.citation, `${authority.id} should store citation`).toBeTruthy();
      expect(authority.effectiveDate, `${authority.id} should store effectiveDate, even when unknown`).toBeNull();
      expect(authority.sourceUrl, `${authority.id} should have an official source URL`).toMatch(/^https:\/\//);
      expect(authority.fieldNames.length, `${authority.id} should name exact fields`).toBeGreaterThan(0);
      expect(authority.accountTypes.length, `${authority.id} should be scoped by account or record type`).toBeGreaterThan(0);
      expect(authority.allowsFieldRequiredLanguage, `${authority.id} should support field-required language`).toBe(true);
      expect(registryEntry, `${authority.id} should resolve to a registry entry`).toBeTruthy();
      expect(
        Object.prototype.hasOwnProperty.call(registryEntry, "effectiveDate"),
        `${authority.id} should explicitly store effectiveDate`,
      ).toBe(true);
      expect(classifyAuthorityIssue(authority), `${authority.id} should classify as confirmed legal`).toBe("confirmed_legal_violation");
      expect(authorityIssueLabel(authority)).toBe("Confirmed legal violation");
    }
  });

  it("keeps private reporting standards separate from confirmed legal violation labels", () => {
    const metro2 = getLegalAuthorityById("METRO2_BASE_SEGMENT");
    const pipeda = getLegalAuthorityById("PIPEDA_4_6");

    expect(metro2).toEqual(expect.objectContaining({ sourceQuality: "private_standard" }));
    expect(classifyAuthorityIssue(metro2!)).toBe("mapped_reporting_standard_issue");
    expect(authorityIssueLabel(metro2!)).toBe("Mapped reporting-standard issue");

    expect(pipeda).toEqual(expect.objectContaining({ sourceQuality: "official", supportLevel: "category_principle" }));
    expect(classifyAuthorityIssue(pipeda!)).toBe("mapped_legal_authority_issue");
    expect(authorityIssueLabel(pipeda!)).toBe("Mapped legal authority issue");
  });

  it("resolves every active violation category to federal, reporting-standard, or consumer-province authority", () => {
    for (const province of PROVINCES) {
      for (const violationCategory of ViolationCategoryArrayValues) {
        const envelope = buildDeterministicViolationRuleEnvelope({
          violationCategory,
          severity: "WARNING",
          confidenceScore: 80,
          userExplanation: "Synthetic coverage issue.",
          recommendedAction: "Review mapped authority.",
          responsibleEntity: "BUREAU",
          technicalDetails: { province },
        });

        expect(envelope, `${violationCategory} should build an evidence envelope`).not.toBeNull();
        expect(
          envelope?.regulationReferences.length,
          `${violationCategory} should resolve authority for ${province}`,
        ).toBeGreaterThan(0);

        for (const ref of envelope?.regulationReferences ?? []) {
          const refProvince = ref.id.match(/^([A-Z]{2})_/)?.[1] ?? null;
          expect(ref.sourceQuality, `${ref.id} should be official or private`).toMatch(/^(official|private_standard)$/);
          expect(ref.supportLevel, `${ref.id} should not be a registry placeholder`).not.toBe("registry_placeholder");
          if (refProvince) {
            expect(refProvince, `${ref.id} should match consumer province ${province}`).toBe(province);
          }
        }
      }
    }
  });

  it("keeps active detector string regulation ids resolvable locally", () => {
    const helperDir = join(process.cwd(), "helpers");
    const detectorFiles = readdirSync(helperDir)
      .filter((file) => /^complianceDetector.*\.tsx$/.test(file) || file === "complianceScanner.tsx")
      .map((file) => join(helperDir, file));
    const ids = new Set<string>();

    for (const file of detectorFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/regulationIds:\s*\[([\s\S]*?)\]/g)) {
        for (const idMatch of match[1].matchAll(/"([A-Z0-9_]+)"/g)) {
          ids.add(idMatch[1]);
        }
      }
    }

    const missing = [...ids].filter((id) => !getLegalAuthorityById(id)).sort();
    expect(missing).toEqual([]);

    const unsupported = [...ids]
      .filter((id) => {
        const authority = getLegalAuthorityById(id);
        return !authority || !isBonaFideLegalAuthority(authority);
      })
      .sort();
    expect(unsupported).toEqual([]);
  });
});
