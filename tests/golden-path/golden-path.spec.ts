import { describe, expect, it } from "vitest";

import { runGoldenPathRegression } from "../../scripts/golden-path-regression-dashboard";

describe("golden path regression suite", () => {
  it("keeps the fixed synthetic TransUnion and Equifax path green", async () => {
    const dashboard = await runGoldenPathRegression();

    expect(dashboard.ok).toBe(true);
    expect(dashboard.fixtures).toEqual([
      "golden-transunion-collapsed-two-account",
      "golden-equifax-revolving-plus-collection",
    ]);
    expect(dashboard.checks.map((check) => [check.key, check.status])).toEqual([
      ["upload", "PASS"],
      ["parse", "PASS"],
      ["canonical-map", "PASS"],
      ["anomaly-detect", "PASS"],
      ["violation-detect", "PASS"],
      ["evidence-bind", "PASS"],
      ["packet-generate", "PASS"],
      ["pdf-download", "PASS"],
    ]);
  });
});
