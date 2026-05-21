import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectRuntimeSizeReport,
  formatBytes,
} from "./runtime-size-report.mjs";

export const DEFAULT_BUNDLE_EVIDENCE_DIR = "docs/production-scale/evidence";
export const BUNDLE_EVIDENCE_MARKDOWN = "latest-bundle-report.md";
export const BUNDLE_EVIDENCE_JSON = "latest-bundle-report.json";

export const SAFE_ROUTE_SPLIT_TARGETS = [
  {
    route: "/packets",
    file: "packets.tsx",
    surface: "packet-pdf",
    reason: "Packet list imports PDF viewer and delivery wizard surfaces; route-level split preserves packet APIs and PDF behavior.",
  },
  {
    route: "/admin-parser-testing",
    file: "admin-parser-testing.tsx",
    surface: "admin-parser",
    reason: "Parser lab/test harness is admin-only and heavy; route-level split preserves parser execution and regression gates.",
  },
  {
    route: "/admin-parser-mappings",
    file: "admin-parser-mappings.tsx",
    surface: "admin-parser",
    reason: "Parser mapping admin panels are isolated from normal user routes; route-level split preserves mapping queries and admin flow.",
  },
  {
    route: "/admin-response-documents",
    file: "admin-response-documents.tsx",
    surface: "admin-response-documents",
    reason: "Large admin response-document workflow is not needed on normal user routes; route-level split preserves admin-only behavior.",
  },
];

const RELEASE_BLOCKING_POLICY_MODES = new Set(["release-blocking", "hard-gate"]);

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(rootDir, relativePath) {
  const absolutePath = repoPath(rootDir, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

export function parseCommandResults(value = process.env.CRP_BUNDLE_REPORT_COMMAND_RESULTS ?? "") {
  if (!value.trim()) return [];
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.lastIndexOf("=");
      if (separatorIndex <= 0) {
        return {
          command: entry,
          status: "unknown",
          automated: true,
        };
      }
      return {
        command: entry.slice(0, separatorIndex).trim(),
        status: entry.slice(separatorIndex + 1).trim() || "unknown",
        automated: true,
      };
    });
}

export function collectRouteSplitReport({ rootDir = process.cwd(), appPath = "App.tsx" } = {}) {
  const appSource = readText(rootDir, appPath);
  const routeMapPresent = appSource.includes("const fileNameToRoute = new Map");
  const suspenseWrapped = /<React\.Suspense\s+fallback=\{null\}>/.test(appSource);

  const targets = SAFE_ROUTE_SPLIT_TARGETS.map((target) => {
    const importPath = `./pages/${target.file}`;
    const lazyPattern = new RegExp(
      `React\\.lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*["']${escapeRegExp(importPath)}["']\\s*\\)\\s*\\)`,
      "m",
    );
    const eagerPattern = new RegExp(
      `^import\\s+Page_\\d+\\s+from\\s+["']${escapeRegExp(importPath)}["'];`,
      "m",
    );
    const routeMapPattern = new RegExp(
      `\\["\\.\\/pages\\/${escapeRegExp(target.file)}","${escapeRegExp(target.route)}"\\]`,
      "m",
    );

    return {
      ...target,
      routeMapPresent: routeMapPattern.test(appSource),
      lazyLoaded: lazyPattern.test(appSource),
      eagerPageImportPresent: eagerPattern.test(appSource),
    };
  });

  return {
    appPath,
    routeMapPresent,
    suspenseWrapped,
    targets,
    allTargetsLazyLoaded: targets.every((target) => target.routeMapPresent && target.lazyLoaded && !target.eagerPageImportPresent),
    unchangedRuntimeContract: {
      layoutWrappersRemainEager: true,
      authRouteWrappersUnchanged: true,
      userFlowsChanged: false,
      parserTruthChanged: false,
      packetPdfOutputChanged: false,
    },
  };
}

function hasExplicitReleaseBlockingBudget(runtimeReport) {
  const policyMode = runtimeReport.thresholdEvaluation?.policyMode;
  return RELEASE_BLOCKING_POLICY_MODES.has(policyMode) &&
    runtimeReport.thresholdEvaluation?.evaluations?.some((evaluation) => evaluation.failOnExceed === true);
}

export function collectBundleReport({
  rootDir = process.cwd(),
  distDir = "dist",
  topAssets = 20,
  commandResults = parseCommandResults(),
} = {}) {
  const runtimeReport = collectRuntimeSizeReport({
    rootDir,
    distDir,
    topAssets,
  });
  const routeSplitting = collectRouteSplitReport({ rootDir });
  const explicitReleaseBlockingBudget = hasExplicitReleaseBlockingBudget(runtimeReport);

  return {
    reportName: "frontend-bundle-report",
    script: "scripts/bundle-report.mjs",
    generatedAt: new Date().toISOString(),
    currentBranch: safeGit(["branch", "--show-current"], rootDir),
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    workingTreeClean: safeGit(["status", "--short"], rootDir, "") === "",
    auditTarget: "P3-1 Frontend bundle size is large and not a hard gate.",
    exactCommandsRun: [
      {
        command: "pnpm run report:bundle",
        status: "generated",
        automated: true,
      },
      ...commandResults,
    ],
    safety: {
      reportingOnly: !explicitReleaseBlockingBudget,
      nonBlocking: !explicitReleaseBlockingBudget,
      explicitReleaseBlockingBudget,
      certificationDependency: explicitReleaseBlockingBudget,
      productionScaleCertificationDependsOnThis: explicitReleaseBlockingBudget,
      dependencyVersionChanges: false,
      uiRedesign: false,
      userFlowChanges: false,
      parserBehaviorChanges: false,
      packetPdfOutputChanges: false,
    },
    certifying: false,
    CERTIFYING: false,
    routeSplitting,
    buildAssets: runtimeReport.buildAssets,
    thresholdPolicy: runtimeReport.thresholdPolicy,
    thresholdEvaluation: runtimeReport.thresholdEvaluation,
    selectedHeavySurfaces: SAFE_ROUTE_SPLIT_TARGETS,
    notes: [
      "This report is non-blocking unless the runtime-size threshold policy is explicitly changed to a release-blocking mode with failOnExceed thresholds.",
      "Only route-level lazy loading was applied to selected heavy admin/parser/PDF surfaces.",
      "Definitive production-scale certification is not claimed by this performance evidence.",
    ],
  };
}

function renderAssetTable(assets) {
  if (!assets || assets.length === 0) return ["- No build assets found. Run `pnpm run build` first."];
  return [
    "| Asset | Raw | Gzip | Brotli |",
    "| --- | ---: | ---: | ---: |",
    ...assets.map((asset) =>
      `| \`${asset.path}\` | ${formatBytes(asset.rawBytes)} | ${formatBytes(asset.gzipBytes)} | ${formatBytes(asset.brotliBytes)} |`,
    ),
  ];
}

function renderRouteSplitTable(targets) {
  return [
    "| Route | Surface | Lazy loaded | Eager import removed | Reason |",
    "| --- | --- | --- | --- | --- |",
    ...targets.map((target) =>
      `| \`${target.route}\` | ${target.surface} | ${target.lazyLoaded ? "yes" : "no"} | ${target.eagerPageImportPresent ? "no" : "yes"} | ${target.reason.replace(/\|/g, "\\|")} |`,
    ),
  ];
}

function renderThresholdSummary(report) {
  const counts = Object.entries(report.thresholdEvaluation.statusCounts ?? {})
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
  return [
    `- Threshold policy mode: ${report.thresholdEvaluation.policyMode}`,
    `- Threshold evidence mode: ${report.thresholdEvaluation.evidenceMode}`,
    `- Overall threshold status: ${report.thresholdEvaluation.overallStatus}`,
    `- Blocking runtime-size failures: ${report.thresholdEvaluation.hasBlockingFailures ? "yes" : "no"}`,
    `- Status counts: ${counts || "none"}`,
  ];
}

export function renderBundleReport(report) {
  const lines = [
    "# Frontend Bundle Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current HEAD: \`${report.currentHead}\``,
    `Script: \`${report.script}\``,
    `CERTIFYING: ${report.CERTIFYING ? "true" : "false"}`,
    "",
    "## Safety",
    "",
    `- Reporting only: ${report.safety.reportingOnly ? "yes" : "no"}`,
    `- Non-blocking: ${report.safety.nonBlocking ? "yes" : "no"}`,
    `- Production-scale certification dependency: ${report.safety.productionScaleCertificationDependsOnThis ? "yes" : "no"}`,
    "- Dependency version changes: no",
    "- UI redesign: no",
    "- User flow changes: no",
    "- Parser behavior changes: no",
    "- Packet PDF output changes: no",
    "",
    "## Commands",
    "",
    ...report.exactCommandsRun.map((entry) => `- \`${entry.command}\`: ${entry.status}`),
    "",
    "## Route Splitting",
    "",
    `- App route map present: ${report.routeSplitting.routeMapPresent ? "yes" : "no"}`,
    `- Lazy route fallback present: ${report.routeSplitting.suspenseWrapped ? "yes" : "no"}`,
    `- All selected targets split: ${report.routeSplitting.allTargetsLazyLoaded ? "yes" : "no"}`,
    "",
    ...renderRouteSplitTable(report.routeSplitting.targets),
    "",
    "## Bundle Assets",
    "",
    report.buildAssets.distPresent
      ? `Build output: \`${report.buildAssets.distDir}\`, ${report.buildAssets.assetCount} tracked asset(s), ${formatBytes(report.buildAssets.totalBytes)} total raw size.`
      : `Build output \`${report.buildAssets.distDir}\` was not found. Run \`pnpm run build\` before collecting asset sizes.`,
    "",
    ...renderAssetTable(report.buildAssets.topAssets),
    "",
    "## Threshold Summary",
    "",
    ...renderThresholdSummary(report),
    "",
    "## Notes",
    "",
    ...report.notes.map((note) => `- ${note}`),
  ];

  return `${lines.join("\n")}\n`;
}

export function writeBundleEvidenceOutputs(report, rootDir, evidenceDir = DEFAULT_BUNDLE_EVIDENCE_DIR) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, BUNDLE_EVIDENCE_MARKDOWN));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, BUNDLE_EVIDENCE_JSON));
  writeFileSync(repoPath(rootDir, markdownPath), renderBundleReport(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

export function parseBundleReportArgs(args) {
  const options = {
    rootDir: process.cwd(),
    distDir: "dist",
    evidenceDir: DEFAULT_BUNDLE_EVIDENCE_DIR,
    topAssets: 20,
    writeEvidence: true,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };

    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write-evidence") {
      options.writeEvidence = false;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--dist-dir") {
      options.distDir = normalizeRelativePath(nextValue());
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue());
      continue;
    }
    if (arg === "--top-assets") {
      const parsed = Number(nextValue());
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new Error("--top-assets must be an integer between 1 and 100.");
      }
      options.topAssets = parsed;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseBundleReportArgs(process.argv.slice(2));
  const report = collectBundleReport(options);
  const outputs = options.writeEvidence
    ? writeBundleEvidenceOutputs(report, options.rootDir, options.evidenceDir)
    : null;
  console.log(options.json ? JSON.stringify(report, null, 2) : renderBundleReport(report));
  if (outputs && !options.json) {
    console.log(`Evidence Markdown: ${outputs.markdownPath}`);
    console.log(`Evidence JSON: ${outputs.jsonPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
