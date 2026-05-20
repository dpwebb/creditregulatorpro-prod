import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectRuntimeSizeReport,
  DEFAULT_RUNTIME_SIZE_THRESHOLD_POLICY,
  evaluateRuntimeSizeThresholdPolicy,
  loadRuntimeSizeThresholdPolicy,
  parseRuntimeSizeReportArgs,
  renderRuntimeSizeReport,
  writeRuntimeSizeEvidenceOutputs,
} from "../../scripts/runtime-size-report.mjs";

function writeFixtureFile(rootDir: string, relativePath: string, source: string) {
  const absolutePath = path.join(rootDir, ...relativePath.split("/"));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source);
}

describe("runtime size report script", () => {
  it("defaults to non-blocking reporting settings", () => {
    expect(parseRuntimeSizeReportArgs([])).toMatchObject({
      distDir: "dist",
      topAssets: 15,
      topDependencies: 20,
      policyPath: "docs/production-scale/runtime-size-threshold-policy.json",
      evidenceDir: "docs/production-scale/evidence",
      writeEvidence: true,
      check: false,
      json: false,
    });

    expect(parseRuntimeSizeReportArgs([
      "--json",
      "--dist-dir",
      "build",
      "--top-assets",
      "3",
      "--top-dependencies",
      "4",
    ])).toMatchObject({
      distDir: "build",
      topAssets: 3,
      topDependencies: 4,
      json: true,
    });

    expect(parseRuntimeSizeReportArgs([
      "--check",
      "--no-write-evidence",
      "--policy",
      "policy.json",
      "--evidence-dir",
      "out",
    ])).toMatchObject({
      check: true,
      writeEvidence: false,
      policyPath: "policy.json",
      explicitPolicyPath: true,
      evidenceDir: "out",
    });

    expect(() => parseRuntimeSizeReportArgs(["--top-assets", "0"])).toThrow(/between 1 and 100/i);
    expect(() => parseRuntimeSizeReportArgs(["--unknown"])).toThrow(/Unknown option/i);
  });

  it("reports build assets, compression sizes, dependencies, source usage, and Docker OCR packages", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-runtime-size-report-"));
    try {
      writeFixtureFile(rootDir, "package.json", JSON.stringify({
        type: "module",
        dependencies: {
          "pdf-parse": "1.1.4",
          "pdfjs-dist": "4.2.67",
          react: "19.2.1",
        },
        devDependencies: {},
      }, null, 2));
      writeFixtureFile(rootDir, "dist/_assets/app.js", "console.log('runtime report fixture');\n".repeat(200));
      writeFixtureFile(rootDir, "dist/_assets/app.css", ".app { color: #111; }\n".repeat(40));
      writeFixtureFile(rootDir, "node_modules/pdf-parse/index.js", "module.exports = function pdfParse() {};\n");
      writeFixtureFile(rootDir, "node_modules/pdfjs-dist/legacy/build/pdf.mjs", "export const pdfjsVersion = 'fixture';\n");
      writeFixtureFile(rootDir, "node_modules/react/index.js", "exports.version = 'fixture';\n".repeat(20));
      writeFixtureFile(rootDir, "helpers/pdfTextExtractor.tsx", "import pdfParse from 'pdf-parse';\nconst cli = 'pdftoppm tesseract';\n");
      writeFixtureFile(rootDir, "Dockerfile", [
        "FROM node:22-bookworm-slim",
        "RUN apt-get update && apt-get install -y --no-install-recommends \\",
        "  poppler-utils \\",
        "  tesseract-ocr \\",
        "  tesseract-ocr-eng",
      ].join("\n"));

      const report = collectRuntimeSizeReport({ rootDir, topAssets: 3, topDependencies: 3 });

      expect(report.safety).toMatchObject({
        reportingOnly: true,
        nonBlocking: true,
        changesDependencyVersions: false,
        changesBuildChunking: false,
        changesPdfOcrBehavior: false,
        changesDockerRuntimePackages: false,
        buildFailsOnThresholds: false,
      });
      expect(report.buildAssets.distPresent).toBe(true);
      expect(report.buildAssets.topAssets[0]).toMatchObject({
        path: "dist/_assets/app.js",
        extension: ".js",
      });
      expect(report.buildAssets.topAssets[0].gzipBytes).toBeGreaterThan(0);
      expect(report.buildAssets.topAssets[0].brotliBytes).toBeGreaterThan(0);

      const pdfParse = report.dependencies.pdfOcrDependencies.find((entry) => entry.name === "pdf-parse");
      expect(pdfParse).toMatchObject({
        declared: true,
        version: "1.1.4",
        group: "dependency",
      });
      expect(pdfParse?.installedBytes).toBeGreaterThan(0);
      expect(report.dockerRuntime.packages).toEqual([
        "poppler-utils",
        "tesseract-ocr",
        "tesseract-ocr-eng",
      ]);
      expect(report.thresholdPolicy.policyMode).toBe("warning-only");
      expect(report.thresholdEvaluation.overallStatus).toMatch(/PASS|WARN|WAIVED/);
      expect(report.thresholdEvaluation.hasBlockingFailures).toBe(false);
      expect(report.thresholdEvaluation.evaluations.map((entry) => entry.status)).toContain("WAIVED");
      expect(report.pdfOcrSourceUsage.usage.find((entry) => entry.token === "pdf-parse")?.fileCount).toBe(1);
      expect(report.pdfOcrSourceUsage.usage.find((entry) => entry.token === "tesseract")?.fileCount).toBe(1);

      const rendered = renderRuntimeSizeReport(report);
      expect(rendered).toContain("Threshold Policy");
      expect(rendered).toContain("Overall threshold status");
      expect(rendered).toContain("WAIVED");
      expect(rendered).toContain("Non-Blocking Threshold Recommendations");
      expect(rendered).toContain("Dependency version changes: no");
      expect(rendered).toContain("Docker runtime package changes: no");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("classifies synthetic threshold warnings without hard-failing warning-only policy", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-runtime-size-threshold-warning-"));
    try {
      writeFixtureFile(rootDir, "package.json", JSON.stringify({ type: "module", dependencies: {}, devDependencies: {} }));
      writeFixtureFile(rootDir, "dist/_assets/app.js", "x".repeat(120));
      const policy = {
        schemaVersion: 1,
        policyName: "fixture-warning-policy",
        policyMode: "warning-only",
        thresholds: [
          {
            id: "fixture-js-raw",
            area: "frontend-js",
            label: "Fixture JS raw size",
            metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
            warnBytes: 10,
            failBytes: 20,
            failOnExceed: false,
            recommendation: "fixture warning",
          },
        ],
      };

      const report = collectRuntimeSizeReport({ rootDir, policy });

      expect(report.thresholdEvaluation).toMatchObject({
        overallStatus: "WARN",
        hasBlockingFailures: false,
      });
      expect(report.thresholdEvaluation.evaluations[0]).toMatchObject({
        id: "fixture-js-raw",
        status: "WARN",
        measuredBytes: 120,
      });
      expect(report.thresholdEvaluation.evaluations[0].reason).toMatch(/warning-only/i);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("renders explicit waivers with reason", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-runtime-size-waiver-"));
    try {
      writeFixtureFile(rootDir, "package.json", JSON.stringify({ type: "module", dependencies: {}, devDependencies: {} }));
      writeFixtureFile(rootDir, "dist/_assets/app.js", "x".repeat(120));
      const policy = {
        schemaVersion: 1,
        policyName: "fixture-waiver-policy",
        policyMode: "warning-only",
        thresholds: [
          {
            id: "fixture-waived-js",
            area: "frontend-js",
            label: "Waived JS raw size",
            metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
            warnBytes: 10,
            failBytes: 20,
            failOnExceed: false,
            waiver: {
              accepted: true,
              reason: "Accepted for fixture release review only.",
            },
          },
        ],
      };

      const report = collectRuntimeSizeReport({ rootDir, policy });
      const rendered = renderRuntimeSizeReport(report);

      expect(report.thresholdEvaluation.overallStatus).toBe("WAIVED");
      expect(report.thresholdEvaluation.evaluations[0]).toMatchObject({
        status: "WAIVED",
        waiverReason: "Accepted for fixture release review only.",
      });
      expect(rendered).toContain("WAIVED");
      expect(rendered).toContain("Accepted for fixture release review only.");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("emits FAIL only when a hard-gate threshold is explicitly configured", () => {
    const baseReport = {
      buildAssets: {
        largestJsAsset: {
          path: "dist/_assets/app.js",
          rawBytes: 120,
        },
      },
      dependencies: {
        pdfOcrDependencies: [],
        largestInstalled: [],
      },
      dockerRuntime: {
        packages: [],
      },
    };
    const warningPolicy = {
      schemaVersion: 1,
      policyName: "fixture-warning-policy",
      policyMode: "warning-only",
      thresholds: [
        {
          id: "fixture-js-raw",
          area: "frontend-js",
          label: "Fixture JS raw size",
          metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
          warnBytes: 10,
          failBytes: 20,
          failOnExceed: false,
        },
      ],
    };
    const hardGatePolicy = {
      ...warningPolicy,
      policyName: "fixture-hard-gate-policy",
      policyMode: "hard-gate",
      thresholds: [
        {
          ...warningPolicy.thresholds[0],
          failOnExceed: true,
        },
      ],
    };

    expect(evaluateRuntimeSizeThresholdPolicy({ report: baseReport, policy: warningPolicy })).toMatchObject({
      overallStatus: "WARN",
      hasBlockingFailures: false,
    });
    expect(evaluateRuntimeSizeThresholdPolicy({ report: baseReport, policy: hardGatePolicy })).toMatchObject({
      overallStatus: "FAIL",
      hasBlockingFailures: true,
    });
  });

  it("writes visible runtime-size evidence outputs", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-runtime-size-evidence-"));
    try {
      writeFixtureFile(rootDir, "package.json", JSON.stringify({ type: "module", dependencies: {}, devDependencies: {} }));
      writeFixtureFile(rootDir, "dist/_assets/app.js", "console.log('ok');\n");
      const report = collectRuntimeSizeReport({
        rootDir,
        policy: {
          ...DEFAULT_RUNTIME_SIZE_THRESHOLD_POLICY,
          thresholds: [DEFAULT_RUNTIME_SIZE_THRESHOLD_POLICY.thresholds[0]],
        },
      });
      const outputs = writeRuntimeSizeEvidenceOutputs(report, rootDir, "evidence");

      expect(outputs).toEqual({
        markdownPath: "evidence/latest-runtime-size.md",
        jsonPath: "evidence/latest-runtime-size.json",
      });
      expect(readFileSync(path.join(rootDir, "evidence", "latest-runtime-size.md"), "utf8")).toContain("Runtime Size And Dependency Report");
      expect(JSON.parse(readFileSync(path.join(rootDir, "evidence", "latest-runtime-size.json"), "utf8"))).toMatchObject({
        report: "runtime-size-and-dependency-report",
      });
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("fails closed for malformed threshold policy configuration", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "crp-runtime-size-policy-"));
    try {
      writeFixtureFile(rootDir, "bad-policy.json", JSON.stringify({
        schemaVersion: 1,
        policyMode: "warning-only",
        thresholds: [
          {
            id: "bad",
            area: "frontend-js",
            label: "Bad",
            metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
            failOnExceed: false,
          },
        ],
      }));

      expect(() =>
        loadRuntimeSizeThresholdPolicy({
          rootDir,
          policyPath: "bad-policy.json",
          explicitPolicyPath: true,
        }),
      ).toThrow(/policy validation failed/i);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("exposes the package script without adding heavy analyzer dependencies", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["report:runtime-size"]).toBe("node scripts/runtime-size-report.mjs");
    expect(packageJson.scripts["check:runtime-size"]).toBe("node scripts/runtime-size-report.mjs --check");

    const allDeclaredPackages = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };
    expect(allDeclaredPackages).not.toHaveProperty("rollup-plugin-visualizer");
    expect(allDeclaredPackages).not.toHaveProperty("webpack-bundle-analyzer");
    expect(allDeclaredPackages).not.toHaveProperty("source-map-explorer");
    expect(packageJson.dependencies).toMatchObject({
      "pdf-parse": "1.1.4",
      "pdfjs-dist": "4.2.67",
      pdfmake: "0.2.21",
    });
  });
});
