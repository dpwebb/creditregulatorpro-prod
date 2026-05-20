import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildStorageRawReportInventoryReport,
  detectStorageInventoryProductionEnvironment,
  renderStorageRawReportInventoryMarkdown,
  writeStorageRawReportInventoryEvidence,
  type StorageInventoryCounts,
} from "../../scripts/storage-raw-report-inventory";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-storage-inventory-test-"));
  tempRoots.push(root);
  return root;
}

function counts(overrides: Partial<StorageInventoryCounts> = {}): StorageInventoryCounts {
  return {
    totalRows: 4,
    storageUrlRows: 3,
    localReferenceRows: 2,
    possibleInlineBase64Rows: 1,
    dataUrlBase64Rows: 0,
    nonLocalReferenceRows: 0,
    nullStorageRows: 1,
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("storage raw report inventory evidence", () => {
  it("writes sanitized markdown and json inventory evidence without raw values", () => {
    const rootDir = makeTempRoot();
    const report = buildStorageRawReportInventoryReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      counts: {
        reportArtifact: counts({ possibleInlineBase64Rows: 3 }),
        evidenceAttachment: counts({ possibleInlineBase64Rows: 2 }),
      },
    });
    const outputs = writeStorageRawReportInventoryEvidence(report, { rootDir });
    const markdownPath = join(rootDir, outputs.markdownPath);
    const jsonPath = join(rootDir, outputs.jsonPath);

    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    const markdown = readFileSync(markdownPath, "utf8");
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));

    expect(markdown).toContain("# Storage Raw Report Inventory");
    expect(markdown).toContain("| Possible inline base64 rows | 3 |");
    expect(markdown).toContain("| Possible inline base64 rows | 2 |");
    expect(json.rawValuesPrinted).toBe(false);
    expect(json.historicalRowsMigrated).toBe(false);
    expect(`${markdown}\n${JSON.stringify(json)}`).not.toMatch(
      /JVBERi0|data:application\/pdf;base64|storageUrl"\s*:\s*"|X-Goog-|AWSAccessKeyId|Signature=|postgres:\/\/|password=|sk-[A-Za-z0-9]/i,
    );
  });

  it("renders inventory as non-production, non-destructive evidence only", () => {
    const report = buildStorageRawReportInventoryReport({
      rootDir: makeTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      counts: {
        reportArtifact: counts(),
        evidenceAttachment: counts(),
      },
    });
    const markdown = renderStorageRawReportInventoryMarkdown(report);

    expect(report.evidenceType).toBe("SANITIZED_READ_ONLY_INVENTORY");
    expect(report.nonDestructive).toBe(true);
    expect(report.productionDataMutated).toBe(false);
    expect(report.safety.rawReportBytesExposed).toBe(false);
    expect(markdown).toContain("Historical rows migrated: no");
    expect(markdown).toContain("Raw storageUrl values printed: no");
  });

  it("does not treat unavailable database counts as zero-row proof", () => {
    const report = buildStorageRawReportInventoryReport({
      rootDir: makeTempRoot(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      databaseReachable: false,
      collectionError: "database unavailable; raw connection details and database targets are not stored",
      counts: {
        reportArtifact: counts({ possibleInlineBase64Rows: 0 }),
        evidenceAttachment: counts({ possibleInlineBase64Rows: 0 }),
      },
    });
    const markdown = renderStorageRawReportInventoryMarkdown(report);

    expect(report.status).toBe("database-unavailable");
    expect(report.countsReliable).toBe(false);
    expect(report.safety.databaseUnavailableDoesNotImplyZeroInlineRows).toBe(true);
    expect(markdown).toContain("Counts reliable: no");
    expect(markdown).toContain("Do not treat unavailable counts as zero.");
    expect(markdown).toContain("| Possible inline base64 rows | unavailable |");
  });

  it("fails closed for production-like environments", () => {
    expect(detectStorageInventoryProductionEnvironment({ CRP_ENV: "production" })).toMatchObject({
      productionLike: true,
    });
    expect(() =>
      buildStorageRawReportInventoryReport({
        rootDir: makeTempRoot(),
        env: { DATABASE_URL: "postgres://host/creditregulatorpro-prod" },
        counts: {
          reportArtifact: counts(),
          evidenceAttachment: counts(),
        },
      }),
    ).toThrow(/production-like environment/i);
  });

  it("exposes the package inventory command", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["storage:raw-report-inventory"]).toBe("tsx scripts/storage-raw-report-inventory.ts");
  });
});
