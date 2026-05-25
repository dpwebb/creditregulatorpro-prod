#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const rootDir = process.cwd();
const isWindows = process.platform === "win32";

const ignoredDirs = new Set([
  ".git",
  ".codex-logs",
  ".local",
  "dist",
  "node_modules",
  "output",
  "test-results",
]);

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const textExtensions = new Set([
  ...sourceExtensions,
  ".css",
  ".json",
  ".md",
  ".yml",
  ".yaml",
]);

const allowedDuplicateScripts = new Set([
  "node scripts/alerting-machine-proof.mjs",
  "node scripts/alerting-machine-proof-validate.mjs",
  "node scripts/response-ops-readiness-evidence.mjs",
]);

const findings = [];
const commandResults = [];

function rel(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function addFinding(severity, category, title, details, evidence = [], recommendation = "") {
  findings.push({
    severity,
    category,
    title,
    details,
    evidence: evidence.slice(0, 12),
    recommendation,
  });
}

function runCommand(id, label, command) {
  const args = isWindows ? ["/d", "/s", "/c", command] : ["-lc", command];
  const executable = isWindows ? "cmd.exe" : "sh";
  const startedAt = Date.now();
  const result = spawnSync(executable, args, {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
    windowsHide: true,
  });

  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const status = typeof result.status === "number" ? result.status : 1;
  const passed = status === 0;
  const durationMs = Date.now() - startedAt;
  const tail = combined
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .join("\n");

  commandResults.push({
    id,
    label,
    command,
    status: passed ? "PASS" : "FAIL",
    exitCode: status,
    durationMs,
    tail,
  });

  if (!passed) {
    addFinding(
      "FAIL",
      "Validation",
      `${label} failed`,
      `Command '${command}' exited with ${status}.`,
      tail ? tail.split(/\r?\n/) : [],
      id === "lint"
        ? "Install/configure real lint infrastructure or intentionally replace the failing placeholder with a documented non-blocking lint-status command."
        : "Resolve the failing validation command before treating the static audit as passing.",
    );
  }
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function isTextFile(filePath) {
  return textExtensions.has(path.extname(filePath));
}

function isSourceFile(filePath) {
  return sourceExtensions.has(path.extname(filePath));
}

function isTestFile(relativePath) {
  return (
    relativePath.startsWith("tests/") ||
    /\.spec\.[cm]?[jt]sx?$/.test(relativePath) ||
    /\.test\.[cm]?[jt]sx?$/.test(relativePath)
  );
}

function isProductionSource(relativePath) {
  return (
    isSourceFile(relativePath) &&
    !isTestFile(relativePath) &&
    !relativePath.startsWith("scripts/") &&
    !relativePath.startsWith("tools/")
  );
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function collectMarkerFindings(files) {
  const markerRows = [];
  const markerRegex = /\b(TODO|FIXME|HACK)\b/gi;

  for (const file of files.filter(isTextFile)) {
    const text = readText(file);
    let match;
    while ((match = markerRegex.exec(text))) {
      markerRows.push(`${rel(file)}:${lineNumberForIndex(text, match.index)} ${match[1].toUpperCase()}`);
    }
  }

  if (markerRows.length > 0) {
    const productionMarkers = markerRows.filter((row) => {
      const file = row.split(":")[0];
      return !file.startsWith("docs/") && !file.startsWith("tests/");
    });
    addFinding(
      productionMarkers.length > 0 ? "MEDIUM" : "LOW",
      "Technical Debt",
      "TODO/FIXME/HACK markers remain",
      `${markerRows.length} marker(s) found; ${productionMarkers.length} are outside docs/tests.`,
      markerRows,
      "Triage production markers first and convert intentional template placeholders into explicit fixture names or comments.",
    );
  }
}

function collectUnsafeAnyFindings(files) {
  const counts = new Map();
  const productionCounts = new Map();
  const unsafeAnyRegex = /\b(as\s+any|:\s*any\b|<any>|any\[\])/g;

  for (const file of files.filter(isSourceFile)) {
    const relativePath = rel(file);
    const text = readText(file);
    const matches = text.match(unsafeAnyRegex);
    if (!matches) continue;
    counts.set(relativePath, matches.length);
    if (isProductionSource(relativePath)) {
      productionCounts.set(relativePath, matches.length);
    }
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const productionTotal = [...productionCounts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return;

  const topProduction = [...productionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([file, count]) => `${file}: ${count}`);

  addFinding(
    productionTotal > 0 ? "MEDIUM" : "LOW",
    "Typing",
    "Unsafe any usage is widespread",
    `${total} unsafe any pattern(s) found; ${productionTotal} are in production source.`,
    topProduction.length > 0 ? topProduction : [...counts.entries()].map(([file, count]) => `${file}: ${count}`),
    "Reduce by subsystem, starting with endpoint/service boundaries and parser/admin UI adapters where any casts hide contract drift.",
  );
}

function collectDeprecatedFindings(files) {
  const rows = [];
  const deprecatedRegex = /@deprecated|\bdeprecated\b/gi;

  for (const file of files.filter(isTextFile)) {
    const relativePath = rel(file);
    if (relativePath.startsWith("docs/production-scale/evidence/")) continue;
    const text = readText(file);
    let match;
    while ((match = deprecatedRegex.exec(text))) {
      rows.push(`${relativePath}:${lineNumberForIndex(text, match.index)}`);
    }
  }

  if (rows.length > 0) {
    addFinding(
      "LOW",
      "API Hygiene",
      "Deprecated API references need review",
      `${rows.length} deprecated reference(s) found.`,
      rows,
      "Review whether each reference is a real runtime dependency, a compatibility note, or stale documentation.",
    );
  }
}

function collectUnreachableFindings(files) {
  const rows = [];
  const unreachableRegex = /\b(if\s*\(\s*false\s*\)|while\s*\(\s*false\s*\)|for\s*\(\s*;\s*false\s*;)/g;

  for (const file of files.filter(isSourceFile)) {
    const text = readText(file);
    let match;
    while ((match = unreachableRegex.exec(text))) {
      rows.push(`${rel(file)}:${lineNumberForIndex(text, match.index)}`);
    }
  }

  if (rows.length > 0) {
    addFinding(
      "LOW",
      "Dead Code",
      "Static unreachable-code patterns found",
      `${rows.length} obvious unreachable branch pattern(s) found.`,
      rows,
      "Delete or convert intentional disabled paths into tests/fixtures with clear names.",
    );
  }
}

function basePackageName(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return null;
  if (/[\s{}$`]/.test(specifier)) return null;
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope && name ? `${scope}/${name}` : specifier;
  }
  return specifier.split("/")[0];
}

function stripSpecifierSuffix(specifier) {
  return specifier.replace(/\?.*$/, "");
}

function extractImportSpecifiers(text) {
  const specifiers = [];
  const regexes = [
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(text))) {
      if (isInsideStringOrComment(text, match.index)) continue;
      specifiers.push(stripSpecifierSuffix(match[1]));
    }
  }

  return specifiers;
}

function isInsideStringOrComment(text, index) {
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < index; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    }
  }

  return Boolean(quote || lineComment || blockComment);
}

function resolveLocalImport(fromFile, specifier) {
  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [];
  const ext = path.extname(basePath);
  const alternateBasePath = ext && sourceExtensions.has(ext) ? basePath.slice(0, -ext.length) : basePath;
  if (ext && sourceExtensions.has(ext)) {
    candidates.push(basePath);
  }
  for (const sourceExt of sourceExtensions) {
    candidates.push(`${basePath}${sourceExt}`);
    candidates.push(`${alternateBasePath}${sourceExt}`);
  }
  for (const sourceExt of sourceExtensions) {
    candidates.push(path.join(basePath, `index${sourceExt}`));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return rel(candidate);
    }
  }

  return null;
}

function buildImportGraph(files) {
  const sourceFiles = files.filter(isSourceFile);
  const sourceSet = new Set(sourceFiles.map(rel));
  const graph = new Map();
  const localImportFailures = [];
  const externalImports = new Map();

  for (const file of sourceFiles) {
    const relativePath = rel(file);
    const text = readText(file);
    const imports = extractImportSpecifiers(text);
    const localEdges = [];

    for (const specifier of imports) {
      if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const resolved = resolveLocalImport(file, specifier);
        if (resolved && sourceSet.has(resolved)) {
          localEdges.push(resolved);
        } else if (!/\.(css|gif|jpeg|jpg|json|pdf|png|svg|webp)$/i.test(specifier)) {
          localImportFailures.push(`${relativePath} -> ${specifier}`);
        }
      } else {
        const packageName = basePackageName(specifier);
        if (!packageName || builtinModules.includes(packageName)) continue;
        if (!externalImports.has(packageName)) externalImports.set(packageName, new Set());
        externalImports.get(packageName).add(relativePath);
      }
    }

    graph.set(relativePath, localEdges);
  }

  return { graph, localImportFailures, externalImports };
}

function findCycles(graph) {
  const cycles = [];
  const seenCycleKeys = new Set();
  const stack = [];
  const stackIndex = new Map();
  const visited = new Set();

  function canonicalCycle(cycle) {
    const nodes = cycle.slice(0, -1);
    let best = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const rotated = [...nodes.slice(i), ...nodes.slice(0, i)];
      const key = rotated.join(" -> ");
      if (best == null || key < best) best = key;
    }
    return best;
  }

  function visit(node) {
    if (stackIndex.has(node)) {
      const cycle = [...stack.slice(stackIndex.get(node)), node];
      const key = canonicalCycle(cycle);
      if (!seenCycleKeys.has(key)) {
        seenCycleKeys.add(key);
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stackIndex.set(node, stack.length);
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    stackIndex.delete(node);
  }

  for (const node of graph.keys()) visit(node);
  return cycles;
}

function collectImportGraphFindings(files) {
  const { graph, localImportFailures, externalImports } = buildImportGraph(files);
  const cycles = findCycles(graph);

  if (localImportFailures.length > 0) {
    addFinding(
      "FAIL",
      "Dependency Graph",
      "Unresolved local imports found",
      `${localImportFailures.length} local import(s) could not be resolved by the static scanner.`,
      localImportFailures,
      "Fix broken imports or extend the scanner when the import is intentionally handled by a build plugin.",
    );
  }

  if (cycles.length > 0) {
    addFinding(
      "HIGH",
      "Dependency Graph",
      "Circular local dependencies found",
      `${cycles.length} circular import path(s) detected.`,
      cycles.slice(0, 12).map((cycle) => cycle.join(" -> ")),
      "Break cycles at helper/service boundaries before they become runtime initialization defects.",
    );
  }

  return { graph, externalImports };
}

function collectPackageFindings(externalImports) {
  const packageJsonPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(readText(packageJsonPath));
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const allDeclared = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);
  const overlap = Object.keys(deps).filter((name) => Object.hasOwn(devDeps, name));

  if (overlap.length > 0) {
    addFinding(
      "FAIL",
      "Package Consistency",
      "Dependencies are declared in both dependencies and devDependencies",
      `${overlap.length} package(s) are duplicated across dependency sections.`,
      overlap,
      "Keep each package in exactly one dependency section.",
    );
  }

  if (existsSync(path.join(rootDir, "package-lock.json")) && existsSync(path.join(rootDir, "pnpm-lock.yaml"))) {
    addFinding(
      "MEDIUM",
      "Package Consistency",
      "Both npm and pnpm lockfiles are present",
      "The repo standard scripts use pnpm, but package-lock.json is also committed.",
      ["package-lock.json", "pnpm-lock.yaml"],
      "Confirm whether package-lock.json is intentionally retained; otherwise remove it in a dedicated cleanup after approval.",
    );
  }

  const runtimeTypes = Object.keys(deps).filter((name) => name.startsWith("@types/"));
  if (runtimeTypes.length > 0) {
    addFinding(
      "LOW",
      "Package Consistency",
      "@types packages are listed as runtime dependencies",
      `${runtimeTypes.length} type package(s) are under dependencies.`,
      runtimeTypes,
      "Move type-only packages to devDependencies in a dependency cleanup task.",
    );
  }

  if (pkg.overrides && pkg.pnpm?.overrides && JSON.stringify(pkg.overrides) === JSON.stringify(pkg.pnpm.overrides)) {
    addFinding(
      "LOW",
      "Package Consistency",
      "Override policy is duplicated",
      "The same override block exists at root overrides and pnpm.overrides.",
      ["package.json"],
      "Keep one package-manager override source once compatibility needs are confirmed.",
    );
  }

  const duplicateScripts = new Map();
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (!duplicateScripts.has(command)) duplicateScripts.set(command, []);
    duplicateScripts.get(command).push(name);
  }
  const duplicateRows = [...duplicateScripts.entries()]
    .filter(([command, names]) => names.length > 1 && !allowedDuplicateScripts.has(command))
    .map(([command, names]) => `${names.join(", ")} => ${command}`);

  if (duplicateRows.length > 0) {
    addFinding(
      "LOW",
      "Script Hygiene",
      "Duplicate package scripts found",
      `${duplicateRows.length} duplicate script command group(s) found.`,
      duplicateRows,
      "Keep intentional aliases documented and collapse accidental duplicates.",
    );
  }

  const usedRootPackages = new Set();
  const undeclared = [];
  for (const [name, refs] of externalImports.entries()) {
    const refsMissingDeclarations = [...refs].filter((reference) => !nearestPackageDeclares(reference, name));
    if ([...refs].some((reference) => nearestPackageDir(reference) === rootDir)) usedRootPackages.add(name);
    if (refsMissingDeclarations.length > 0 && !name.startsWith("node:")) undeclared.push(name);
  }

  if (undeclared.length > 0) {
    addFinding(
      "MEDIUM",
      "Dependency Graph",
      "Imported packages missing from package.json",
      `${undeclared.length} external package import(s) are not declared directly.`,
      undeclared.sort(),
      "Declare direct dependencies instead of relying on transitive packages.",
    );
  }

  const unusedRuntimeDeps = Object.keys(deps)
    .filter((name) => !name.startsWith("@types/") && !usedRootPackages.has(name))
    .sort();
  if (unusedRuntimeDeps.length > 0) {
    addFinding(
      "LOW",
      "Dependency Graph",
      "Potentially unused runtime dependencies",
      `${unusedRuntimeDeps.length} runtime package(s) were not referenced by static imports.`,
      unusedRuntimeDeps.slice(0, 20),
      "Review before removing; some packages may be loaded dynamically or used by generated/runtime-only paths.",
    );
  }
}

const nearestPackageCache = new Map();

function loadPackageJson(dir) {
  const packagePath = path.join(dir, "package.json");
  if (!existsSync(packagePath)) return null;
  return JSON.parse(readText(packagePath));
}

function nearestPackageDir(relativePath) {
  if (nearestPackageCache.has(relativePath)) return nearestPackageCache.get(relativePath);

  let currentDir = path.dirname(path.join(rootDir, relativePath));
  while (currentDir.startsWith(rootDir)) {
    if (existsSync(path.join(currentDir, "package.json"))) {
      nearestPackageCache.set(relativePath, currentDir);
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  nearestPackageCache.set(relativePath, rootDir);
  return rootDir;
}

function nearestPackageDeclares(relativePath, packageName) {
  const pkg = loadPackageJson(nearestPackageDir(relativePath));
  return Boolean(
    pkg?.dependencies?.[packageName] ||
      pkg?.devDependencies?.[packageName] ||
      pkg?.peerDependencies?.[packageName] ||
      pkg?.optionalDependencies?.[packageName],
  );
}

function collectEnvFindings(files) {
  const envRefs = new Map();
  const envRegex = /\b(?:process|import\.meta)\.env(?:\.|\?\.)?([A-Z][A-Z0-9_]*)|\b(?:process|import\.meta)\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;

  for (const file of files.filter(isSourceFile)) {
    const relativePath = rel(file);
    const text = readText(file);
    let match;
    while ((match = envRegex.exec(text))) {
      const key = match[1] ?? match[2];
      if (!key) continue;
      if (!envRefs.has(key)) envRefs.set(key, new Set());
      envRefs.get(key).add(relativePath);
    }
  }

  if (envRefs.size > 0) {
    const rows = [...envRefs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 40)
      .map(([key, refs]) => `${key}: ${refs.size} file(s)`);
    addFinding(
      "INFO",
      "Environment",
      "Environment references inventoried",
      `${envRefs.size} unique environment variable key(s) referenced in source.`,
      rows,
      "Keep secrets out of logs and consider a typed env contract for runtime-required variables.",
    );
  }
}

function collectFixtureFindings(files) {
  const fixtures = files.filter((file) => rel(file).startsWith("tests/fixtures/"));
  if (fixtures.length === 0) return;

  const searchableFiles = files.filter(isTextFile);
  const staleRows = [];

  for (const fixture of fixtures) {
    const relativePath = rel(fixture);
    const basename = path.basename(fixture);
    let references = 0;
    for (const file of searchableFiles) {
      if (file === fixture) continue;
      if (readText(file).includes(basename) || readText(file).includes(relativePath)) references += 1;
    }
    if (references === 0) staleRows.push(relativePath);
  }

  if (staleRows.length > 0) {
    addFinding(
      "LOW",
      "Test Hygiene",
      "Potential stale test fixtures found",
      `${staleRows.length} fixture(s) had no filename/path textual references.`,
      staleRows,
      "Confirm before deleting; fixtures can be loaded indirectly through helper arrays.",
    );
  }
}

function collectCiWorkflowFindings(files) {
  const workflowFiles = files.filter((file) => rel(file).startsWith(".github/workflows/"));
  const runLines = new Map();

  for (const file of workflowFiles) {
    const relativePath = rel(file);
    const lines = readText(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(/^\s*run:\s*(.+)$/);
      if (!match) return;
      const command = match[1].trim();
      if (command === "|") return;
      if (!runLines.has(command)) runLines.set(command, []);
      runLines.get(command).push(`${relativePath}:${index + 1}`);
    });
  }

  const duplicates = [...runLines.entries()]
    .filter(([, refs]) => refs.length > 1)
    .map(([command, refs]) => `${command} => ${refs.join(", ")}`);

  if (duplicates.length > 0) {
    addFinding(
      "LOW",
      "CI Hygiene",
      "Duplicate CI run commands found",
      `${duplicates.length} duplicated workflow run command(s) found.`,
      duplicates,
      "Keep duplicated commands only where staging/production workflows must intentionally diverge around the same gate.",
    );
  }
}

function collectOrphanFindings(files, graph) {
  const referenced = new Set();
  for (const edges of graph.values()) {
    for (const edge of edges) referenced.add(edge);
  }

  const entryCandidates = new Set([
    "App.tsx",
    "index.tsx",
    "server.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
    "loadEnv.js",
  ]);

  const candidates = files
    .filter(isSourceFile)
    .map(rel)
    .filter((relativePath) => {
      if (entryCandidates.has(relativePath)) return false;
      if (referenced.has(relativePath)) return false;
      if (relativePath.startsWith("tests/")) return false;
      if (relativePath.startsWith("scripts/")) return false;
      if (relativePath.startsWith("endpoints/")) return false;
      if (relativePath.endsWith(".schema.ts")) return false;
      return (
        relativePath.startsWith("components/") ||
        relativePath.startsWith("helpers/") ||
        relativePath.startsWith("pages/") ||
        relativePath.startsWith("services/")
      );
    });

  if (candidates.length > 0) {
    addFinding(
      "LOW",
      "Dead Code",
      "Potential orphaned source files found",
      `${candidates.length} production source file(s) had no static inbound imports in this Level 1 scan.`,
      candidates.slice(0, 20),
      "Review manually before deleting because route loaders and dynamic imports can evade simple static analysis.",
    );
  }
}

function printReport() {
  const severityOrder = ["FAIL", "HIGH", "MEDIUM", "LOW", "INFO"];
  const failureCount = findings.filter((finding) => finding.severity === "FAIL" || finding.severity === "HIGH").length;

  console.log("CreditRegulatorPro Level 1 Static Audit");
  console.log(`Root: ${rootDir}`);
  console.log("");
  console.log("Validation Commands");
  for (const result of commandResults) {
    console.log(`- [${result.status}] ${result.command} (${result.durationMs}ms)`);
  }
  console.log("");
  console.log(`Summary: ${failureCount > 0 ? "FAIL" : "PASS"} (${findings.length} finding(s))`);

  for (const severity of severityOrder) {
    const group = findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    console.log("");
    console.log(`${severity}`);
    for (const finding of group) {
      console.log(`- ${finding.category}: ${finding.title}`);
      console.log(`  ${finding.details}`);
      if (finding.evidence.length > 0) {
        console.log("  Evidence:");
        for (const row of finding.evidence) console.log(`    - ${row}`);
      }
      if (finding.recommendation) console.log(`  Recommendation: ${finding.recommendation}`);
    }
  }
}

runCommand("lint", "Lint", "pnpm lint");
runCommand("typecheck", "TypeScript typecheck", "pnpm run typecheck");
runCommand("build", "Application build", "pnpm run build");
runCommand("prodAudit", "Production dependency audit", "pnpm audit --prod");

const files = walk(rootDir);
collectMarkerFindings(files);
collectUnsafeAnyFindings(files);
collectDeprecatedFindings(files);
collectUnreachableFindings(files);
const { graph, externalImports } = collectImportGraphFindings(files);
collectPackageFindings(externalImports);
collectEnvFindings(files);
collectFixtureFindings(files);
collectCiWorkflowFindings(files);
collectOrphanFindings(files, graph);
printReport();

const hasBlockingFinding = findings.some((finding) => finding.severity === "FAIL" || finding.severity === "HIGH");
process.exit(hasBlockingFinding ? 1 : 0);
