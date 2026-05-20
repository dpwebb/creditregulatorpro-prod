import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const DEFAULT_BUILD_DIST_DIR = "dist";
export const DEFAULT_TOP_ASSET_COUNT = 15;
export const DEFAULT_TOP_DEPENDENCY_COUNT = 20;

export const PDF_OCR_RUNTIME_DEPENDENCIES = [
  "pdf-parse",
  "pdfjs-dist",
  "pdfmake",
  "pngjs",
  "jpeg-js",
];

export const PDF_FRONTEND_DEPENDENCIES = [
  "@react-pdf-viewer/core",
  "@react-pdf-viewer/default-layout",
  "@react-pdf-viewer/search",
];

export const DOCKER_OCR_PACKAGE_PATTERNS = [
  "apt-utils",
  "poppler-utils",
  "tesseract-ocr",
  "tesseract-ocr-eng",
];

export const NON_BLOCKING_THRESHOLD_RECOMMENDATIONS = [
  {
    area: "frontend-js",
    warning: "Review any single JS asset above 1.5 MiB raw or 500 KiB gzip.",
    critical: "Prioritize chunking or lazy-loading review above 3 MiB raw or 900 KiB gzip.",
  },
  {
    area: "frontend-css",
    warning: "Review any single CSS asset above 500 KiB raw or 100 KiB gzip.",
    critical: "Prioritize CSS ownership review above 1 MiB raw or 200 KiB gzip.",
  },
  {
    area: "runtime-dependency",
    warning: "Review direct runtime packages above 20 MiB installed size.",
    critical: "Plan dependency isolation or replacement evidence above 50 MiB installed size.",
  },
  {
    area: "docker-runtime",
    warning: "Record Poppler/Tesseract package changes whenever OCR/PDF runtime packages change.",
    critical: "Do not make runtime package changes without OCR/parser regression evidence.",
  },
];

const BUILD_ASSET_EXTENSIONS = new Set([".js", ".css", ".html", ".mjs"]);
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx", ".json", ".md", ".css", ".html"]);
const SOURCE_SCAN_ROOTS = ["helpers", "endpoints", "scripts", "pages", "components"];
const SOURCE_USAGE_IGNORED_PATHS = new Set([
  "scripts/runtime-size-report.mjs",
]);
const SOURCE_SCAN_TOKENS = [
  "pdf-parse",
  "pdfjs-dist",
  "pdfmake",
  "tesseract",
  "pdftoppm",
  "poppler",
  "deterministicOcr",
];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeReadFile(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function safeReadJson(filePath) {
  const source = safeReadFile(filePath);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function listFiles(rootDir, relativeRoot, {
  includeExtensions = TEXT_EXTENSIONS,
  skipDirectories = new Set([".git", "node_modules", "dist", "coverage", ".local"]),
} = {}) {
  const absoluteRoot = repoPath(rootDir, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];

  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRelativePath(path.relative(rootDir, absolutePath));
      if (entry.isDirectory()) {
        if (skipDirectories.has(entry.name)) continue;
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!includeExtensions.has(path.extname(entry.name))) continue;
      files.push(relativePath);
    }
  }
  return files.sort();
}

function safeCompressedSize(buffer, kind) {
  try {
    if (kind === "gzip") return gzipSync(buffer, { level: 9 }).length;
    if (kind === "brotli") {
      return brotliCompressSync(buffer, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        },
      }).length;
    }
  } catch {
    return null;
  }
  return null;
}

function safeFileSize(filePath) {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function sumDirectoryBytes(packageDir) {
  if (!existsSync(packageDir)) return null;

  let root;
  try {
    root = realpathSync(packageDir);
  } catch {
    return null;
  }

  let total = 0;
  const stack = [root];
  const seen = new Set([root]);

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if ([".git", "node_modules", "coverage"].includes(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
      if (relativePath.includes("../")) continue;

      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        let resolved;
        try {
          resolved = realpathSync(absolutePath);
        } catch {
          continue;
        }
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        stack.push(resolved);
        continue;
      }
      if (entry.isFile()) {
        total += safeFileSize(absolutePath);
      }
    }
  }

  return total;
}

function packageDir(rootDir, packageName) {
  return path.join(rootDir, "node_modules", ...packageName.split("/"));
}

function packageVersion(packageJson, packageName) {
  return packageJson?.dependencies?.[packageName] ??
    packageJson?.devDependencies?.[packageName] ??
    packageJson?.optionalDependencies?.[packageName] ??
    null;
}

function packageGroup(packageJson, packageName) {
  if (packageJson?.dependencies?.[packageName]) return "dependency";
  if (packageJson?.devDependencies?.[packageName]) return "devDependency";
  if (packageJson?.optionalDependencies?.[packageName]) return "optionalDependency";
  return "not-declared";
}

export function collectBuildAssetReport({
  rootDir = process.cwd(),
  distDir = DEFAULT_BUILD_DIST_DIR,
  topAssets = DEFAULT_TOP_ASSET_COUNT,
} = {}) {
  const absoluteDist = repoPath(rootDir, distDir);
  if (!existsSync(absoluteDist)) {
    return {
      distDir,
      distPresent: false,
      totalBytes: 0,
      assetCount: 0,
      topAssets: [],
      largestJsAsset: null,
      largestCssAsset: null,
    };
  }

  const assets = listFiles(rootDir, distDir, {
    includeExtensions: BUILD_ASSET_EXTENSIONS,
    skipDirectories: new Set(),
  })
    .map((relativePath) => {
      const absolutePath = repoPath(rootDir, relativePath);
      const buffer = readFileSync(absolutePath);
      return {
        path: relativePath,
        extension: path.extname(relativePath),
        rawBytes: buffer.length,
        gzipBytes: safeCompressedSize(buffer, "gzip"),
        brotliBytes: safeCompressedSize(buffer, "brotli"),
      };
    })
    .sort((a, b) => b.rawBytes - a.rawBytes);

  return {
    distDir,
    distPresent: true,
    totalBytes: assets.reduce((sum, asset) => sum + asset.rawBytes, 0),
    assetCount: assets.length,
    topAssets: assets.slice(0, topAssets),
    largestJsAsset: assets.find((asset) => asset.extension === ".js" || asset.extension === ".mjs") ?? null,
    largestCssAsset: assets.find((asset) => asset.extension === ".css") ?? null,
  };
}

export function collectDependencyReport({
  rootDir = process.cwd(),
  topDependencies = DEFAULT_TOP_DEPENDENCY_COUNT,
} = {}) {
  const packageJson = safeReadJson(repoPath(rootDir, "package.json")) ?? {};
  const runtimeNames = Object.keys(packageJson.dependencies ?? {});
  const devNames = Object.keys(packageJson.devDependencies ?? {});
  const allNames = Array.from(new Set([...runtimeNames, ...devNames])).sort();
  const nodeModulesPresent = existsSync(repoPath(rootDir, "node_modules"));

  const inventory = allNames.map((name) => ({
    name,
    version: packageVersion(packageJson, name),
    group: packageGroup(packageJson, name),
    installedBytes: nodeModulesPresent ? sumDirectoryBytes(packageDir(rootDir, name)) : null,
  }));

  const largestInstalled = inventory
    .filter((entry) => typeof entry.installedBytes === "number")
    .sort((a, b) => b.installedBytes - a.installedBytes)
    .slice(0, topDependencies);

  const focusedNames = Array.from(new Set([...PDF_OCR_RUNTIME_DEPENDENCIES, ...PDF_FRONTEND_DEPENDENCIES]));
  const pdfOcrDependencies = focusedNames.map((name) => ({
    name,
    version: packageVersion(packageJson, name),
    group: packageGroup(packageJson, name),
    declared: Boolean(packageVersion(packageJson, name)),
    installedBytes: nodeModulesPresent && existsSync(packageDir(rootDir, name))
      ? sumDirectoryBytes(packageDir(rootDir, name))
      : null,
  }));

  return {
    nodeModulesPresent,
    directRuntimeDependencyCount: runtimeNames.length,
    directDevDependencyCount: devNames.length,
    largestInstalled,
    pdfOcrDependencies,
  };
}

function extractDockerRuntimePackages(source) {
  const packages = new Set();
  for (const pattern of DOCKER_OCR_PACKAGE_PATTERNS) {
    const regex = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(source)) packages.add(pattern);
  }
  return Array.from(packages).sort();
}

function dockerRelevantLines(source) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({ lineNumber: index + 1, text: line.trim() }))
    .filter(({ text }) => /(apt-get install|apt-utils|poppler|tesseract|ocr|pdf)/i.test(text))
    .map(({ lineNumber, text }) => ({ lineNumber, text }));
}

export function collectDockerRuntimeReport({ rootDir = process.cwd() } = {}) {
  const dockerfiles = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^Dockerfile/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const reports = dockerfiles.map((fileName) => {
    const source = safeReadFile(repoPath(rootDir, fileName));
    return {
      path: fileName,
      packages: extractDockerRuntimePackages(source),
      relevantLines: dockerRelevantLines(source),
    };
  });

  return {
    dockerfileCount: reports.length,
    dockerfiles: reports,
    packages: Array.from(new Set(reports.flatMap((report) => report.packages))).sort(),
  };
}

export function collectPdfOcrSourceUsage({ rootDir = process.cwd() } = {}) {
  const files = SOURCE_SCAN_ROOTS
    .flatMap((scanRoot) => listFiles(rootDir, scanRoot))
    .filter((relativePath) => !SOURCE_USAGE_IGNORED_PATHS.has(relativePath));
  const usage = SOURCE_SCAN_TOKENS.map((token) => {
    const tokenRegex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matchingPaths = files.filter((relativePath) => tokenRegex.test(safeReadFile(repoPath(rootDir, relativePath))));
    return {
      token,
      fileCount: matchingPaths.length,
      samplePaths: matchingPaths.slice(0, 8),
    };
  });

  return {
    scannedRoots: SOURCE_SCAN_ROOTS,
    usage,
  };
}

export function collectRuntimeSizeReport({
  rootDir = process.cwd(),
  distDir = DEFAULT_BUILD_DIST_DIR,
  topAssets = DEFAULT_TOP_ASSET_COUNT,
  topDependencies = DEFAULT_TOP_DEPENDENCY_COUNT,
} = {}) {
  return {
    report: "runtime-size-and-dependency-report",
    script: "scripts/runtime-size-report.mjs",
    generatedAt: new Date().toISOString(),
    safety: {
      reportingOnly: true,
      nonBlocking: true,
      changesDependencyVersions: false,
      changesBuildChunking: false,
      changesPdfOcrBehavior: false,
      changesDockerRuntimePackages: false,
      buildFailsOnThresholds: false,
    },
    buildAssets: collectBuildAssetReport({ rootDir, distDir, topAssets }),
    dependencies: collectDependencyReport({ rootDir, topDependencies }),
    dockerRuntime: collectDockerRuntimeReport({ rootDir }),
    pdfOcrSourceUsage: collectPdfOcrSourceUsage({ rootDir }),
    thresholdRecommendations: NON_BLOCKING_THRESHOLD_RECOMMENDATIONS,
    knownRisks: [
      "The main Vite JS asset is large enough to need tracking before any production-at-scale claim.",
      "PDF/OCR packages and Docker OCR runtimes remain necessary for deterministic report extraction and should be inventoried before dependency or image changes.",
      "Thresholds are recommendations only until a later audited task explicitly turns them into build gates.",
    ],
  };
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "unavailable";
  if (!Number.isFinite(bytes)) return "unavailable";
  const mib = bytes / (1024 * 1024);
  if (mib >= 1) return `${mib.toFixed(2)} MiB`;
  const kib = bytes / 1024;
  if (kib >= 1) return `${kib.toFixed(1)} KiB`;
  return `${bytes} B`;
}

function renderAssetTable(assets) {
  if (assets.length === 0) return ["- No build assets found."];
  return [
    "| Asset | Raw | Gzip | Brotli |",
    "| --- | ---: | ---: | ---: |",
    ...assets.map((asset) =>
      `| \`${asset.path}\` | ${formatBytes(asset.rawBytes)} | ${formatBytes(asset.gzipBytes)} | ${formatBytes(asset.brotliBytes)} |`,
    ),
  ];
}

function renderDependencyTable(entries) {
  if (entries.length === 0) return ["- No installed direct dependencies found. Run `pnpm install` before using installed-size rows."];
  return [
    "| Package | Version | Group | Installed size |",
    "| --- | --- | --- | ---: |",
    ...entries.map((entry) =>
      `| \`${entry.name}\` | ${entry.version ?? "not declared"} | ${entry.group} | ${formatBytes(entry.installedBytes)} |`,
    ),
  ];
}

function renderDockerInventory(dockerRuntime) {
  if (dockerRuntime.dockerfiles.length === 0) return ["- No Dockerfile found."];
  const lines = [];
  for (const dockerfile of dockerRuntime.dockerfiles) {
    lines.push(`- \`${dockerfile.path}\`: ${dockerfile.packages.length > 0 ? dockerfile.packages.join(", ") : "no OCR/PDF runtime package match"}`);
    for (const relevantLine of dockerfile.relevantLines) {
      lines.push(`  - line ${relevantLine.lineNumber}: \`${relevantLine.text.replace(/\|/g, "\\|")}\``);
    }
  }
  return lines;
}

export function renderRuntimeSizeReport(report) {
  const lines = [
    "# Runtime Size And Dependency Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Script: \`${report.script}\``,
    "",
    "## Safety",
    "",
    "- Reporting only: yes",
    "- Non-blocking thresholds: yes",
    "- Dependency version changes: no",
    "- Vite chunking/build behavior changes: no",
    "- PDF/OCR behavior changes: no",
    "- Docker runtime package changes: no",
    "",
    "## Frontend Build Assets",
    "",
    report.buildAssets.distPresent
      ? `Build output: \`${report.buildAssets.distDir}\`, ${report.buildAssets.assetCount} tracked asset(s), ${formatBytes(report.buildAssets.totalBytes)} total raw size.`
      : `Build output \`${report.buildAssets.distDir}\` was not found. Run \`pnpm run build\` before collecting asset sizes.`,
    "",
    ...renderAssetTable(report.buildAssets.topAssets),
    "",
    "## Largest Installed Direct Dependencies",
    "",
    ...renderDependencyTable(report.dependencies.largestInstalled),
    "",
    "## PDF/OCR Dependency Inventory",
    "",
    ...renderDependencyTable(report.dependencies.pdfOcrDependencies.filter((entry) => entry.declared)),
    "",
    "## Source Usage Inventory",
    "",
    `Scanned roots: ${report.pdfOcrSourceUsage.scannedRoots.map((root) => `\`${root}\``).join(", ")}`,
    "",
    ...report.pdfOcrSourceUsage.usage.map((entry) =>
      `- \`${entry.token}\`: ${entry.fileCount} file(s)` +
        (entry.samplePaths.length > 0 ? `, examples: ${entry.samplePaths.map((sample) => `\`${sample}\``).join(", ")}` : ""),
    ),
    "",
    "## Docker OCR/Runtime Package Inventory",
    "",
    ...renderDockerInventory(report.dockerRuntime),
    "",
    "## Non-Blocking Threshold Recommendations",
    "",
    ...report.thresholdRecommendations.map((entry) =>
      `- ${entry.area}: Warning - ${entry.warning} Critical - ${entry.critical}`,
    ),
    "",
    "## Known Risks",
    "",
    ...report.knownRisks.map((risk) => `- ${risk}`),
  ];

  return `${lines.join("\n")}\n`;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`${flag} must be an integer between 1 and 100.`);
  }
  return parsed;
}

export function parseRuntimeSizeReportArgs(args) {
  const options = {
    rootDir: process.cwd(),
    distDir: DEFAULT_BUILD_DIST_DIR,
    topAssets: DEFAULT_TOP_ASSET_COUNT,
    topDependencies: DEFAULT_TOP_DEPENDENCY_COUNT,
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

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
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
    if (arg === "--top-assets") {
      options.topAssets = parsePositiveInteger(nextValue(), arg);
      continue;
    }
    if (arg === "--top-dependencies") {
      options.topDependencies = parsePositiveInteger(nextValue(), arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    "Usage: pnpm run report:runtime-size -- [options]",
    "",
    "Reports frontend build sizes, direct dependency installed sizes, PDF/OCR dependency inventory, and Docker OCR/runtime package inventory.",
    "The report is informational and does not fail on threshold recommendations.",
    "",
    "Options:",
    "  --json                         Print JSON instead of Markdown.",
    "  --root <path>                  Project root. Defaults to current working directory.",
    "  --dist-dir <path>              Build output directory. Defaults to dist.",
    "  --top-assets <1-100>           Number of build assets to display. Defaults to 15.",
    "  --top-dependencies <1-100>     Number of installed direct dependencies to display. Defaults to 20.",
  ].join("\n"));
}

async function main() {
  const options = parseRuntimeSizeReportArgs(process.argv.slice(2));
  const report = collectRuntimeSizeReport(options);
  console.log(options.json ? JSON.stringify(report, null, 2) : renderRuntimeSizeReport(report));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
