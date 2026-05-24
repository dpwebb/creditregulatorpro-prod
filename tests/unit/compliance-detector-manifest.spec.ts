import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertComplianceDetectorManifestEntry,
  COMPLIANCE_DETECTOR_MANIFEST,
  getComplianceDetectorManifestEntry,
} from "../../helpers/complianceDetectorManifest";

describe("compliance detector manifest", () => {
  it("declares unique detector ids", () => {
    const detectorIds = COMPLIANCE_DETECTOR_MANIFEST.map((entry) => entry.detectorId);
    expect(new Set(detectorIds).size).toBe(detectorIds.length);
  });

  it("declares required fields and emitted finding categories for each detector", () => {
    expect(COMPLIANCE_DETECTOR_MANIFEST.length).toBeGreaterThan(40);

    for (const entry of COMPLIANCE_DETECTOR_MANIFEST) {
      expect(entry.detectorId).toMatch(/^(detect|runAll)[A-Za-z0-9]+/);
      expect(entry.expectedCanonicalFields.length).toBeGreaterThan(0);
      expect(entry.emitsFindingCategories.length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(20);
      expect(entry.requiredEvidenceLevel).toMatch(/^(strong|partial|contextual)$/);
      expect(entry.readinessSensitivity).toMatch(/^(evidence_critical|parser_sensitive|response_context|manual_review_prone)$/);
    }
  });

  it("resolves known detector ids and fails unknown ids safely", () => {
    expect(getComplianceDetectorManifestEntry("detectBalanceCalculationViolation")).toMatchObject({
      detectorId: "detectBalanceCalculationViolation",
      emitsFindingCategories: ["BALANCE_CALCULATION_VIOLATION"],
    });
    expect(getComplianceDetectorManifestEntry("unknownDetector")).toBeNull();
    expect(() => assertComplianceDetectorManifestEntry("unknownDetector")).toThrow(
      "Unknown compliance detector id: unknownDetector",
    );
  });

  it("stays read-only and is not wired into live scanner routing", () => {
    const scanner = readFileSync(resolve(process.cwd(), "helpers/complianceScanner.tsx"), "utf8");
    const aggregator = readFileSync(resolve(process.cwd(), "helpers/complianceDetectors.tsx"), "utf8");

    expect(scanner).not.toContain("complianceDetectorManifest");
    expect(aggregator).not.toContain("complianceDetectorManifest");
  });
});
