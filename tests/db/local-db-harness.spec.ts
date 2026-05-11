import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertSafeLocalDatabaseUrl } from "../utils/localDbHarness";

describe("local DB harness safety", () => {
  it("refuses to run DB tests unless local dev mode is explicit", () => {
    expect(() =>
      assertSafeLocalDatabaseUrl({
        FLOOT_DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/creditregulatorpro_staging",
      } as NodeJS.ProcessEnv)
    ).toThrow(/CRP_LOCAL_DEV=true/);
  });

  it("refuses non-local database hosts", () => {
    expect(() =>
      assertSafeLocalDatabaseUrl({
        CRP_LOCAL_DEV: "true",
        FLOOT_DATABASE_URL: "postgres://user:pass@staging-db.example.com:5432/creditregulatorpro_staging",
      } as NodeJS.ProcessEnv)
    ).toThrow(/non-local database host/);
  });

  it("accepts an explicitly local database with the expected local database name", () => {
    expect(
      assertSafeLocalDatabaseUrl({
        CRP_LOCAL_DEV: "true",
        LOCAL_DATABASE_NAME: "creditregulatorpro_staging",
        FLOOT_DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/creditregulatorpro_staging",
      } as NodeJS.ProcessEnv)
    ).toBe("postgres://user:pass@127.0.0.1:5432/creditregulatorpro_staging");
  });
});

describe("local bootstrap table coverage", () => {
  it("keeps bootstrap scripts covering the deployment-critical tables", () => {
    const projectRoot = process.cwd();
    const schemaSource = readFileSync(path.join(projectRoot, "helpers", "schema.tsx"), "utf8");
    const fixtureBootstrap = readFileSync(path.join(projectRoot, "scripts", "bootstrap-local-app-fixtures.ts"), "utf8");
    const authBootstrap = readFileSync(path.join(projectRoot, "scripts", "bootstrap-local-auth-schema.ts"), "utf8");
    const bootstrapSource = `${authBootstrap}\n${fixtureBootstrap}`;

    const criticalTables = [
      "users",
      "userAccount",
      "consumerIdentificationDocument",
      "sessions",
      "subscriptions",
      "reportArtifact",
      "passExtraction",
      "tradeline",
      "tradelineSnapshot",
      "creditorObligationTest",
      "violationCorrection",
      "violationCorrectionEvidence",
      "violationRegulationReference",
      "violationTrainingExample",
      "packet",
    ];

    for (const table of criticalTables) {
      expect(schemaSource).toContain(`${table}:`);
      expect(bootstrapSource).toMatch(new RegExp(table.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)));
    }
  });

  it("keeps localhost on a single canonical admin role after refresh", () => {
    const projectRoot = process.cwd();
    const authBootstrap = readFileSync(path.join(projectRoot, "scripts", "bootstrap-local-auth-schema.ts"), "utf8");

    expect(authBootstrap).toContain("resolveLocalAdminAuth");
    expect(authBootstrap).toContain("Refusing to bootstrap local admin unless CRP_LOCAL_DEV=true");
    expect(authBootstrap).toContain("Refusing to bootstrap local admin for non-local database host");
    expect(authBootstrap).toContain("LOCAL_DEV_SINGLE_ADMIN");
    expect(authBootstrap).toContain("role = 'support'");
    expect(authBootstrap).toContain("Normalized localhost admin accounts");
  });

  it("keeps staging refresh transaction timeout handling quiet and compatible", () => {
    const projectRoot = process.cwd();
    const refreshScript = readFileSync(path.join(projectRoot, "scripts", "refresh-local-from-staging.mjs"), "utf8");

    expect(refreshScript).toContain("createTransactionTimeoutSetFilter");
    expect(refreshScript).toContain("SET\\s+transaction_timeout");
    expect(refreshScript).not.toContain("Local target does not support transaction_timeout");
  });
});
