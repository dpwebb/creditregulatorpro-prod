import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMigrationGateReport,
  renderMigrationGateReport,
  validateMigrationGateReport,
  writeMigrationGateEvidence,
} from "../../scripts/migration-gate.mjs";

const generatedAt = "2026-05-20T12:00:00.000Z";

function tempRoot() {
  return mkdtempSync(path.join(tmpdir(), "crp-migration-gate-"));
}

function knownRuntimeSource() {
  return [{
    path: "helpers/knownSchema.ts",
    kind: "runtime-ensure",
    description: "Fixture known runtime ensure.",
  }];
}

function bootstrapSource() {
  return [{
    path: "scripts/bootstrap-fixture.ts",
    kind: "bootstrap",
    description: "Fixture bootstrap DDL.",
  }];
}

function policy({
  currentMode = "waived",
  runtimePaths = ["helpers/knownSchema.ts"],
  bootstrapPaths = [] as string[],
  waiver = true,
} = {}) {
  return {
    schemaVersion: 1,
    policyName: "fixture-policy",
    currentMode,
    approvedRuntimeEnsureInventory: runtimePaths.map((sourcePath) => ({ path: sourcePath })),
    allowedBootstrapScripts: bootstrapPaths.map((sourcePath) => ({ path: sourcePath })),
    forbiddenMutationPatterns: [{ pattern: "drop table/index" }],
    releaseGateRequirements: ["Run pnpm run migrations:gate."],
    waiverRequirements: ["formalWaiver.reason is required."],
    futureCutoverProcedure: ["Create additive reviewed ledger migrations."],
    formalWaiver: waiver
      ? {
          status: "approved",
          reason: "Runtime ensure residual is waived until additive migration ledger cutover.",
          approvedByRole: "Release governance owner",
          acceptedAt: "2026-05-20T00:00:00.000Z",
          expiresOn: "2026-08-20",
        }
      : {},
  };
}

function writeKnownRuntimeFixture(rootDir: string, ledgerText = "- `helpers/knownSchema.ts`\n") {
  mkdirSync(path.join(rootDir, "helpers"), { recursive: true });
  mkdirSync(path.join(rootDir, "migrations"), { recursive: true });
  writeFileSync(
    path.join(rootDir, "helpers", "knownSchema.ts"),
    "export async function ensureKnownSchema(sql) { await sql`create table if not exists public.known_schema (id text primary key)`; }\n",
  );
  writeFileSync(path.join(rootDir, "migrations", "0000-runtime-schema-inventory.md"), ledgerText);
}

describe("migration gate", () => {
  it("fails on unknown runtime schema mutation sources", () => {
    const rootDir = tempRoot();
    try {
      mkdirSync(path.join(rootDir, "helpers"), { recursive: true });
      mkdirSync(path.join(rootDir, "migrations"), { recursive: true });
      writeFileSync(
        path.join(rootDir, "helpers", "unknownSchema.ts"),
        "export async function ensureUnknown(sql) { await sql`create table if not exists public.unknown_schema (id text primary key)`; }\n",
      );
      writeFileSync(path.join(rootDir, "migrations", "0000-runtime-schema-inventory.md"), "# Empty\n");

      const report = buildMigrationGateReport({
        rootDir,
        policy: policy({ runtimePaths: [] }),
        scanRoots: ["helpers"],
        expectedSources: [],
        generatedAt,
      });

      expect(report.status).toBe("failed");
      expect(report.releaseGateAccepted).toBe(false);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "unknown-schema-mutation-source",
            sourcePath: "helpers/unknownSchema.ts",
            impact: "release-blocking",
          }),
        ]),
      );
      expect(validateMigrationGateReport(report)).toEqual({ ok: true, errors: [] });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails on missing expected inventory entries", () => {
    const rootDir = tempRoot();
    try {
      writeKnownRuntimeFixture(rootDir, "# Inventory intentionally missing known source\n");

      const report = buildMigrationGateReport({
        rootDir,
        policy: policy(),
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: knownRuntimeSource(),
        generatedAt,
      });

      expect(report.status).toBe("failed");
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "missing-expected-inventory-entry",
            sourcePath: "helpers/knownSchema.ts",
            impact: "release-blocking",
          }),
        ]),
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails on unapproved bootstrap mutation sources", () => {
    const rootDir = tempRoot();
    try {
      mkdirSync(path.join(rootDir, "scripts"), { recursive: true });
      mkdirSync(path.join(rootDir, "migrations"), { recursive: true });
      writeFileSync(
        path.join(rootDir, "scripts", "bootstrap-fixture.ts"),
        "export async function bootstrap(sql) { await sql`create table if not exists public.bootstrap_fixture (id text primary key)`; }\n",
      );
      writeFileSync(path.join(rootDir, "migrations", "0000-runtime-schema-inventory.md"), "- `scripts/bootstrap-fixture.ts`\n");

      const report = buildMigrationGateReport({
        rootDir,
        policy: policy({ runtimePaths: [], bootstrapPaths: [] }),
        scanRoots: ["scripts"],
        ledgerDir: "migrations",
        expectedSources: bootstrapSource(),
        generatedAt,
      });

      expect(report.status).toBe("failed");
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "unapproved-bootstrap-mutation-source",
            sourcePath: "scripts/bootstrap-fixture.ts",
            impact: "release-blocking",
          }),
        ]),
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("treats approved runtime ensure residuals as warning-only or blocked according to policy mode", () => {
    const rootDir = tempRoot();
    try {
      writeKnownRuntimeFixture(rootDir);

      const warningReport = buildMigrationGateReport({
        rootDir,
        policy: policy({ currentMode: "warning-only", waiver: false }),
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: knownRuntimeSource(),
        generatedAt,
      });
      const releaseBlockingReport = buildMigrationGateReport({
        rootDir,
        policy: policy({ currentMode: "release-blocking", waiver: false }),
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: knownRuntimeSource(),
        generatedAt,
      });

      expect(warningReport.status).toBe("warning-only");
      expect(warningReport.releaseGateAccepted).toBe(false);
      expect(warningReport.runtimeEnsureResidualImpact).toBe("warning-only");
      expect(warningReport.warningOnlyFindings.length).toBeGreaterThan(0);
      expect(releaseBlockingReport.status).toBe("failed");
      expect(releaseBlockingReport.runtimeEnsureResidualImpact).toBe("release-blocking");
      expect(releaseBlockingReport.releaseBlockingFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "approved-runtime-ensure-residual",
            sourcePath: "helpers/knownSchema.ts",
            impact: "release-blocking",
          }),
        ]),
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("accepts a formal waiver without mutating a database", () => {
    const rootDir = tempRoot();
    try {
      writeKnownRuntimeFixture(rootDir);
      const report = buildMigrationGateReport({
        rootDir,
        policy: policy(),
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: knownRuntimeSource(),
        generatedAt,
      });
      const rendered = renderMigrationGateReport(report);
      const outputs = writeMigrationGateEvidence(report, { rootDir });
      const json = JSON.parse(readFileSync(path.join(rootDir, outputs.jsonPath), "utf8"));

      expect(report.status).toBe("accepted-formal-waiver");
      expect(report.blockerCoverage.migrationGovernance).toBe(true);
      expect(report.safety).toMatchObject({
        nonMutating: true,
        requiresDatabase: false,
        mutatesDatabase: false,
        executesDdl: false,
        productionMutationAttempted: false,
      });
      expect(rendered).toContain("Safety: non-mutating static source and policy validation only");
      expect(outputs.markdownPath).toBe("docs/production-scale/evidence/latest-migration-gate.md");
      expect(outputs.jsonPath).toBe("docs/production-scale/evidence/latest-migration-gate.json");
      expect(json.validation.ok).toBe(true);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("exposes the package command and avoids DB imports", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    const script = readFileSync(path.join(process.cwd(), "scripts", "migration-gate.mjs"), "utf8");

    expect(packageJson.scripts["migrations:gate"]).toBe("node scripts/migration-gate.mjs");
    expect(script).toContain("Migration gate is static and non-mutating");
    expect(script).not.toMatch(/from\s+["']\.\.\/helpers\/db["']/);
  });
});
