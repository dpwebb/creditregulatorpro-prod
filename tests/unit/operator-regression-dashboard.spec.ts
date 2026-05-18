import { describe, expect, it } from "vitest";

import {
  applyRunResults,
  buildOperatorDashboard,
  DASHBOARD_SAFETY_BOUNDARIES,
  filterDashboard,
  GATED_SMOKE_CHECKS,
  KNOWN_SCALE_GAPS,
  listChecks,
  parseArgs,
  renderDashboard,
  SAFE_RUN_CHECK_COMMANDS,
} from "../../scripts/operator-regression-dashboard";

function fakeGit(statusShort = "") {
  return (args: string[]) => {
    const key = args.join(" ");
    if (key === "status --short") return statusShort;
    if (key === "branch --show-current") return "staging";
    if (key === "rev-parse HEAD") return "b52ca35406e5a4c51c39efc515897a6a082da616";
    if (key === "log -1 --pretty=%s") return "Add production readiness checklist";
    return "";
  };
}

describe("operator regression dashboard", () => {
  it("prints the required dashboard categories", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const output = renderDashboard(report);

    expect(output).toContain("Repository / Release State");
    expect(output).toContain("Core Logical Regression");
    expect(output).toContain("Auth / Session Lifecycle");
    expect(output).toContain("Admin Audit / Activity Logs");
    expect(output).toContain("Packet Reliability");
    expect(output).toContain("Outcome Tracking");
    expect(output).toContain("Report Ingest / Retrieval");
    expect(output).toContain("Violation Search / Status");
    expect(output).toContain("Evidence / Coordinate Coverage");
    expect(output).toContain("Regulation / Governance");
    expect(output).toContain("Public / Internal Exposure");
    expect(output).toContain("Manual / Gated Smoke");
    expect(output).toContain("Known Coverage Gaps");
  });

  it("supports json-shaped reports and category filtering", () => {
    const report = filterDashboard(
      buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true }),
      "packet",
    );

    expect(report.branch).toBe("staging");
    expect(report.commit).toBe("b52ca35406e5a4c51c39efc515897a6a082da616");
    expect(report.workingTreeClean).toBe(true);
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].name).toBe("Packet Reliability");
    expect(report.summary.skip).toBeGreaterThan(0);
  });

  it("supports list-checks output data", () => {
    const checks = listChecks(buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true }));

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Core Logical Regression",
          name: "Golden Path",
          command: "pnpm run test:golden-path",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Manual / Gated Smoke",
          name: "Runtime Bridge Mapping smoke",
          requiresCredentials: true,
        }),
        expect.objectContaining({
          category: "Packet Reliability",
          name: "Packet delivery/status endpoint",
          command: "pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Outcome comparison helper",
          command: "pnpm exec vitest run tests/unit/outcome-comparison.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Persisted outcome tracking endpoint",
          command: "pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Outcome admin-review endpoint",
          command: "pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Auth / Session Lifecycle",
          name: "Auth session lifecycle endpoint",
          command: "pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Admin Audit / Activity Logs",
          name: "Admin audit log endpoint",
          command: "pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Violation Search / Status",
          name: "Violation search/status endpoint",
          command: "pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Report Ingest / Retrieval",
          name: "Report ingest lifecycle endpoint",
          command: "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Evidence / Coordinate Coverage",
          name: "Evidence privacy endpoint",
          command: "pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts",
          runByDefault: true,
        }),
      ]),
    );
  });

  it("does not call production endpoints, create data, promote, or activate runtime truth", () => {
    expect(DASHBOARD_SAFETY_BOUNDARIES).toMatchObject({
      modifiesFiles: false,
      callsProductionWithCredentials: false,
      touchesProductionDb: false,
      createsData: false,
      promotesProduction: false,
      activatesRuntimeBridgeMappings: false,
      generatesPackets: false,
      usesRealConsumerData: false,
      runsAuthenticatedSmokeByDefault: false,
    });

    const commands = SAFE_RUN_CHECK_COMMANDS.join("\n");
    expect(commands).not.toMatch(/creditregulatorpro\.com|DATABASE_URL|promote:production|packet\/create|activate/i);
  });

  it("lists gated smoke checks as manual and credential-gated", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const smoke = report.categories.find((category) => category.name === "Manual / Gated Smoke");

    expect(GATED_SMOKE_CHECKS.map((check) => check.command)).toEqual(
      expect.arrayContaining([
        "pnpm run smoke:reconciliation-candidates-ui",
        "pnpm run smoke:runtime-bridge-mapping",
        "pnpm run smoke:runtime-bridge-mapping-ui",
        "pnpm run smoke:advisory-bridge-report",
        "pnpm run smoke:auth-workflow",
        "pnpm run smoke:outcome-tracking",
        "pnpm run smoke:outcome-admin-review",
      ]),
    );
    expect(smoke?.checks.every((check) => check.status === "MANUAL")).toBe(true);
    expect(smoke?.checks.every((check) => check.requiresCredentials === true)).toBe(true);
  });

  it("includes known scale gaps and non-runtime governance warnings", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const rendered = renderDashboard(report);

    expect(KNOWN_SCALE_GAPS).toEqual(
      expect.arrayContaining([
        "Persisted outcome tracking backend has passed authenticated staging smoke for a synthetic response-only path, and authenticated outcome admin-review smoke has passed for a synthetic metadata-only review path; outcome UI, response-document workflow, historical backfill, non-owner smoke, production-scale repeated smoke, and monitoring remain future work.",
        "Backup/restore verification remains future work.",
        "Monitoring and alert delivery remain future work.",
        "No admin override exists and it should remain absent.",
        "DB registry remains non-runtime governance metadata.",
      ]),
    );
    expect(rendered).toContain("DB registry remains non-runtime governance metadata.");
    expect(rendered).toContain("No admin override exists and it should remain absent.");
    expect(rendered).toContain("static runtime mappings remain active truth");
  });

  it("can run without credentials", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });

    expect(report.categories.find((category) => category.name === "Manual / Gated Smoke")?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "MANUAL", requiresCredentials: true }),
      ]),
    );
    expect(report.summary.manual).toBeGreaterThan(0);
  });

  it("supports run-checks through bounded command result mapping", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const executed: string[] = [];
    const checked = applyRunResults(report, (command) => {
      executed.push(command);
      return 0;
    });

    expect(executed).toEqual(SAFE_RUN_CHECK_COMMANDS);
    expect(
      checked.categories
        .flatMap((category) => category.checks)
        .filter((item) => SAFE_RUN_CHECK_COMMANDS.includes(item.command ?? ""))
        .every((item) => item.status === "PASS"),
    ).toBe(true);
  });

  it("parses json, run-checks, list-checks, and category flags", () => {
    expect(parseArgs(["--json", "--run-checks", "--list-checks", "--category", "Evidence"])).toEqual({
      json: true,
      runChecks: true,
      listChecks: true,
      category: "Evidence",
    });
  });
});
