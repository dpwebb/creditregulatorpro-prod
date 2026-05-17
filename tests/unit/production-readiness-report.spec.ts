import { describe, expect, it } from "vitest";

import {
  buildProductionReadinessReport,
  CORE_READINESS_COMMANDS,
  parseArgs,
  READINESS_LEVELS,
  REPORT_SAFETY_BOUNDARIES,
  ROLLBACK_SHA_REMINDER,
} from "../../scripts/production-readiness-report";

function fakeGit(statusShort: string) {
  return (args: string[]) => {
    const key = args.join(" ");
    if (key === "status --short") return statusShort;
    if (key === "branch --show-current") return "staging";
    if (key === "rev-parse HEAD") return "f45f4eb3bf5cf494e52f46c56fd0b62da32aad2c";
    if (key === "log -1 --pretty=%s") return "Harden internal documentation exposure";
    return "";
  };
}

describe("production readiness report", () => {
  it("blocks dirty working trees only when enforce-clean is enabled", () => {
    const dirty = " M docs/future-build-plan.md";
    expect(
      buildProductionReadinessReport({
        enforceClean: false,
        runGit: fakeGit(dirty),
        fileExists: () => true,
      }).status,
    ).toBe("review_required");

    const enforced = buildProductionReadinessReport({
      enforceClean: true,
      runGit: fakeGit(dirty),
      fileExists: () => true,
    });

    expect(enforced.status).toBe("blocked");
    expect(enforced.operatorDecision).toMatch(/working tree is dirty/i);
  });

  it("does not target production DB, create data, promote, or activate runtime truth", () => {
    expect(REPORT_SAFETY_BOUNDARIES).toMatchObject({
      modifiesFiles: false,
      callsProductionEndpoints: false,
      touchesProductionDb: false,
      createsData: false,
      promotesProduction: false,
      activatesRuntimeBridgeMappings: false,
      createsPackets: false,
      usesRealConsumerData: false,
    });

    const commands = CORE_READINESS_COMMANDS.map((check) => [check.command, ...check.args].join(" "));
    expect(commands.some((command) => /promote:production|DATABASE_URL|packet\/create|creditregulatorpro\.com/i.test(command))).toBe(false);
  });

  it("lists the required local checks and rollback SHA reminder", () => {
    const commands = CORE_READINESS_COMMANDS.map((check) => [check.command, ...check.args].join(" "));

    expect(commands).toEqual(
      expect.arrayContaining([
        "pnpm exec vitest run tests/unit/public-static-dev-assets.spec.ts",
        "pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts",
        "pnpm run test:golden-path",
        "pnpm run test:contracts",
        "pnpm run test:api",
        "pnpm run typecheck",
        "git diff --check",
      ]),
    );
    expect(ROLLBACK_SHA_REMINDER).toMatch(/rollback target/i);
  });

  it("includes controlled, general, and scale readiness levels", () => {
    expect(READINESS_LEVELS.map((level) => level.name)).toEqual([
      "Controlled Production Ready",
      "General Production Ready",
      "Scale Production Ready",
    ]);
  });

  it("checks important operator files without reading production data", () => {
    const report = buildProductionReadinessReport({
      runGit: fakeGit(""),
      fileExists: (path) => path.includes("production-readiness-checklist.md"),
    });

    expect(report.requiredFiles.map((file) => file.path)).toContain("docs/production-readiness-checklist.md");
    expect(report.missingRequiredFiles).toEqual(
      expect.arrayContaining([
        "scripts/production-readiness-gate.mjs",
        "scripts/promote-production.mjs",
      ]),
    );
  });

  it("parses reporting flags without defaulting to running checks", () => {
    expect(parseArgs(["--json", "--enforce-clean"])).toEqual({
      json: true,
      runChecks: false,
      enforceClean: true,
    });
    expect(parseArgs(["--run-checks"]).runChecks).toBe(true);
  });
});
