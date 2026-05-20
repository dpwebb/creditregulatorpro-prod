import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const DEFAULT_BUILD_DIST_DIR = "dist";
export const DEFAULT_TOP_ASSET_COUNT = 15;
export const DEFAULT_TOP_DEPENDENCY_COUNT = 20;
export const DEFAULT_RUNTIME_SIZE_POLICY_PATH = "docs/production-scale/runtime-size-threshold-policy.json";
export const DEFAULT_RUNTIME_SIZE_EVIDENCE_DIR = "docs/production-scale/evidence";
export const RUNTIME_SIZE_EVIDENCE_MARKDOWN = "latest-runtime-size.md";
export const RUNTIME_SIZE_EVIDENCE_JSON = "latest-runtime-size.json";

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

export const DEFAULT_RUNTIME_SIZE_THRESHOLD_POLICY = {
  schemaVersion: 1,
  policyName: "runtime-size-and-heavy-dependency-threshold-policy",
  policyMode: "warning-only",
  evidenceMode: "reporting-only",
  statusValues: ["PASS", "WARN", "FAIL", "WAIVED"],
  semantics: {
    pass: "Metric is present and at or below the warning threshold.",
    warn: "Metric exceeds the warning threshold, or source-only reporting cannot measure a configured runtime size. WARN is visible evidence but not a hard gate.",
    fail: "Only emitted when policyMode is hard-gate and a threshold explicitly enables failOnExceed.",
    waived: "A threshold is exceeded or not directly measurable, but an explicit waiver reason is present.",
  },
  thresholds: [
    {
      id: "main-js-raw",
      area: "frontend-js",
      label: "Largest JavaScript asset raw size",
      metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
      warnBytes: 1_572_864,
      failBytes: 3_145_728,
      failOnExceed: false,
      recommendation: "Review route-level chunking or lazy-loading in a separate audited task before any production-scale claim.",
    },
    {
      id: "main-js-gzip",
      area: "frontend-js",
      label: "Largest JavaScript asset gzip size",
      metric: { kind: "largestBuildAsset", assetType: "js", field: "gzipBytes" },
      warnBytes: 512_000,
      failBytes: 921_600,
      failOnExceed: false,
      recommendation: "Track gzip size as release evidence; do not refactor chunks in this reporting task.",
    },
    {
      id: "main-css-raw",
      area: "frontend-css",
      label: "Largest CSS asset raw size",
      metric: { kind: "largestBuildAsset", assetType: "css", field: "rawBytes" },
      warnBytes: 512_000,
      failBytes: 1_048_576,
      failOnExceed: false,
      recommendation: "Review CSS ownership and unused rules in a separate UI regression task.",
    },
    {
      id: "main-css-gzip",
      area: "frontend-css",
      label: "Largest CSS asset gzip size",
      metric: { kind: "largestBuildAsset", assetType: "css", field: "gzipBytes" },
      warnBytes: 102_400,
      failBytes: 204_800,
      failOnExceed: false,
      recommendation: "Track compressed CSS size without changing build behavior.",
    },
    {
      id: "dependency-pdfjs-dist",
      area: "runtime-dependency",
      label: "pdfjs-dist installed size",
      metric: { kind: "dependencyInstalledSize", packageName: "pdfjs-dist" },
      warnBytes: 20_971_520,
      failBytes: 52_428_800,
      failOnExceed: false,
      recommendation: "Keep pdfjs-dist risk visible; replacement or isolation requires OCR/PDF regression evidence.",
    },
    {
      id: "dependency-pdf-parse",
      area: "runtime-dependency",
      label: "pdf-parse installed size",
      metric: { kind: "dependencyInstalledSize", packageName: "pdf-parse" },
      warnBytes: 20_971_520,
      failBytes: 52_428_800,
      failOnExceed: false,
      recommendation: "Keep pdf-parse risk visible; do not replace without deterministic parser regression evidence.",
    },
    {
      id: "dependency-pdfmake",
      area: "runtime-dependency",
      label: "pdfmake installed size",
      metric: { kind: "dependencyInstalledSize", packageName: "pdfmake" },
      warnBytes: 10_485_760,
      failBytes: 31_457_280,
      failOnExceed: false,
      recommendation: "Keep packet PDF generation dependency risk visible without changing packet output.",
    },
    {
      id: "docker-ocr-runtime-inventory",
      area: "docker-runtime",
      label: "Docker OCR/PDF runtime package inventory",
      metric: { kind: "dockerOcrRuntimePackageInventory" },
      failOnExceed: false,
      waiver: {
        accepted: true,
        reason: "Docker package byte sizes are not measurable from this source-only report; Poppler/Tesseract package names are inventoried and any future package change requires OCR/parser regression evidence.",
      },
      recommendation: "Treat Docker OCR package changes as review-required; this task does not change Docker packages.",
    },
  ],
};

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

function clonePolicy(policy) {
  return JSON.parse(JSON.stringify(policy));
}

function validateRuntimeSizeThresholdPolicy(policy, source = "policy") {
  const errors = [];
  if (!policy || typeof policy !== "object") errors.push(`${source} must be a JSON object.`);
  if (policy && policy.schemaVersion !== 1) errors.push(`${source} schemaVersion must be 1.`);
  if (policy && !["warning-only", "hard-gate"].includes(policy.policyMode)) {
    errors.push(`${source} policyMode must be warning-only or hard-gate.`);
  }
  if (!Array.isArray(policy?.thresholds) || policy.thresholds.length === 0) {
    errors.push(`${source} must include at least one threshold.`);
  }

  const ids = new Set();
  for (const threshold of policy?.thresholds ?? []) {
    if (!threshold?.id) {
      errors.push(`${source} contains a threshold without an id.`);
      continue;
    }
    if (ids.has(threshold.id)) errors.push(`${source} contains duplicate threshold id ${threshold.id}.`);
    ids.add(threshold.id);
    if (!threshold.area) errors.push(`${threshold.id} is missing area.`);
    if (!threshold.label) errors.push(`${threshold.id} is missing label.`);
    if (!threshold.metric || typeof threshold.metric !== "object") {
      errors.push(`${threshold.id} is missing metric.`);
      continue;
    }
    if (!["largestBuildAsset", "dependencyInstalledSize", "dockerOcrRuntimePackageInventory"].includes(threshold.metric.kind)) {
      errors.push(`${threshold.id} has unsupported metric kind ${threshold.metric.kind}.`);
    }
    if (threshold.metric.kind === "largestBuildAsset") {
      if (!["js", "css"].includes(threshold.metric.assetType)) {
        errors.push(`${threshold.id} largestBuildAsset metric must target js or css.`);
      }
      if (!["rawBytes", "gzipBytes"].includes(threshold.metric.field)) {
        errors.push(`${threshold.id} largestBuildAsset metric must target rawBytes or gzipBytes.`);
      }
    }
    if (threshold.metric.kind === "dependencyInstalledSize" && !threshold.metric.packageName) {
      errors.push(`${threshold.id} dependencyInstalledSize metric must include packageName.`);
    }
    if (threshold.metric.kind !== "dockerOcrRuntimePackageInventory") {
      if (!Number.isFinite(threshold.warnBytes) || threshold.warnBytes <= 0) {
        errors.push(`${threshold.id} must include a positive warnBytes value.`);
      }
      if (threshold.failBytes !== undefined && (!Number.isFinite(threshold.failBytes) || threshold.failBytes <= 0)) {
        errors.push(`${threshold.id} failBytes must be positive when present.`);
      }
    }
    if (threshold.waiver?.accepted === true && !String(threshold.waiver.reason ?? "").trim()) {
      errors.push(`${threshold.id} waiver must include a reason.`);
    }
    if (threshold.failOnExceed === true && policy.policyMode !== "hard-gate") {
      errors.push(`${threshold.id} cannot enable failOnExceed unless policyMode is hard-gate.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function loadRuntimeSizeThresholdPolicy({
  rootDir = process.cwd(),
  policyPath = DEFAULT_RUNTIME_SIZE_POLICY_PATH,
  explicitPolicyPath = false,
} = {}) {
  const absolutePolicyPath = repoPath(rootDir, policyPath);
  const filePolicy = existsSync(absolutePolicyPath) ? safeReadJson(absolutePolicyPath) : null;
  if (!filePolicy && explicitPolicyPath) {
    throw new Error(`Runtime-size threshold policy not found: ${policyPath}`);
  }

  const policy = filePolicy ?? clonePolicy(DEFAULT_RUNTIME_SIZE_THRESHOLD_POLICY);
  const validation = validateRuntimeSizeThresholdPolicy(policy, filePolicy ? policyPath : "built-in default policy");
  if (!validation.valid) {
    throw new Error(`Runtime-size threshold policy validation failed:\n${validation.errors.join("\n")}`);
  }
  return {
    ...policy,
    source: filePolicy ? policyPath : "built-in-default",
  };
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

function findDependencyMetric(report, packageName) {
  return [
    ...(report.dependencies?.pdfOcrDependencies ?? []),
    ...(report.dependencies?.largestInstalled ?? []),
  ].find((entry) => entry.name === packageName) ?? null;
}

function resolveThresholdMetric(report, threshold) {
  const metric = threshold.metric;
  if (metric.kind === "largestBuildAsset") {
    const asset = metric.assetType === "js"
      ? report.buildAssets?.largestJsAsset
      : report.buildAssets?.largestCssAsset;
    return {
      available: typeof asset?.[metric.field] === "number",
      bytes: typeof asset?.[metric.field] === "number" ? asset[metric.field] : null,
      source: asset?.path ?? null,
      detail: asset ? `${asset.path} ${metric.field}` : `No ${metric.assetType.toUpperCase()} build asset found.`,
    };
  }
  if (metric.kind === "dependencyInstalledSize") {
    const dependency = findDependencyMetric(report, metric.packageName);
    return {
      available: typeof dependency?.installedBytes === "number",
      bytes: typeof dependency?.installedBytes === "number" ? dependency.installedBytes : null,
      source: metric.packageName,
      detail: dependency
        ? `${metric.packageName} ${dependency.group} ${dependency.version ?? "not declared"}`
        : `${metric.packageName} not declared or not installed.`,
    };
  }
  if (metric.kind === "dockerOcrRuntimePackageInventory") {
    const packages = report.dockerRuntime?.packages ?? [];
    return {
      available: packages.length > 0,
      bytes: null,
      source: "Dockerfile",
      detail: packages.length > 0
        ? `Inventoried packages: ${packages.join(", ")}. Byte size is not measurable from Dockerfile source.`
        : "No configured Docker OCR/PDF packages were found.",
      packages,
    };
  }
  return {
    available: false,
    bytes: null,
    source: null,
    detail: `Unsupported metric kind ${metric.kind}.`,
  };
}

function classifyByteThreshold({ metricValue, threshold, policy }) {
  if (threshold.waiver?.accepted === true) {
    return {
      status: "WAIVED",
      breached: metricValue.bytes !== null && metricValue.bytes > (threshold.warnBytes ?? Number.POSITIVE_INFINITY),
      reason: threshold.waiver.reason,
    };
  }
  if (!metricValue.available || metricValue.bytes === null) {
    return {
      status: "WARN",
      breached: false,
      reason: "Metric is unavailable; run `pnpm run build` and install dependencies before collecting complete runtime-size evidence.",
    };
  }
  if (
    policy.policyMode === "hard-gate" &&
    threshold.failOnExceed === true &&
    Number.isFinite(threshold.failBytes) &&
    metricValue.bytes > threshold.failBytes
  ) {
    return {
      status: "FAIL",
      breached: true,
      reason: `Metric exceeds explicit hard-gate fail threshold ${threshold.failBytes} bytes.`,
    };
  }
  if (Number.isFinite(threshold.warnBytes) && metricValue.bytes > threshold.warnBytes) {
    const failExceeded = Number.isFinite(threshold.failBytes) && metricValue.bytes > threshold.failBytes;
    return {
      status: "WARN",
      breached: true,
      reason: failExceeded
        ? "Metric exceeds the configured failBytes value, but this policy is warning-only for this threshold."
        : "Metric exceeds the configured warning threshold.",
    };
  }
  return {
    status: "PASS",
    breached: false,
    reason: "Metric is at or below the configured warning threshold.",
  };
}

function classifyDockerThreshold({ metricValue, threshold }) {
  if (threshold.waiver?.accepted === true) {
    return {
      status: "WAIVED",
      breached: metricValue.packages?.length > 0,
      reason: threshold.waiver.reason,
    };
  }
  if (metricValue.packages?.length > 0) {
    return {
      status: "WARN",
      breached: true,
      reason: "Docker OCR/PDF runtime package byte size is not measurable from source-only reporting; package names are inventoried.",
    };
  }
  return {
    status: "PASS",
    breached: false,
    reason: "No Docker OCR/PDF runtime packages were detected.",
  };
}

function countStatuses(items) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});
}

function overallThresholdStatus(items) {
  if (items.some((item) => item.status === "FAIL")) return "FAIL";
  if (items.some((item) => item.status === "WARN")) return "WARN";
  if (items.some((item) => item.status === "WAIVED")) return "WAIVED";
  return "PASS";
}

export function evaluateRuntimeSizeThresholdPolicy({ report, policy }) {
  const evaluations = policy.thresholds.map((threshold) => {
    const metricValue = resolveThresholdMetric(report, threshold);
    const classification = threshold.metric.kind === "dockerOcrRuntimePackageInventory"
      ? classifyDockerThreshold({ metricValue, threshold, policy })
      : classifyByteThreshold({ metricValue, threshold, policy });
    return {
      id: threshold.id,
      area: threshold.area,
      label: threshold.label,
      status: classification.status,
      metric: threshold.metric,
      measuredBytes: metricValue.bytes,
      measuredValueAvailable: metricValue.available,
      source: metricValue.source,
      detail: metricValue.detail,
      warnBytes: threshold.warnBytes ?? null,
      failBytes: threshold.failBytes ?? null,
      failOnExceed: threshold.failOnExceed === true,
      waiverReason: threshold.waiver?.accepted === true ? threshold.waiver.reason : null,
      breached: classification.breached,
      reason: classification.reason,
      recommendation: threshold.recommendation ?? null,
    };
  });

  return {
    policyName: policy.policyName,
    policySource: policy.source ?? "inline",
    policyMode: policy.policyMode,
    evidenceMode: policy.evidenceMode ?? "reporting-only",
    overallStatus: overallThresholdStatus(evaluations),
    hasBlockingFailures: evaluations.some((evaluation) => evaluation.status === "FAIL"),
    statusCounts: countStatuses(evaluations),
    evaluations,
  };
}

export function collectRuntimeSizeReport({
  rootDir = process.cwd(),
  distDir = DEFAULT_BUILD_DIST_DIR,
  topAssets = DEFAULT_TOP_ASSET_COUNT,
  topDependencies = DEFAULT_TOP_DEPENDENCY_COUNT,
  policy = null,
  policyPath = DEFAULT_RUNTIME_SIZE_POLICY_PATH,
  explicitPolicyPath = false,
} = {}) {
  const baseReport = {
    report: "runtime-size-and-dependency-report",
    script: "scripts/runtime-size-report.mjs",
    generatedAt: new Date().toISOString(),
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    workingTreeClean: safeGit(["status", "--short"], rootDir, "") === "",
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
  const thresholdPolicy = policy ?? loadRuntimeSizeThresholdPolicy({ rootDir, policyPath, explicitPolicyPath });
  return {
    ...baseReport,
    thresholdPolicy: {
      schemaVersion: thresholdPolicy.schemaVersion,
      policyName: thresholdPolicy.policyName,
      source: thresholdPolicy.source ?? "inline",
      policyMode: thresholdPolicy.policyMode,
      evidenceMode: thresholdPolicy.evidenceMode ?? "reporting-only",
      statusValues: thresholdPolicy.statusValues ?? ["PASS", "WARN", "FAIL", "WAIVED"],
      semantics: thresholdPolicy.semantics ?? {},
    },
    thresholdEvaluation: evaluateRuntimeSizeThresholdPolicy({ report: baseReport, policy: thresholdPolicy }),
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

function renderThresholdPolicyTable(evaluations) {
  if (!evaluations || evaluations.length === 0) return ["- No runtime-size threshold evaluations found."];
  return [
    "| Status | Policy row | Measured | Warning | Fail | Waiver / reason |",
    "| --- | --- | ---: | ---: | ---: | --- |",
    ...evaluations.map((evaluation) => {
      const measured = evaluation.measuredBytes === null
        ? (evaluation.measuredValueAvailable ? "not byte-measured" : "unavailable")
        : formatBytes(evaluation.measuredBytes);
      const reason = evaluation.waiverReason ?? evaluation.reason;
      return `| ${evaluation.status} | \`${evaluation.id}\` ${evaluation.label} | ${measured} | ${formatBytes(evaluation.warnBytes)} | ${evaluation.failOnExceed ? formatBytes(evaluation.failBytes) : "disabled"} | ${String(reason ?? "").replace(/\|/g, "\\|")} |`;
    }),
  ];
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
    `- Threshold policy mode: ${report.thresholdEvaluation.policyMode}`,
    `- Overall threshold status: ${report.thresholdEvaluation.overallStatus}`,
    `- Blocking runtime-size failures: ${report.thresholdEvaluation.hasBlockingFailures ? "yes" : "no"}`,
    "- Dependency version changes: no",
    "- Vite chunking/build behavior changes: no",
    "- PDF/OCR behavior changes: no",
    "- Docker runtime package changes: no",
    "- FAIL is emitted only when an explicit hard-gate policy enables it.",
    "",
    "## Threshold Policy",
    "",
    `Policy source: \`${report.thresholdEvaluation.policySource}\``,
    `Policy mode: \`${report.thresholdEvaluation.policyMode}\``,
    `Evidence mode: \`${report.thresholdEvaluation.evidenceMode}\``,
    `Status counts: ${Object.entries(report.thresholdEvaluation.statusCounts).map(([status, count]) => `${status}=${count}`).join(", ")}`,
    "",
    ...renderThresholdPolicyTable(report.thresholdEvaluation.evaluations),
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
    policyPath: DEFAULT_RUNTIME_SIZE_POLICY_PATH,
    explicitPolicyPath: false,
    evidenceDir: DEFAULT_RUNTIME_SIZE_EVIDENCE_DIR,
    writeEvidence: true,
    check: false,
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
    if (arg === "--check") {
      options.check = true;
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
    if (arg === "--policy") {
      options.policyPath = normalizeRelativePath(nextValue());
      options.explicitPolicyPath = true;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue());
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
    "  --check                        Exit non-zero only for explicit hard-gate FAIL rows.",
    "  --no-write-evidence            Do not write latest-runtime-size evidence files.",
    "  --root <path>                  Project root. Defaults to current working directory.",
    "  --policy <path>                Threshold policy JSON. Defaults to docs/production-scale/runtime-size-threshold-policy.json.",
    "  --evidence-dir <path>          Evidence output directory. Defaults to docs/production-scale/evidence.",
    "  --dist-dir <path>              Build output directory. Defaults to dist.",
    "  --top-assets <1-100>           Number of build assets to display. Defaults to 15.",
    "  --top-dependencies <1-100>     Number of installed direct dependencies to display. Defaults to 20.",
  ].join("\n"));
}

export function writeRuntimeSizeEvidenceOutputs(report, rootDir, evidenceDir = DEFAULT_RUNTIME_SIZE_EVIDENCE_DIR) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, RUNTIME_SIZE_EVIDENCE_MARKDOWN));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, RUNTIME_SIZE_EVIDENCE_JSON));
  writeFileSync(repoPath(rootDir, markdownPath), renderRuntimeSizeReport(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

async function main() {
  const options = parseRuntimeSizeReportArgs(process.argv.slice(2));
  const report = collectRuntimeSizeReport(options);
  const outputs = options.writeEvidence
    ? writeRuntimeSizeEvidenceOutputs(report, options.rootDir, options.evidenceDir)
    : null;
  console.log(options.json ? JSON.stringify(report, null, 2) : renderRuntimeSizeReport(report));
  if (outputs && !options.json) {
    console.log(`Evidence Markdown: ${outputs.markdownPath}`);
    console.log(`Evidence JSON: ${outputs.jsonPath}`);
  }
  if (options.check && report.thresholdEvaluation.hasBlockingFailures) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
