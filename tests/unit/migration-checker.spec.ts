import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  renderMigrationReport,
  scanMigrationState,
  validateMigrationGovernanceReport,
  writeMigrationGovernanceEvidence,
} from "../../scripts/check-migrations.mjs";

describe("migration checker", () => {
  it("inventories expected schema creation sources without database access", () => {
    const report = scanMigrationState({ rootDir: process.cwd() });

    expect(report.safety).toMatchObject({
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      readsCredentials: false,
      productionMutationAttempted: false,
      liveExternalProvidersConnected: false,
    });
    expect(validateMigrationGovernanceReport(report)).toEqual({ ok: true, errors: [] });
    expect(report.reportName).toBe("migration-governance-drift-evidence");
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.evidenceTimestamp).toBe(report.generatedAt);
    expect(report.branch).toBeTruthy();
    expect(report.commit).toBeTruthy();
    expect(report.bootstrapScripts.map((source) => source.path)).toEqual(
      expect.arrayContaining([
        "scripts/bootstrap-local-auth-schema.ts",
        "scripts/bootstrap-local-app-fixtures.ts",
      ]),
    );
    expect(report.runtimeEnsureFunctions.map((source) => source.path)).toEqual(
      expect.arrayContaining([
        "helpers/consumerIdentification.ts",
        "helpers/ingestProcessingQueueSchema.ts",
        "helpers/regulationRegistrySchema.ts",
        "helpers/responseDocumentSchema.ts",
        "helpers/violationCorrectionSchema.tsx",
      ]),
    );
    expect(report.migrationLedgerEntries.map((entry) => entry.path)).toContain(
      "migrations/0000-runtime-schema-inventory.md",
    );
    expect(report.releaseSummary.checkerMode).toBe("release-visible-reporting-only");
    expect(report.releaseSummary.governanceStatus).toBe("partial");
    expect(report.releaseSummary.hardDeployGateEnabled).toBe(false);
    expect(report.findings.some((finding) => finding.releaseImpact === "warning-only")).toBe(true);
  });

  it("detects an unknown runtime mutation source in a fixture", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-migration-check-"));
    try {
      mkdirSync(path.join(rootDir, "helpers"), { recursive: true });
      writeFileSync(
        path.join(rootDir, "helpers", "untrackedSchema.ts"),
        "export async function ensureUntrackedSchema(sql) { await sql`create table if not exists public.untracked (id text primary key)`; }\n",
      );

      const report = scanMigrationState({
        rootDir,
        scanRoots: ["helpers"],
        expectedSources: [],
      });
      const rendered = renderMigrationReport(report);

      expect(report.unknownSchemaMutationSources).toEqual(["helpers/untrackedSchema.ts"]);
      expect(report.unledgeredSchemaMutationSources).toEqual(["helpers/untrackedSchema.ts"]);
      expect(report.releaseSummary.releaseBlockingFindings).toBeGreaterThan(0);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "unknown-schema-mutation-source",
            sourcePath: "helpers/untrackedSchema.ts",
            releaseImpact: "release-blocking",
          }),
        ]),
      );
      expect(rendered).toContain("Unknown source: helpers/untrackedSchema.ts");
      expect(rendered).toContain("Unledgered source: helpers/untrackedSchema.ts");
      expect(rendered).toContain("[release-blocking] unknown-schema-mutation-source: helpers/untrackedSchema.ts");
      expect(rendered).toContain("Run check:migrations as a non-blocking informational report only");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("detects missing expected inventory entries in a fixture", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-migration-ledger-check-"));
    try {
      mkdirSync(path.join(rootDir, "helpers"), { recursive: true });
      mkdirSync(path.join(rootDir, "migrations"), { recursive: true });
      writeFileSync(
        path.join(rootDir, "helpers", "knownSchema.ts"),
        "export async function ensureKnownSchema(sql) { await sql`create table if not exists public.known_schema (id text primary key)`; }\n",
      );
      writeFileSync(
        path.join(rootDir, "migrations", "0000-runtime-schema-inventory.md"),
        "# Inventory\n\nThis fixture intentionally omits the known schema source.\n",
      );

      const report = scanMigrationState({
        rootDir,
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: [{
          path: "helpers/knownSchema.ts",
          kind: "runtime-ensure",
          description: "Fixture known runtime ensure.",
        }],
      });
      const rendered = renderMigrationReport(report);

      expect(report.missingExpectedInventoryEntries).toEqual(["helpers/knownSchema.ts"]);
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "missing-expected-inventory-entry",
            sourcePath: "helpers/knownSchema.ts",
            releaseImpact: "release-blocking",
          }),
        ]),
      );
      expect(rendered).toContain("Missing expected inventory entry: helpers/knownSchema.ts");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("writes release-visible evidence without mutating a database", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-migration-evidence-"));
    try {
      mkdirSync(path.join(rootDir, "helpers"), { recursive: true });
      mkdirSync(path.join(rootDir, "migrations"), { recursive: true });
      writeFileSync(path.join(rootDir, "helpers", "knownSchema.ts"), "export const ok = true;\n");
      writeFileSync(path.join(rootDir, "migrations", "0000-runtime-schema-inventory.md"), "- `helpers/knownSchema.ts`\n");
      const report = scanMigrationState({
        rootDir,
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: [{
          path: "helpers/knownSchema.ts",
          kind: "runtime-ensure",
          description: "Fixture known runtime ensure.",
        }],
        generatedAt: "2026-05-20T12:00:00.000Z",
      });
      const outputs = writeMigrationGovernanceEvidence(report, { rootDir });
      const markdown = readFileSync(path.join(rootDir, outputs.markdownPath), "utf8");
      const json = JSON.parse(readFileSync(path.join(rootDir, outputs.jsonPath), "utf8"));

      expect(report.safety.requiresDatabase).toBe(false);
      expect(report.safety.mutatesDatabase).toBe(false);
      expect(report.safety.executesDdl).toBe(false);
      expect(outputs.markdownPath).toBe("docs/production-scale/evidence/latest-migration-governance.md");
      expect(outputs.jsonPath).toBe("docs/production-scale/evidence/latest-migration-governance.json");
      expect(markdown).toContain("Safety: non-mutating static source scan only");
      expect(json.validation.ok).toBe(true);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("distinguishes warning-only residuals from release-blocking findings", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-migration-impact-check-"));
    try {
      mkdirSync(path.join(rootDir, "helpers"), { recursive: true });
      mkdirSync(path.join(rootDir, "migrations"), { recursive: true });
      writeFileSync(path.join(rootDir, "helpers", "knownSchema.ts"), "export const ok = true;\n");
      writeFileSync(
        path.join(rootDir, "helpers", "unknownSchema.ts"),
        "export async function ensureUnknown(sql) { await sql`alter table public.unknown add column if not exists x text`; }\n",
      );
      writeFileSync(path.join(rootDir, "migrations", "0000-runtime-schema-inventory.md"), "- `helpers/knownSchema.ts`\n");

      const report = scanMigrationState({
        rootDir,
        scanRoots: ["helpers"],
        ledgerDir: "migrations",
        expectedSources: [{
          path: "helpers/knownSchema.ts",
          kind: "runtime-ensure",
          description: "Fixture known runtime ensure.",
        }],
      });

      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "known-runtime-ensure-source",
            sourcePath: "helpers/knownSchema.ts",
            releaseImpact: "warning-only",
          }),
          expect.objectContaining({
            category: "unknown-schema-mutation-source",
            sourcePath: "helpers/unknownSchema.ts",
            releaseImpact: "release-blocking",
          }),
        ]),
      );
      expect(report.releaseSummary.warningOnlyFindings).toBeGreaterThan(0);
      expect(report.releaseSummary.releaseBlockingFindings).toBeGreaterThan(0);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("refuses mutation-oriented CLI flags in the checker implementation", () => {
    const script = readFileSync(path.join(process.cwd(), "scripts", "check-migrations.mjs"), "utf8");

    expect(script).toContain("--apply");
    expect(script).toContain("Migration governance evidence is static and non-mutating");
    expect(script).not.toMatch(/from\s+["']\.\.\/helpers\/db["']/);
  });

  it("release evidence references migration governance output", () => {
    const registry = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "production-scale", "blocker-registry.json"), "utf8"));
    const blocker10 = registry.blockers.find((blocker: { number: number }) => blocker.number === 10);

    expect(blocker10.currentStatus).toBe("partial");
    expect(blocker10.allowedProofCommands).toEqual(expect.arrayContaining([
      "pnpm run check:migrations",
      "pnpm run migrations:evidence",
      "pnpm exec vitest run --config vitest.config.ts tests/unit/migration-checker.spec.ts",
    ]));
    expect(blocker10.relatedEvidenceOutputPaths).toEqual(expect.arrayContaining([
      "docs/production-scale/evidence/latest-migration-governance.md",
      "docs/production-scale/evidence/latest-migration-governance.json",
    ]));
  });

  it("exposes the package script used by the migration report", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts["check:migrations"]).toBe("node scripts/check-migrations.mjs");
    expect(packageJson.scripts["migrations:evidence"]).toBe("node scripts/check-migrations.mjs --write-evidence");
  });
});
