import { describe, expect, it } from "vitest";

import {
  HARD_RESET_TABLES,
  PRESERVED_TABLES,
  RESET_FILE_TARGETS,
  assertResetSafety,
  buildPreservedUserPredicate,
  buildResetPlan,
  parseResetArgs,
  resolveResetEnvironment,
  validateCanonicalAdminPreservationSummary,
} from "../../scripts/reset-platform.mjs";

describe("platform reset script guards", () => {
  it("requires explicit environment confirmation and defaults dry-run to soft scope", () => {
    expect(() => parseResetArgs(["--dry-run"])).toThrow(/confirm-env/i);
    expect(() => parseResetArgs(["--soft", "--confirm-env", "local"])).toThrow(/confirm/i);
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
    expect(parseResetArgs(["--soft", "--confirm-env", "local", "--confirm"])).toMatchObject({
      execution: "apply",
      resetScope: "soft",
      confirm: true,
      confirmEnv: "local",
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

  it("does not classify a local development database as staging only because its name contains staging", () => {
    const local = resolveResetEnvironment(
      { NODE_ENV: "development" },
      "postgres://user:pass@127.0.0.1:5432/creditregulatorpro_staging",
    );
    expect(local.kind).toBe("local");
  });

  it("does not delete preserved platform intelligence tables", () => {
    const targetedTables = new Set(buildResetPlan("hard").tableSteps.map((step) => step.table));

    for (const table of PRESERVED_TABLES) {
      expect(targetedTables.has(table), `${table} should be preserved`).toBe(false);
    }

    expect(targetedTables.has("report_artifact")).toBe(true);
    expect(targetedTables.has("tradeline")).toBe(true);
    expect(targetedTables.has("creditor_obligation_test")).toBe(true);
    expect(targetedTables.has("packet")).toBe(true);
    expect(targetedTables.has("parser_test_run")).toBe(true);
    expect(targetedTables.has("compliance_config")).toBe(true);
  });

  it("soft reset preserves users and hard reset preserves only explicitly configured admin emails", () => {
    const softPlan = buildResetPlan("soft");
    const softUserStep = softPlan.tableSteps.find((step) => step.table === "users");
    expect(softPlan.deletesUsers).toBe(false);
    expect(softUserStep).toBeUndefined();
    expect(softPlan.userPreservePredicate).toBe("true");
    expect(softPlan.userDeletePredicate).toBe("not (true)");

    const hardUserStep = HARD_RESET_TABLES.find((step) => step.table === "users");
    expect(hardUserStep?.where).toContain("not (");
    expect(hardUserStep?.where).toContain("false");

    const hardPlan = buildResetPlan("hard", { preserveAdminEmails: ["Admin@Test.Example"] });
    expect(hardPlan.deletesUsers).toBe(true);
    expect(hardPlan.userPreservePredicate).toContain("'admin'");
    expect(hardPlan.userPreservePredicate).toContain("'super_admin'");
    expect(hardPlan.userPreservePredicate).toContain("lower(email) in ('admin@test.example')");
    expect(hardPlan.userPreservePredicate).not.toContain("'service'");
    expect(hardPlan.userPreservePredicate).not.toContain("'system'");

    expect(hardPlan.deletesUsers).toBe(true);
    const usersIndex = hardPlan.tableSteps.findIndex((step) => step.table === "users");
    const auditIndex = hardPlan.tableSteps.findIndex((step) => step.table === "audit_log");
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(usersIndex).toBeGreaterThan(auditIndex);
  });

  it("preserves platform reset audit rows during confirmed reset", () => {
    const hardPlan = buildResetPlan("hard", { preserveAuditLogIds: [12] });
    const auditStep = hardPlan.tableSteps.find((step) => step.table === "audit_log");
    expect(auditStep?.where).toBe("id not in (12)");
    expect(auditStep?.action).toBe("delete_all_except_platform_reset_audit");
    expect(hardPlan.preserveAuditLogIds).toEqual([12]);
  });

  it("fails hard reset plans that would not leave exactly one configured admin by default", () => {
    expect(buildPreservedUserPredicate("hard", [])).toBe("false");
    expect(() => validateCanonicalAdminPreservationSummary({
      scope: "hard",
      usersTableMissing: false,
      preserveAdminEmails: [],
      preservedAdminCount: 0,
      preservedUserCount: 0,
    })).toThrow(/RESET_PRESERVE_ADMIN_EMAILS/i);
    expect(() => validateCanonicalAdminPreservationSummary({
      scope: "hard",
      usersTableMissing: false,
      preserveAdminEmails: ["admin@example.test"],
      preservedAdminCount: 0,
      preservedUserCount: 0,
    })).toThrow(/zero admins/i);
    expect(() => validateCanonicalAdminPreservationSummary({
      scope: "hard",
      usersTableMissing: false,
      preserveAdminEmails: ["one@example.test", "two@example.test"],
      preservedAdminCount: 2,
      preservedUserCount: 2,
    })).toThrow(/more than one admin/i);
    expect(() => validateCanonicalAdminPreservationSummary({
      scope: "hard",
      usersTableMissing: false,
      preserveAdminEmails: ["admin@example.test"],
      preservedAdminCount: 1,
      preservedUserCount: 2,
    })).toThrow(/exactly one user row/i);
    expect(() => validateCanonicalAdminPreservationSummary({
      scope: "hard",
      usersTableMissing: false,
      preserveAdminEmails: ["admin@example.test"],
      preservedAdminCount: 1,
      preservedUserCount: 1,
    })).not.toThrow();
  });

  it("allows explicitly configured multiple preserved admins only when acknowledged", () => {
    expect(() => validateCanonicalAdminPreservationSummary({
      scope: "hard",
      usersTableMissing: false,
      preserveAdminEmails: ["one@example.test", "two@example.test"],
      preservedAdminCount: 2,
      preservedUserCount: 2,
      allowMultiplePreservedAdmins: true,
    })).not.toThrow();
  });

  it("allows explicit preserved admin emails without changing schema roles", () => {
    const hardPlan = buildResetPlan("hard", { preserveAdminEmails: ["Admin@Test.Example"] });
    const usersStep = hardPlan.tableSteps.find((step) => step.table === "users");
    expect(usersStep?.where).toContain("lower(email) in ('admin@test.example')");
  });

  it("limits file cleanup to generated workspace paths", () => {
    for (const target of RESET_FILE_TARGETS) {
      expect(target.relativePath).not.toMatch(/^(\.\.|\/|[A-Za-z]:)/);
      expect(target.relativePath).toMatch(/^(\.local\/|document-storage\/|output\/pdf)/);
    }
  });
});
