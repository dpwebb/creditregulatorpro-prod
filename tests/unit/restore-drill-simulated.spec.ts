import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildSimulatedRestoreDrillReport,
  renderSimulatedRestoreDrillMarkdown,
  SIMULATED_RESTORE_MARKERS,
  validateSimulatedRestoreDrillReport,
  writeSimulatedRestoreDrillEvidence,
} from "../../scripts/restore-drill-simulated.mjs";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-simulated-restore-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("simulated restore drill evidence", () => {
  it("creates markdown and json evidence with SIMULATED labels", () => {
    const rootDir = makeTempRoot();
    const report = buildSimulatedRestoreDrillReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      simulationId: "sim-test-001",
    });
    const outputs = writeSimulatedRestoreDrillEvidence(report, { rootDir });
    const markdownPath = join(rootDir, outputs.markdownPath);
    const jsonPath = join(rootDir, outputs.jsonPath);

    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    const markdown = readFileSync(markdownPath, "utf8");
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));

    expect(markdown).toContain("# SIMULATED Restore Drill Evidence");
    expect(markdown).toContain("SIMULATED evidence only");
    expect(markdown).toContain("Machine restore proof still required: yes");
    expect(json.evidenceType).toBe("SIMULATED");
    expect(json.machineRestoreProofStillRequired).toBe(true);
  });

  it("verifies synthetic post-restore markers and RPO/RTO values", () => {
    const report = buildSimulatedRestoreDrillReport({
      rootDir: makeTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      simulationId: "sim-test-002",
    });
    const markers = report.postRestoreChecks.map((check: { marker: string }) => check.marker);

    expect(validateSimulatedRestoreDrillReport(report)).toEqual({ ok: true, errors: [] });
    expect(markers).toEqual(expect.arrayContaining(Object.values(SIMULATED_RESTORE_MARKERS)));
    expect(report.syntheticRpoRto.rpoTarget).toContain("SIMULATED");
    expect(report.syntheticRpoRto.rtoActual).toContain("SIMULATED");
  });

  it("renders simulated evidence without production proof claims", () => {
    const report = buildSimulatedRestoreDrillReport({
      rootDir: makeTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      simulationId: "sim-test-003",
    });
    const markdown = renderSimulatedRestoreDrillMarkdown(report);

    expect(markdown).toContain("not actual disaster recovery completion");
    expect(markdown).toContain("Production backups accessed: no");
    expect(markdown).toContain("Production data mutated: no");
    expect(markdown).toContain("Live external providers connected: no");
    expect(markdown).toContain("Non-interactive sanitized restore machine proof is required");
  });

  it("fails closed in production-like environments", () => {
    expect(() =>
      buildSimulatedRestoreDrillReport({
        rootDir: makeTempRoot(),
        env: { CRP_ENV: "production" },
      }),
    ).toThrow(/production-like environment/i);
  });
});
