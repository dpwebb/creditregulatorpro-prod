import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENVIRONMENT_PARITY_DOC_PATH = "docs/environment-parity.md";

const STAGING_COMPOSE_PATH = "docker-compose.yml";
const PRODUCTION_COMPOSE_PATH = "docker-compose.production.yml";
const STAGING_WORKFLOW_PATH = ".github/workflows/deploy-staging.yml";
const PRODUCTION_WORKFLOW_PATH = ".github/workflows/deploy-production.yml";

const EXPECTED_STORAGE_TARGET = "/app/document-storage";
const EXPECTED_NODE_VERSION = "22";
const EXPECTED_PNPM_VERSION = "10";

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || fallback;
  } catch {
    return fallback;
  }
}

function getIndentedBlock(source, anchorPattern) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => anchorPattern.test(line));
  if (start < 0) return "";

  const anchorIndent = lines[start].match(/^(\s*)/)?.[1].length ?? 0;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && (line.match(/^(\s*)/)?.[1].length ?? 0) <= anchorIndent) break;
    block.push(line);
  }
  return block.join("\n");
}

function serviceBlock(composeText, serviceName) {
  return getIndentedBlock(composeText, new RegExp(`^\\s{2}${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*$`));
}

function scalarFromBlock(block, key) {
  const match = block.match(new RegExp(`^\\s+${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([^\\n#]+)\\s*$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}

function listValuesFromBlock(block, key) {
  const keyMatch = block.match(new RegExp(`^\\s+${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*$`, "m"));
  if (!keyMatch || keyMatch.index === undefined) return [];
  const after = block.slice(keyMatch.index + keyMatch[0].length);
  const lines = after.split("\n");
  const values = [];
  for (const line of lines) {
    if (line.trim() && /^    [a-zA-Z0-9_-]+:/.test(line)) break;
    const match = line.match(/^\s+-\s*(.+?)\s*$/);
    if (match) values.push(match[1].trim().replace(/^["']|["']$/g, ""));
  }
  return values;
}

function environmentKeysFromBlock(block) {
  const envBlock = getIndentedBlock(block, /^\s+environment:\s*$/m);
  const keys = new Set();
  for (const match of envBlock.matchAll(/^\s+([A-Z0-9_]+):/gm)) keys.add(match[1]);
  for (const match of envBlock.matchAll(/^\s+-\s*([A-Z0-9_]+)=/gm)) keys.add(match[1]);
  return [...keys].sort();
}

function parseVolume(value) {
  const parts = String(value).split(":");
  return {
    source: parts[0] ?? "",
    target: parts[1] ?? "",
  };
}

function summarizeCompose(composeText, serviceName) {
  const appBlock = serviceBlock(composeText, serviceName);
  const volumes = listValuesFromBlock(appBlock, "volumes").map(parseVolume);
  const labels = listValuesFromBlock(appBlock, "labels");
  return {
    serviceName,
    exists: Boolean(appBlock),
    buildContext: scalarFromBlock(appBlock, "context"),
    dockerfile: scalarFromBlock(appBlock, "dockerfile"),
    image: scalarFromBlock(appBlock, "image"),
    containerName: scalarFromBlock(appBlock, "container_name"),
    restart: scalarFromBlock(appBlock, "restart"),
    envFiles: listValuesFromBlock(appBlock, "env_file"),
    environmentKeys: environmentKeysFromBlock(appBlock),
    volumes,
    storageTargets: volumes.map((volume) => volume.target).filter(Boolean),
    extraHosts: listValuesFromBlock(appBlock, "extra_hosts"),
    networkMode: scalarFromBlock(appBlock, "network_mode"),
    labels,
    traefikEnabled: labels.includes("traefik.enable=true"),
    traefikWebsecure: labels.some((label) => label.includes(".entrypoints=websecure")),
    traefikTls: labels.some((label) => label.includes(".tls=true")),
    traefikLetsEncrypt: labels.some((label) => label.includes(".tls.certresolver=letsencrypt")),
    traefikHostRule: labels.find((label) => label.includes(".rule=Host(")) ?? null,
    traefikServicePort: labels.find((label) => label.includes(".loadbalancer.server.port="))?.split("=").pop() ?? null,
  };
}

function summarizeWorkflow(workflowText, environment) {
  const waitForStatusCalls = [...workflowText.matchAll(/wait_for_status\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"\s+'([^']+)'/g)]
    .map((match) => ({
      label: match[1],
      method: match[2],
      path: match[3],
      acceptedRegex: match[4],
    }));
  const stagingParityCalls = [...workflowText.matchAll(/wait_for_staging_status\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"\s+'([^']+)'/g)]
    .map((match) => ({
      label: match[1],
      method: match[2],
      path: match[3],
      acceptedRegex: match[4],
    }));
  const probes = environment === "production" ? waitForStatusCalls : stagingParityCalls;
  return {
    environment,
    nodeVersion: workflowText.match(/node-version:\s*([0-9]+)/)?.[1] ?? null,
    pnpmVersion: workflowText.match(/^\s+version:\s*([0-9]+)\s*$/m)?.[1] ?? null,
    installsDependencies: workflowText.includes("pnpm install --frozen-lockfile"),
    installsPlaywrightChromium: workflowText.includes("pnpm exec playwright install --with-deps chromium"),
    resolvesTargetSha: workflowText.includes("resolve-target:") && workflowText.includes("Resolve and validate TARGET_SHA"),
    validatesCheckoutSha: workflowText.includes("Verify validation checkout target SHA") && workflowText.includes("Verify deploy checkout target SHA"),
    storageDurabilityPreflight: workflowText.includes("pnpm run storage:durability-contract --") && workflowText.includes("--preflight --no-write-evidence"),
    ingestBoundaryPreflight: workflowText.includes("pnpm run ingest:worker-boundary-evidence -- --preflight --no-write-evidence"),
    rollbackEvidence: workflowText.includes("rollbackAttempted") && workflowText.includes("rollbackHealthResult") && workflowText.includes("CERTIFYING"),
    rollbackHealthCheck: /run_production_health_checks "rollback"|run_staging_production_parity_health_checks "rollback"/.test(workflowText),
    hostKeyPinning: workflowText.includes(`${environment === "production" ? "PRODUCTION" : "STAGING"}_SSH_HOST_KEY_SHA256`),
    productionHostKeyRequired: workflowText.includes("PRODUCTION_SSH_HOST_KEY_SHA256 is required"),
    stagingTofuFallback: workflowText.includes("collect_staging_known_hosts_with_ssh_tofu"),
    validationCommand: workflowText.match(/run:\s*(pnpm run validate:[a-z]+[^\n]*)/)?.[1]?.trim() ?? null,
    bootstrapReleaseDatabase: workflowText.includes("creditregulatorpro_release_validation") && workflowText.includes("bootstrap:local-auth-schema"),
    syntheticFixtureFlow: workflowText.includes("response-auth-smoke") || workflowText.includes("SMOKE_ADMIN_EMAIL"),
    adminResetSmoke: workflowText.includes("smoke:admin-platform-reset"),
    productionWorkerDefaultOff:
      workflowText.includes("Skipping production ingest worker. Manual workflow_dispatch input is required.") &&
      workflowText.includes("production ingest worker started during default no-worker deploy"),
    stagingWorkerOrchestration:
      workflowText.includes("run_staging_ingest_worker_orchestration()") &&
      workflowText.includes("staging-safe-ingest-worker-evidence"),
    healthProbes: probes,
    healthProbeMethods: [...new Set(probes.map((probe) => probe.method))].sort(),
    invalidSessionDenial: probes.some((probe) => /invalid session/i.test(probe.label) && probe.path.startsWith("/_api/")),
    protectedDenialPaths: [...new Set(probes
      .filter((probe) => /denial/i.test(probe.label) && probe.path.startsWith("/_api/"))
      .map((probe) => probe.path))]
      .sort(),
  };
}

function addCheck(checks, category, name, status, details = {}) {
  checks.push({
    category,
    name,
    status,
    blocking: status === "fail",
    ...details,
  });
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function buildChecks({ stagingCompose, productionCompose, stagingWorkflow, productionWorkflow }) {
  const checks = [];

  addCheck(
    checks,
    "Docker Compose",
    "App services use the same build context and Dockerfile",
    stagingCompose.buildContext === productionCompose.buildContext && stagingCompose.dockerfile === productionCompose.dockerfile ? "pass" : "fail",
    { staging: `${stagingCompose.buildContext}/${stagingCompose.dockerfile}`, production: `${productionCompose.buildContext}/${productionCompose.dockerfile}` },
  );
  addCheck(
    checks,
    "Docker Compose",
    "App services mount the same durable storage target",
    stagingCompose.storageTargets.includes(EXPECTED_STORAGE_TARGET) && productionCompose.storageTargets.includes(EXPECTED_STORAGE_TARGET) ? "pass" : "fail",
    { staging: stagingCompose.storageTargets, production: productionCompose.storageTargets },
  );
  addCheck(
    checks,
    "Docker Compose",
    "App services use the same host networking and host-gateway shape",
    stagingCompose.networkMode === productionCompose.networkMode && sameSet(stagingCompose.extraHosts, productionCompose.extraHosts) ? "pass" : "fail",
    { staging: { networkMode: stagingCompose.networkMode, extraHosts: stagingCompose.extraHosts }, production: { networkMode: productionCompose.networkMode, extraHosts: productionCompose.extraHosts } },
  );
  addCheck(
    checks,
    "Docker Compose",
    "Traefik TLS routing model is the same",
    stagingCompose.traefikEnabled &&
      productionCompose.traefikEnabled &&
      stagingCompose.traefikWebsecure &&
      productionCompose.traefikWebsecure &&
      stagingCompose.traefikTls &&
      productionCompose.traefikTls &&
      stagingCompose.traefikLetsEncrypt &&
      productionCompose.traefikLetsEncrypt
      ? "pass"
      : "fail",
    {
      staging: {
        hostRule: stagingCompose.traefikHostRule,
        servicePort: stagingCompose.traefikServicePort,
      },
      production: {
        hostRule: productionCompose.traefikHostRule,
        servicePort: productionCompose.traefikServicePort,
      },
    },
  );
  addCheck(
    checks,
    "Docker Compose",
    "Container names, env files, domains, and app ports intentionally differ",
    "intentional",
    {
      reason: "They identify separate environments and must not be homogenized.",
      staging: {
        containerName: stagingCompose.containerName,
        envFiles: stagingCompose.envFiles,
        hostRule: stagingCompose.traefikHostRule,
        servicePort: stagingCompose.traefikServicePort,
      },
      production: {
        containerName: productionCompose.containerName,
        envFiles: productionCompose.envFiles,
        hostRule: productionCompose.traefikHostRule,
        servicePort: productionCompose.traefikServicePort,
      },
    },
  );

  addCheck(
    checks,
    "Runtime",
    "Node and pnpm versions match in deploy workflows",
    stagingWorkflow.nodeVersion === EXPECTED_NODE_VERSION &&
      productionWorkflow.nodeVersion === EXPECTED_NODE_VERSION &&
      stagingWorkflow.pnpmVersion === EXPECTED_PNPM_VERSION &&
      productionWorkflow.pnpmVersion === EXPECTED_PNPM_VERSION
      ? "pass"
      : "fail",
    {
      staging: { node: stagingWorkflow.nodeVersion, pnpm: stagingWorkflow.pnpmVersion },
      production: { node: productionWorkflow.nodeVersion, pnpm: productionWorkflow.pnpmVersion },
    },
  );
  addCheck(
    checks,
    "Runtime",
    "Playwright Chromium is installed in both release-validation paths",
    stagingWorkflow.installsPlaywrightChromium && productionWorkflow.installsPlaywrightChromium ? "pass" : "fail",
    { staging: stagingWorkflow.installsPlaywrightChromium, production: productionWorkflow.installsPlaywrightChromium },
  );
  addCheck(
    checks,
    "Runtime",
    "OCR/PDF tooling is shared through the same Dockerfile",
    stagingCompose.dockerfile === "Dockerfile" && productionCompose.dockerfile === "Dockerfile" ? "pass" : "fail",
    { dockerfile: "Dockerfile" },
  );

  addCheck(
    checks,
    "Deploy Workflow",
    "Both workflows resolve, validate, and deploy an exact target SHA",
    stagingWorkflow.resolvesTargetSha &&
      productionWorkflow.resolvesTargetSha &&
      stagingWorkflow.validatesCheckoutSha &&
      productionWorkflow.validatesCheckoutSha
      ? "pass"
      : "fail",
    { staging: stagingWorkflow.validationCommand, production: productionWorkflow.validationCommand },
  );
  addCheck(
    checks,
    "Deploy Workflow",
    "Both workflows run storage and worker-boundary preflights before restart",
    stagingWorkflow.storageDurabilityPreflight &&
      productionWorkflow.storageDurabilityPreflight &&
      stagingWorkflow.ingestBoundaryPreflight &&
      productionWorkflow.ingestBoundaryPreflight
      ? "pass"
      : "fail",
    { staging: { storage: stagingWorkflow.storageDurabilityPreflight, workerBoundary: stagingWorkflow.ingestBoundaryPreflight }, production: { storage: productionWorkflow.storageDurabilityPreflight, workerBoundary: productionWorkflow.ingestBoundaryPreflight } },
  );
  addCheck(
    checks,
    "Deploy Workflow",
    "Rollback evidence and post-rollback health checks exist in both workflows",
    stagingWorkflow.rollbackEvidence &&
      productionWorkflow.rollbackEvidence &&
      stagingWorkflow.rollbackHealthCheck &&
      productionWorkflow.rollbackHealthCheck
      ? "pass"
      : "fail",
    { staging: { evidence: stagingWorkflow.rollbackEvidence, health: stagingWorkflow.rollbackHealthCheck }, production: { evidence: productionWorkflow.rollbackEvidence, health: productionWorkflow.rollbackHealthCheck } },
  );
  addCheck(
    checks,
    "Deploy Workflow",
    "Production host-key pinning is stricter than staging",
    productionWorkflow.hostKeyPinning && productionWorkflow.productionHostKeyRequired && stagingWorkflow.hostKeyPinning
      ? "warn"
      : "fail",
    {
      reason: "Production fails closed on host-key pinning. Staging supports host-key pinning but currently retains TOFU fallback so existing staging credentials keep working until STAGING_SSH_HOST_KEY_SHA256 is configured.",
      stagingTofuFallback: stagingWorkflow.stagingTofuFallback,
    },
  );

  addCheck(
    checks,
    "Health And Smoke",
    "Staging and production use the same read-only public/protected denial smoke model",
    stagingWorkflow.invalidSessionDenial &&
      productionWorkflow.invalidSessionDenial &&
      sameSet(stagingWorkflow.protectedDenialPaths, productionWorkflow.protectedDenialPaths) &&
      sameSet(stagingWorkflow.healthProbeMethods, productionWorkflow.healthProbeMethods)
      ? "pass"
      : "fail",
    {
      staging: {
        methods: stagingWorkflow.healthProbeMethods,
        protectedDenialPaths: stagingWorkflow.protectedDenialPaths,
      },
      production: {
        methods: productionWorkflow.healthProbeMethods,
        protectedDenialPaths: productionWorkflow.protectedDenialPaths,
      },
    },
  );
  addCheck(
    checks,
    "Health And Smoke",
    "Staging-only destructive or synthetic smokes remain absent from production",
    stagingWorkflow.syntheticFixtureFlow &&
      stagingWorkflow.adminResetSmoke &&
      !productionWorkflow.syntheticFixtureFlow &&
      !productionWorkflow.adminResetSmoke
      ? "intentional"
      : "fail",
    {
      reason: "Staging may create and clean synthetic fixtures and exercise admin reset dry-run paths. Production release validation must remain read-only.",
    },
  );

  addCheck(
    checks,
    "Worker Policy",
    "Production worker remains default-off while staging keeps worker coverage",
    productionWorkflow.productionWorkerDefaultOff && stagingWorkflow.stagingWorkerOrchestration ? "intentional" : "fail",
    {
      reason: "Production worker activation requires explicit workflow_dispatch guard inputs. Staging keeps continuous worker coverage plus bounded orchestration for E2E certification.",
    },
  );

  addCheck(
    checks,
    "Reset Policy",
    "Production reset remains disabled while staging reset validation stays available",
    stagingWorkflow.adminResetSmoke && !productionWorkflow.adminResetSmoke ? "intentional" : "fail",
    {
      reason: "Staging reset is admin-protected and disposable-data scoped. Production platform reset must stay unavailable.",
    },
  );

  return checks;
}

function summarizeChecks(checks) {
  return {
    passed: checks.filter((check) => check.status === "pass").length,
    intentional: checks.filter((check) => check.status === "intentional").length,
    warnings: checks.filter((check) => check.status === "warn").length,
    failed: checks.filter((check) => check.status === "fail").length,
  };
}

export function buildEnvironmentParityReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  stagingComposeText = null,
  productionComposeText = null,
  stagingWorkflowText = null,
  productionWorkflowText = null,
} = {}) {
  const resolvedStagingComposeText = stagingComposeText ?? readText(rootDir, STAGING_COMPOSE_PATH);
  const resolvedProductionComposeText = productionComposeText ?? readText(rootDir, PRODUCTION_COMPOSE_PATH);
  const resolvedStagingWorkflowText = stagingWorkflowText ?? readText(rootDir, STAGING_WORKFLOW_PATH);
  const resolvedProductionWorkflowText = productionWorkflowText ?? readText(rootDir, PRODUCTION_WORKFLOW_PATH);

  const stagingCompose = summarizeCompose(resolvedStagingComposeText, "creditregulatorpro-staging");
  const productionCompose = summarizeCompose(resolvedProductionComposeText, "creditregulatorpro");
  const stagingWorkflow = summarizeWorkflow(resolvedStagingWorkflowText, "staging");
  const productionWorkflow = summarizeWorkflow(resolvedProductionWorkflowText, "production");
  const checks = buildChecks({ stagingCompose, productionCompose, stagingWorkflow, productionWorkflow });
  const summary = summarizeChecks(checks);

  const blockingGaps = checks.filter((check) => check.status === "fail");
  const riskyDifferences = checks.filter((check) => check.status === "warn");
  const intentionalDifferences = checks.filter((check) => check.status === "intentional");

  return {
    reportName: "environment-parity",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: blockingGaps.length === 0 ? "passed" : "failed",
    operationallyAligned: blockingGaps.length === 0,
    summary,
    eliminatedDifferences: [
      "Staging release validation now installs Playwright Chromium like production release validation.",
      "Staging deploy health checks now include production-style read-only protected-route and invalid-session denial probes.",
      "Storage durability and worker-boundary preflights are verified in both deploy workflows.",
      "Rollback evidence and post-rollback health checks are statically verified for both deploy workflows.",
    ],
    checks,
    blockingGaps,
    riskyDifferences,
    intentionalDifferences,
    policies: {
      worker: "Production worker is default-off and manual/guarded only. Staging keeps worker coverage for certification and may run bounded staging-safe orchestration.",
      reset: "Production platform reset remains disabled. Staging reset remains admin-protected and disposable-data scoped.",
      storage: "Both environments mount /app/document-storage and must pass storage durability preflight before restart.",
      deploy: "Both environments deploy exact target SHAs through GitHub Actions, capture rollback evidence, and run post-deploy health checks.",
      productionSafeProbes: "Production probes remain GET/HEAD only and must not create fixtures, mutate data, or activate workers.",
    },
  };
}

function renderDetails(value) {
  if (value?.dockerfile) return `Shared ${value.dockerfile}.`;
  if (value?.staging !== undefined || value?.production !== undefined) {
    const staging = JSON.stringify(value.staging);
    const production = JSON.stringify(value.production);
    return `staging=${staging}; production=${production}`;
  }
  return "";
}

export function renderEnvironmentParityMarkdown(report) {
  const lines = [
    "# Environment Parity",
    "",
    `Generated at: ${report.generatedAt}`,
    `Commit: \`${report.commit}\``,
    `Status: ${report.status}`,
    `Operationally aligned: ${report.operationallyAligned ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    `- Passing parity checks: ${report.summary.passed}`,
    `- Intentional differences: ${report.summary.intentional}`,
    `- Warning differences: ${report.summary.warnings}`,
    `- Blocking gaps: ${report.summary.failed}`,
    "",
    "## Identical Or Aligned Systems",
    "",
    "| Area | Check | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...report.checks
      .filter((check) => check.status === "pass")
      .map((check) => `| ${check.category} | ${check.name} | PASS | ${renderDetails(check).replaceAll("|", "\\|")} |`),
    "",
    "## Intentionally Different Systems",
    "",
    "| Area | Difference | Reason |",
    "| --- | --- | --- |",
    ...report.intentionalDifferences.map((check) =>
      `| ${check.category} | ${check.name} | ${(check.reason ?? "Intentional environment separation.").replaceAll("|", "\\|")} |`,
    ),
    "",
    "## Risky Differences",
    "",
    ...(report.riskyDifferences.length
      ? [
          "| Area | Difference | Risk |",
          "| --- | --- | --- |",
          ...report.riskyDifferences.map((check) =>
            `| ${check.category} | ${check.name} | ${(check.reason ?? "Review before next production promotion.").replaceAll("|", "\\|")} |`,
          ),
        ]
      : ["None."]),
    "",
    "## Eliminated Differences",
    "",
    ...report.eliminatedDifferences.map((item) => `- ${item}`),
    "",
    "## Policies",
    "",
    `- Worker policy: ${report.policies.worker}`,
    `- Reset policy: ${report.policies.reset}`,
    `- Storage policy: ${report.policies.storage}`,
    `- Deploy policy: ${report.policies.deploy}`,
    `- Production-safe probes: ${report.policies.productionSafeProbes}`,
    "",
    "## Blocking Gaps",
    "",
    ...(report.blockingGaps.length
      ? report.blockingGaps.map((check) => `- ${check.category}: ${check.name}`)
      : ["None."]),
  ];
  return `${lines.join("\n")}\n`;
}

export function writeEnvironmentParityReport(report, { rootDir = process.cwd() } = {}) {
  const outputPath = repoPath(rootDir, ENVIRONMENT_PARITY_DOC_PATH);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderEnvironmentParityMarkdown(report), "utf8");
  return { markdownPath: ENVIRONMENT_PARITY_DOC_PATH };
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    writeDocs: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run environment:parity -- [options]",
        "",
        "Checks staging/production operational parity without accessing or mutating production.",
        "",
        "Options:",
        "  --write-docs   Write docs/environment-parity.md.",
        "  --json         Print JSON report.",
        "  --root <path>  Project root. Defaults to current working directory.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--write-docs") {
      options.writeDocs = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a value.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildEnvironmentParityReport({ rootDir: options.rootDir });
  if (options.writeDocs) {
    const outputs = writeEnvironmentParityReport(report, { rootDir: options.rootDir });
    console.log(`Environment parity report written: ${outputs.markdownPath}`);
  }
  console.log(`Environment parity status: ${report.status}`);
  console.log(`Blocking gaps: ${report.blockingGaps.length}`);
  console.log(`Risky differences: ${report.riskyDifferences.length}`);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (report.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
