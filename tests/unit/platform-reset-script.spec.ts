import { describe, expect, it } from "vitest";

import {
  HARD_RESET_TABLES,
  PRESERVED_TABLES,
  RESET_FILE_TARGETS,
  SOFT_RESET_TABLES,
  assertResetSafety,
  buildResetPlan,
  parseResetArgs,
  resolveResetEnvironment,
} from "../../scripts/reset-platform.mjs";

describe("platform reset script guards", () => {
  it("requires explicit environment confirmation and defaults dry-run to soft scope", () => {
    expect(() => parseResetArgs(["--dry-run"])).toThrow(/confirm-env/i);
    expect(parseResetArgs(["--dry-run", "--confirm-env", "local"])).toMatchObject({
      execution: "dry-run",
      resetScope: "soft",
      confirmEnv: "local",
    });
    expect(parseResetArgs(["--dry-run", "--preview-hard", "--confirm-env", "staging"])).toMatchObject({
      execution: "dry-run",
      resetScope: "hard",
      confirmEnv: "staging",
    });
  });

  it("refuses production and unknown targets", () => {
    const production = resolveResetEnvironment(
      { CRP_ENV: "production" },
      "postgres://user:pass@db.example.com:5432/creditregulatorpro_prod",
    );
    expect(production.kind).toBe("production");
    expect(() => assertResetSafety({ environment: production, confirmEnv: "production" })).toThrow(/production/i);

    const unknown = resolveResetEnvironment({}, "postgres://user:pass@db.internal.example:5432/creditregulatorpro");
    expect(unknown.kind).toBe("unknown");
    expect(() => assertResetSafety({ environment: unknown, confirmEnv: "staging" })).toThrow(/unknown/i);
  });

  it("fails when detected environment and confirmation do not match", () => {
    const local = resolveResetEnvironment({}, "postgres://user:pass@localhost:5432/creditregulatorpro_dev");
    expect(local.kind).toBe("local");
    expect(() => assertResetSafety({ environment: local, confirmEnv: "staging" })).toThrow(/mismatch/i);
    expect(() => assertResetSafety({ environment: local, confirmEnv: "local" })).not.toThrow();
  });

  it("does not delete preserved platform intelligence tables", () => {
    const targetedTables = new Set([...SOFT_RESET_TABLES, ...HARD_RESET_TABLES.map((step) => step.table)]);

    for (const table of PRESERVED_TABLES) {
      expect(targetedTables.has(table), `${table} should be preserved`).toBe(false);
    }

    expect(targetedTables.has("report_artifact")).toBe(true);
    expect(targetedTables.has("tradeline")).toBe(true);
    expect(targetedTables.has("creditor_obligation_test")).toBe(true);
    expect(targetedTables.has("packet")).toBe(true);
    expect(targetedTables.has("parser_test_run")).toBe(true);
  });

  it("hard reset deletes only non-admin users after operational data is cleared", () => {
    const hardUserStep = HARD_RESET_TABLES.find((step) => step.table === "users");
    expect(hardUserStep?.where).toBe("role <> 'admin'");

    const hardPlan = buildResetPlan("hard");
    const usersIndex = hardPlan.tableSteps.findIndex((step) => step.table === "users");
    const auditIndex = hardPlan.tableSteps.findIndex((step) => step.table === "audit_log");
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(usersIndex).toBeGreaterThan(auditIndex);
  });

  it("limits file cleanup to generated workspace paths", () => {
    for (const target of RESET_FILE_TARGETS) {
      expect(target.relativePath).not.toMatch(/^(\.\.|\/|[A-Za-z]:)/);
      expect(target.relativePath).toMatch(/^(\.local\/|document-storage\/|output\/pdf)/);
    }
  });
});
