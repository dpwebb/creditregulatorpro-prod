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
