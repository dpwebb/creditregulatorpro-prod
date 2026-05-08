import { describe, expect, it } from "vitest";

import {
  countViolationsByArtifact,
  getViolationArtifactScopeIds,
  violationBelongsToArtifact,
} from "../../helpers/violationCorrectionArtifactLinks";

describe("violation correction artifact scope", () => {
  it("counts scoped violations only on the artifact that produced them", () => {
    const counts = countViolationsByArtifact(
      [
        { reportArtifactId: 10, tradelineId: 515 },
        { reportArtifactId: 11, tradelineId: 515 },
      ],
      [
        {
          tradelineId: 515,
          technicalDetails: { sourceReportArtifactId: 11 },
        },
      ],
    );

    expect(counts.get("10") ?? 0).toBe(0);
    expect(counts.get("11")).toBe(1);
  });

  it("keeps legacy unscoped violations visible through tradeline links", () => {
    const counts = countViolationsByArtifact(
      [
        { reportArtifactId: 10, tradelineId: 515 },
        { reportArtifactId: 11, tradelineId: 515 },
      ],
      [{ tradelineId: 515 }],
    );

    expect(counts.get("10")).toBe(1);
    expect(counts.get("11")).toBe(1);
  });

  it("resolves source artifact ids from persisted technical details", () => {
    const violation = {
      technicalDetails: {
        sourceReportArtifactId: "42",
        reportArtifactId: 43,
      },
    };

    expect(getViolationArtifactScopeIds(violation)).toEqual([42, 43]);
    expect(violationBelongsToArtifact(violation, 42)).toBe(true);
    expect(violationBelongsToArtifact(violation, 99)).toBe(false);
  });
});
