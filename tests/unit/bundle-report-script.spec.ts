import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectBundleReport,
  collectRouteSplitReport,
  parseBundleReportArgs,
  parseCommandResults,
  renderBundleReport,
  SAFE_ROUTE_SPLIT_TARGETS,
  writeBundleEvidenceOutputs,
} from "../../scripts/bundle-report.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, source: string) {
  const absolutePath = path.join(rootDir, ...relativePath.split("/"));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

function routeMapEntries() {
  return SAFE_ROUTE_SPLIT_TARGETS
    .map((target) => `["./pages/${target.file}","${target.route}"]`)
    .join(",");
}

function lazyRouteDeclarations() {
  return SAFE_ROUTE_SPLIT_TARGETS
    .map((target, index) => `const Page_${index} = React.lazy(() => import("./pages/${target.file}"));`)
    .join("\n");
}

describe("bundle report script", () => {
  it("parses CLI args and command result metadata", () => {
    expect(parseBundleReportArgs([])).toMatchObject({
      distDir: "dist",
      evidenceDir: "docs/production-scale/evidence",
      topAssets: 20,
      writeEvidence: true,
      json: false,
    });
    expect(parseBundleReportArgs([
      "--json",
      "--no-write-evidence",
      "--dist-dir",
      "build",
      "--evidence-dir",
      "out",
      "--top-assets",
      "3",
    ])).toMatchObject({
      json: true,
      writeEvidence: false,
      distDir: "build",
      evidenceDir: "out",
      topAssets: 3,
    });
    expect(() => parseBundleReportArgs(["--top-assets", "0"])).toThrow(/between 1 and 100/i);
    expect(() => parseBundleReportArgs(["--unknown"])).toThrow(/Unknown option/i);

    expect(parseCommandResults("pnpm run build=passed;git diff --check=passed")).toEqual([
      { command: "pnpm run build", status: "passed", automated: true },
      { command: "git diff --check", status: "passed", automated: true },
    ]);
  });

  it("detects safe lazy route targets in the current app route map", () => {
    const report = collectRouteSplitReport({ rootDir: process.cwd() });

    expect(report.routeMapPresent).toBe(true);
    expect(report.suspenseWrapped).toBe(true);
    expect(report.allTargetsLazyLoaded).toBe(true);
    expect(report.targets.map((target) => target.route)).toEqual([
      "/packets",
      "/admin-parser-testing",
      "/admin-parser-mappings",
      "/admin-response-documents",
    ]);
    expect(report.targets.every((target) => target.lazyLoaded)).toBe(true);
    expect(report.targets.every((target) => !target.eagerPageImportPresent)).toBe(true);
  });

  it("generates non-blocking bundle evidence with build assets and route split status", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-bundle-report-"));
    try {
      writeFixtureFile(rootDir, "package.json", JSON.stringify({
        type: "module",
        dependencies: {
          react: "19.2.1",
        },
        devDependencies: {},
      }, null, 2));
      writeFixtureFile(rootDir, "dist/_assets/app.js", "console.log('bundle fixture');\n".repeat(100));
      writeFixtureFile(rootDir, "App.tsx", [
        "import React from \"react\";",
        lazyRouteDeclarations(),
        `const fileNameToRoute = new Map([${routeMapEntries()}]);`,
        "function makePageRoute(Component) {",
        "  return <React.Suspense fallback={null}><Component /></React.Suspense>;",
        "}",
      ].join("\n"));

      const report = collectBundleReport({
        rootDir,
        commandResults: [
          { command: "pnpm run build", status: "passed", automated: true },
        ],
      });
      const rendered = renderBundleReport(report);
      const outputs = writeBundleEvidenceOutputs(report, rootDir, "evidence");

      expect(report.reportName).toBe("frontend-bundle-report");
      expect(report.CERTIFYING).toBe(false);
      expect(report.safety).toMatchObject({
        reportingOnly: true,
        nonBlocking: true,
        productionScaleCertificationDependsOnThis: false,
        dependencyVersionChanges: false,
        uiRedesign: false,
        userFlowChanges: false,
        parserBehaviorChanges: false,
        packetPdfOutputChanges: false,
      });
      expect(report.routeSplitting.allTargetsLazyLoaded).toBe(true);
      expect(report.buildAssets.distPresent).toBe(true);
      expect(rendered).toContain("Frontend Bundle Report");
      expect(rendered).toContain("CERTIFYING: false");
      expect(outputs).toEqual({
        markdownPath: "evidence/latest-bundle-report.md",
        jsonPath: "evidence/latest-bundle-report.json",
      });
      expect(readFileSync(path.join(rootDir, "evidence", "latest-bundle-report.md"), "utf8")).toContain("Route Splitting");
      expect(JSON.parse(readFileSync(path.join(rootDir, "evidence", "latest-bundle-report.json"), "utf8"))).toMatchObject({
        reportName: "frontend-bundle-report",
        CERTIFYING: false,
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("exposes the bundle report script without adding analyzer dependencies or hard gates", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["report:bundle"]).toBe("node scripts/bundle-report.mjs");

    const allDeclaredPackages = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };
    expect(allDeclaredPackages).not.toHaveProperty("rollup-plugin-visualizer");
    expect(allDeclaredPackages).not.toHaveProperty("webpack-bundle-analyzer");
    expect(allDeclaredPackages).not.toHaveProperty("source-map-explorer");
  });
});
