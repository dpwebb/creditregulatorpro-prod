import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildEnvironmentParityReport,
  renderEnvironmentParityMarkdown,
} from "../../scripts/environment-parity.mjs";

const generatedAt = "2026-05-27T12:00:00.000Z";

function stagingWorkflowSource() {
  return readFileSync(".github/workflows/deploy-staging.yml", "utf8");
}

describe("environment parity report", () => {
  it("passes when staging and production operational contracts are aligned or intentionally different", () => {
    const report = buildEnvironmentParityReport({ generatedAt });

    expect(report.status).toBe("passed");
    expect(report.operationallyAligned).toBe(true);
    expect(report.blockingGaps).toEqual([]);
    expect(report.eliminatedDifferences).toEqual(expect.arrayContaining([
      expect.stringContaining("Playwright Chromium"),
      expect.stringContaining("protected-route and invalid-session denial probes"),
    ]));
    expect(report.intentionalDifferences.map((check) => check.name)).toEqual(expect.arrayContaining([
      "Container names, env files, domains, and app ports intentionally differ",
      "Production worker remains default-off while staging keeps worker coverage",
      "Production reset remains disabled while staging reset validation stays available",
    ]));
  });

  it("treats missing staging production-style health probes as a blocking drift", () => {
    const report = buildEnvironmentParityReport({
      generatedAt,
      stagingWorkflowText: stagingWorkflowSource().replace(/wait_for_staging_status/g, "removed_staging_status_probe"),
    });

    expect(report.status).toBe("failed");
    expect(report.blockingGaps.map((check) => check.name)).toContain(
      "Staging and production use the same read-only public/protected denial smoke model",
    );
  });

  it("renders required policy sections in docs/environment-parity.md", () => {
    const markdown = renderEnvironmentParityMarkdown(buildEnvironmentParityReport({ generatedAt }));

    expect(markdown).toContain("# Environment Parity");
    expect(markdown).toContain("## Intentionally Different Systems");
    expect(markdown).toContain("## Risky Differences");
    expect(markdown).toContain("Worker policy:");
    expect(markdown).toContain("Reset policy:");
    expect(markdown).toContain("Storage policy:");
    expect(markdown).toContain("Deploy policy:");
  });
});
