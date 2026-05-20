import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  collectRuntimeSizeReport,
  parseRuntimeSizeReportArgs,
  renderRuntimeSizeReport,
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
      expect(report.pdfOcrSourceUsage.usage.find((entry) => entry.token === "pdf-parse")?.fileCount).toBe(1);
      expect(report.pdfOcrSourceUsage.usage.find((entry) => entry.token === "tesseract")?.fileCount).toBe(1);

      const rendered = renderRuntimeSizeReport(report);
      expect(rendered).toContain("Non-Blocking Threshold Recommendations");
      expect(rendered).toContain("Dependency version changes: no");
      expect(rendered).toContain("Docker runtime package changes: no");
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("exposes the package script without adding heavy analyzer dependencies", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.scripts["report:runtime-size"]).toBe("node scripts/runtime-size-report.mjs");

    const allDeclaredPackages = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    };
    expect(allDeclaredPackages).not.toHaveProperty("rollup-plugin-visualizer");
    expect(allDeclaredPackages).not.toHaveProperty("webpack-bundle-analyzer");
    expect(allDeclaredPackages).not.toHaveProperty("source-map-explorer");
  });
});
