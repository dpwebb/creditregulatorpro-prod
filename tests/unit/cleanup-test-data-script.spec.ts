import { describe, expect, it } from "vitest";

import {
  CLEANUP_TARGET_SUMMARY,
  DEFAULT_RETENTION_DAYS,
  assertCleanupSafety,
  describeDatabaseTarget,
  hasTestMarker,
  isOlderThanCutoff,
  parseCleanupArgs,
  resolveCleanupEnvironment,
  shouldCleanupMarkedRecord,
} from "../../scripts/cleanup-test-data.mjs";

describe("cleanup-test-data script guards", () => {
  it("defaults to a 5 day dry-run threshold when requested", () => {
    expect(parseCleanupArgs(["--dry-run"])).toMatchObject({
      dryRun: true,
      confirm: false,
      olderThanDays: DEFAULT_RETENTION_DAYS,
    });
  });

  it("requires exactly one execution mode and refuses shorter retention", () => {
    expect(() => parseCleanupArgs([])).toThrow(/exactly one/i);
    expect(() => parseCleanupArgs(["--dry-run", "--confirm"])).toThrow(/exactly one/i);
    expect(() => parseCleanupArgs(["--dry-run", "--older-than-days", "4"])).toThrow(/5 or greater/i);
  });

  it("preserves records newer than the cutoff even when they are marked", () => {
    const cutoff = new Date("2026-05-15T00:00:00.000Z");

    expect(shouldCleanupMarkedRecord({
      createdAt: "2026-05-20T00:00:00.000Z",
      markerText: "response-soak-fixture",
    }, cutoff)).toBe(false);
  });

  it("matches older records only when they are explicitly test-marked", () => {
    const cutoff = new Date("2026-05-15T00:00:00.000Z");

    expect(shouldCleanupMarkedRecord({
      createdAt: "2026-05-01T00:00:00.000Z",
      markerText: "ingest-queue-test synthetic fixture",
    }, cutoff)).toBe(true);
    expect(shouldCleanupMarkedRecord({
      createdAt: "2026-05-01T00:00:00.000Z",
      markerText: "manual-admin upload",
    }, cutoff)).toBe(false);
    expect(isOlderThanCutoff({ updated_at: "2026-05-01T00:00:00.000Z" }, cutoff)).toBe(true);
    expect(hasTestMarker("auth.workflow.abc@example.com")).toBe(true);
    expect(hasTestMarker("Synthetic Response Auth Smoke")).toBe(true);
    expect(hasTestMarker("response-auth-smoke-9607e71f-rce6bd18b@example.test")).toBe(true);
    expect(hasTestMarker("OUTCOME_SMOKE_20260518193736")).toBe(true);
  });

  it("refuses production-like execution unless the dangerous override is supplied", () => {
    const production = resolveCleanupEnvironment(
      { CRP_ENV: "production" },
      "postgres://user:pass@db.example.com:5432/creditregulatorpro_prod",
    );
    expect(production.kind).toBe("production");
    expect(() => assertCleanupSafety({ environment: production, dangerouslyAllowProduction: false })).toThrow(/production/i);
    expect(() => assertCleanupSafety({ environment: production, dangerouslyAllowProduction: true })).not.toThrow();
  });

  it("fails closed for unknown database targets and prints only safe database identifiers", () => {
    const unknown = resolveCleanupEnvironment(
      {},
      "postgres://user:secret@db.internal.example:5432/creditregulatorpro",
    );
    expect(unknown.kind).toBe("unknown");
    expect(() => assertCleanupSafety({ environment: unknown, dangerouslyAllowProduction: false })).toThrow(/unknown/i);

    expect(describeDatabaseTarget("postgres://user:secret@localhost:5432/creditregulatorpro_dev")).toEqual({
      host: "localhost",
      port: "5432",
      database: "creditregulatorpro_dev",
    });
  });

  it("targets response timeline smoke data without targeting findings, packets, rule, parser mapping, or migration tables", () => {
    const targetedTables = CLEANUP_TARGET_SUMMARY.map((target) => target.table);

    expect(targetedTables).toContain("bureau_response_event");
    expect(targetedTables).toContain("response_processing_event");
    expect(targetedTables).toContain("response_admin_review_event");
    expect(targetedTables).toContain("finding_outcome");
    expect(targetedTables).toContain("outcome_comparison_run");
    expect(targetedTables).toContain("audit_log");
    expect(targetedTables).toContain("users");
    expect(targetedTables).not.toContain("creditor_obligation_test");
    expect(targetedTables).not.toContain("packet");
    expect(targetedTables).not.toContain("dispute_packet_findings");
    expect(targetedTables).not.toContain("parser_test_case");
    expect(targetedTables).not.toContain("parser_field_mapping");
    expect(targetedTables).not.toContain("version_migration");

    expect(CLEANUP_TARGET_SUMMARY.find((target) => target.table === "audit_log")?.criteria).toMatch(/response-auth-smoke/);
    expect(CLEANUP_TARGET_SUMMARY.find((target) => target.id === "response_auth_smoke_user")?.criteria).toMatch(/response-auth-smoke/);
  });
});
