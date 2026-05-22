import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionScaleEvidenceReport,
  DEFAULT_AUDIT_PATH,
  DEFAULT_BLOCKER_REGISTRY_PATH,
  detectProductionEnvironment,
  loadBlockerRegistry,
  parseAuditBlockerRows,
  renderProductionScaleEvidenceMarkdown,
  validateBlockerRegistry,
} from "../../scripts/production-scale-evidence.mjs";

const fakeDashboardReport = {
  summary: {
    pass: 5,
    fail: 0,
    skip: 7,
    manual: 2,
    open: 3,
    info: 1,
  },
};

function registryClone() {
  return JSON.parse(JSON.stringify(loadBlockerRegistry()));
}

function auditText() {
  return readFileSync(resolve(DEFAULT_AUDIT_PATH), "utf8");
}

describe("production-scale blocker evidence framework", () => {
  it("represents all 25 audit blockers without duplicates", () => {
    const registry = loadBlockerRegistry();
    const rows = parseAuditBlockerRows(auditText());
    const numbers = registry.blockers.map((blocker: { number: number }) => blocker.number);

    expect(registry.registryPath).toBe(DEFAULT_BLOCKER_REGISTRY_PATH);
    expect(rows).toHaveLength(25);
    expect(registry.blockers).toHaveLength(25);
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
    expect(new Set(numbers).size).toBe(25);
  });

  it("fails validation if an audit blocker silently disappears", () => {
    const registry = registryClone();
    const rows = parseAuditBlockerRows(auditText());

    expect(validateBlockerRegistry(registry, rows)).toEqual({ valid: true, errors: [] });

    registry.blockers = registry.blockers.filter((blocker: { number: number }) => blocker.number !== 17);
    const validation = validateBlockerRegistry(registry, rows);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join("\n")).toContain("Missing blocker number(s): 17");
    expect(validation.errors.join("\n")).toContain("Audit blocker 17 is absent from the registry");
  });

  it("rejects duplicate blocker numbers", () => {
    const registry = registryClone();
    registry.blockers[1].number = 1;

    const validation = validateBlockerRegistry(registry, parseAuditBlockerRows(auditText()));

    expect(validation.valid).toBe(false);
    expect(validation.errors.join("\n")).toContain("Duplicate blocker number(s): 1");
  });

  it("does not allow fixed status without recognized automated or machine proof", () => {
    const registry = registryClone();
    const blocker = registry.blockers.find((entry: { number: number }) => entry.number === 7);
    Object.assign(blocker, {
      currentStatus: "fixed",
      allowedProofCommands: [],
      humanProofRequired: false,
    });

    const validation = validateBlockerRegistry(registry, parseAuditBlockerRows(auditText()));

    expect(validation.valid).toBe(false);
    expect(validation.errors.join("\n")).toContain(
      "Blocker 7 cannot be fixed without recognized automated or machine proof commands.",
    );
  });

  it("keeps simulated proof separate from production proof", () => {
    const report = buildProductionScaleEvidenceReport({
      registry: registryClone(),
      auditText: auditText(),
      dashboardReport: fakeDashboardReport,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const simulatedNumbers = new Set(report.evidence.simulated.blockers.map((blocker: { number: number }) => blocker.number));
    const readOnlyProductionNumbers = new Set(
      report.evidence.readOnlyProduction.blockers.map((blocker: { number: number }) => blocker.number),
    );
    const markdown = renderProductionScaleEvidenceMarkdown(report);

    expect(report.evidence.simulated.label).toBe("SIMULATED");
    expect(report.evidence.simulated.productionProof).toBe(false);
    expect(report.safety.simulatedEvidenceIsProductionProof).toBe(false);
    expect([...simulatedNumbers].some((number) => readOnlyProductionNumbers.has(number))).toBe(false);
    expect(markdown).toContain("SIMULATED evidence is not production proof.");
    expect(markdown).toContain("SIMULATED - #3 Load/concurrency proof");
  });

  it("does not treat dashboard SKIP as PASS evidence", () => {
    const report = buildProductionScaleEvidenceReport({
      registry: registryClone(),
      auditText: auditText(),
      dashboardReport: fakeDashboardReport,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const markdown = renderProductionScaleEvidenceMarkdown(report);

    expect(report.dashboard.checksSkipped).toBe(true);
    expect(report.dashboard.skipCount).toBe(7);
    expect(report.dashboard.treatsSkipAsPass).toBe(false);
    expect(report.safety.dashboardPassAloneIsReleaseEvidence).toBe(false);
    expect(markdown).toContain("Any checks skipped: yes (7 dashboard SKIP row(s))");
    expect(markdown).toContain("Dashboard SKIP rows are not treated as PASS.");
  });

  it("fails closed for production-like environments", () => {
    expect(detectProductionEnvironment({ NODE_ENV: "production" })).toMatchObject({ productionLike: true });
    expect(() =>
      buildProductionScaleEvidenceReport({
        registry: registryClone(),
        auditText: auditText(),
        dashboardReport: fakeDashboardReport,
        env: { CRP_ENV: "production" },
      }),
    ).toThrow(/production-like environment/i);
  });

  it("exposes the package evidence command", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["production-scale:evidence"]).toBe("node scripts/production-scale-evidence.mjs");
  });
});
