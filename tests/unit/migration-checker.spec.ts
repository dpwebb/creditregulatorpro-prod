import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  renderMigrationReport,
  scanMigrationState,
} from "../../scripts/check-migrations.mjs";

describe("migration checker", () => {
  it("inventories expected schema creation sources without database access", () => {
    const report = scanMigrationState({ rootDir: process.cwd() });

    expect(report.safety).toEqual({
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      readsCredentials: false,
    });
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
  });

  it("reports unknown and unledgered schema mutation points clearly", () => {
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
      expect(rendered).toContain("Unknown source: helpers/untrackedSchema.ts");
      expect(rendered).toContain("Unledgered source: helpers/untrackedSchema.ts");
      expect(rendered).toContain("Run check:migrations as a non-blocking informational report only");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("exposes the package script used by the migration report", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts["check:migrations"]).toBe("node scripts/check-migrations.mjs");
  });
});
