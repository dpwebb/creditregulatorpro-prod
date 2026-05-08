import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
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

  it("keeps generated provincial authority records official and source-backed", () => {
    const generatedProvinceIds = Object.keys(regulationRegistry.STATUTE_ENTRIES)
      .filter((id) => /^[A-Z]{2}_(CRA_|COLLECTION_ACT|LIMITATIONS_ACT)/.test(id))
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
