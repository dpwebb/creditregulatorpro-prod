import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readStoredFile, uploadFile } from "../helpers/gcsStorage";

export const DEFAULT_STORAGE_DURABILITY_EVIDENCE_DIR = "docs/production-scale/evidence";
export const STORAGE_DURABILITY_EVIDENCE_MARKDOWN = "latest-storage-durability.md";
export const STORAGE_DURABILITY_EVIDENCE_JSON = "latest-storage-durability.json";
export const EXPECTED_CONTAINER_STORAGE_ROOT = "/app/document-storage";
export const STAGING_STORAGE_SERVICE = "creditregulatorpro-staging";
export const PRODUCTION_STORAGE_SERVICE = "creditregulatorpro";

type EnvironmentName = "local" | "staging" | "production";
type ContractMode = "durable-local-mount" | "object-storage" | "unsafe-local" | "missing";
type ContractStatus = "passed" | "failed";

export type StorageDurabilityContractReport = {
  status: ContractStatus;
  targetEnvironment: EnvironmentName;
  mode: ContractMode;
  storageRoot: string | null;
  objectStorage: {
    configured: boolean;
    mode: string | null;
    provider: string | null;
    bucketConfigured: boolean;
    liveNetworkCallsMade: false;
  };
  durableLocal: {
    configured: boolean;
    source: string | null;
    target: string | null;
    type: "bind" | "volume" | "runtime-env" | null;
    explicitAck: boolean;
  };
  compose: {
    checked: boolean;
    path: string | null;
    service: string | null;
    serviceFound: boolean;
  };
  errors: string[];
  warnings: string[];
};

type ComposeMount = {
  source: string;
  target: string;
  type: "bind" | "volume";
};

type CliOptions = {
  environment: EnvironmentName | null;
  composePath: string | null;
  serviceName: string | null;
  evidenceDir: string;
  writeEvidence: boolean;
  preflight: boolean;
  json: boolean;
};

function normalizeEnvValue(value: unknown): string {
  return String(value ?? "").trim();
}

function enabled(value: unknown): boolean {
  return ["1", "true", "yes", "on", "enabled"].includes(normalizeEnvValue(value).toLowerCase());
}

function repoPath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, ...relativePath.replace(/\\/g, "/").split("/").filter(Boolean));
}

function safeGit(args: string[], rootDir = process.cwd(), fallback = "unknown"): string {
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

export function detectStorageTargetEnvironment(env: NodeJS.ProcessEnv = process.env): EnvironmentName {
  const values = [
    env.CRP_ENV,
    env.APP_ENV,
    env.DEPLOYMENT_ENV,
    env.ENVIRONMENT,
    env.NODE_ENV,
  ].map((value) => normalizeEnvValue(value).toLowerCase());

  if (values.some((value) => value === "production" || value === "prod")) return "production";
  if (values.some((value) => value === "staging" || value === "stage")) return "staging";
  return "local";
}

function configuredStorageRoot(env: NodeJS.ProcessEnv): string | null {
  return normalizeEnvValue(env.LOCAL_DOCUMENT_STORAGE_PATH || env.DOCUMENT_STORAGE_PATH) || null;
}

function detectObjectStorage(env: NodeJS.ProcessEnv) {
  const mode =
    normalizeEnvValue(env.CRP_ARTIFACT_STORAGE_MODE) ||
    normalizeEnvValue(env.DOCUMENT_STORAGE_MODE) ||
    normalizeEnvValue(env.ARTIFACT_STORAGE_MODE) ||
    normalizeEnvValue(env.STORAGE_MODE);
  const provider =
    normalizeEnvValue(env.CRP_ARTIFACT_STORAGE_PROVIDER) ||
    normalizeEnvValue(env.DOCUMENT_STORAGE_PROVIDER) ||
    normalizeEnvValue(env.STORAGE_PROVIDER) ||
    (["gcs", "s3", "object", "object-storage", "cloud"].includes(mode.toLowerCase()) ? mode : "");
  const bucket =
    normalizeEnvValue(env.CRP_ARTIFACT_STORAGE_BUCKET) ||
    normalizeEnvValue(env.DOCUMENT_STORAGE_BUCKET) ||
    normalizeEnvValue(env.GCS_BUCKET_NAME) ||
    normalizeEnvValue(env.GOOGLE_CLOUD_STORAGE_BUCKET) ||
    normalizeEnvValue(env.S3_BUCKET) ||
    normalizeEnvValue(env.AWS_S3_BUCKET);
  const objectMode = ["object", "object-storage", "cloud", "gcs", "s3"].includes(mode.toLowerCase());

  return {
    configured: objectMode && Boolean(provider) && Boolean(bucket),
    mode: mode || null,
    provider: provider || null,
    bucketConfigured: Boolean(bucket),
    liveNetworkCallsMade: false as const,
  };
}

function getIndentedBlock(source: string, anchorPattern: RegExp): string | null {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => anchorPattern.test(line));
  if (start < 0) return null;

  const anchorIndent = lines[start].match(/^(\s*)/)?.[1].length ?? 0;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && (line.match(/^(\s*)/)?.[1].length ?? 0) <= anchorIndent) break;
    block.push(line);
  }
  return block.join("\n");
}

function parseComposeEnvironmentStorageRoot(serviceBlock: string | null): string | null {
  if (!serviceBlock) return null;
  const mapMatch = serviceBlock.match(/^\s+LOCAL_DOCUMENT_STORAGE_PATH:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (mapMatch) return mapMatch[1].trim();
  const listMatch = serviceBlock.match(/^\s+-\s*LOCAL_DOCUMENT_STORAGE_PATH=([^\n]+)\s*$/m);
  return listMatch?.[1]?.trim() || null;
}

function parseComposeMounts(serviceBlock: string | null): ComposeMount[] {
  if (!serviceBlock) return [];
  const mounts: ComposeMount[] = [];
  const volumeEntries = serviceBlock.matchAll(/^\s+-\s*([^:\n]+):([^:\n]+)(?::[a-zA-Z]+)?\s*$/gm);

  for (const match of volumeEntries) {
    const source = match[1].trim().replace(/^["']|["']$/g, "");
    const target = match[2].trim().replace(/^["']|["']$/g, "");
    if (!source || !target) continue;
    mounts.push({
      source,
      target,
      type: source.startsWith(".") || source.startsWith("/") || /^[A-Za-z]:[\\/]/.test(source) ? "bind" : "volume",
    });
  }

  return mounts;
}

export function evaluateStorageDurabilityContract({
  env = process.env,
  targetEnvironment,
  rootDir = process.cwd(),
  composePath = null,
  serviceName = null,
}: {
  env?: NodeJS.ProcessEnv;
  targetEnvironment?: EnvironmentName | null;
  rootDir?: string;
  composePath?: string | null;
  serviceName?: string | null;
} = {}): StorageDurabilityContractReport {
  const resolvedEnvironment = targetEnvironment ?? detectStorageTargetEnvironment(env);
  const strictEnvironment = resolvedEnvironment === "staging" || resolvedEnvironment === "production";
  const objectStorage = detectObjectStorage(env);
  const errors: string[] = [];
  const warnings: string[] = [];
  let storageRoot = configuredStorageRoot(env);
  let durableLocal = {
    configured: false,
    source: null as string | null,
    target: null as string | null,
    type: null as "bind" | "volume" | "runtime-env" | null,
    explicitAck: enabled(env.CRP_DURABLE_LOCAL_STORAGE),
  };
  let compose = {
    checked: false,
    path: composePath,
    service: serviceName,
    serviceFound: false,
  };

  if (composePath) {
    compose = { ...compose, checked: true };
    const fullComposePath = path.isAbsolute(composePath) ? composePath : repoPath(rootDir, composePath);
    if (!existsSync(fullComposePath)) {
      errors.push(`Compose file not found: ${composePath}`);
    } else if (!serviceName) {
      errors.push("Compose service name is required when checking compose storage durability.");
    } else {
      const composeText = readFileSync(fullComposePath, "utf8");
      const serviceBlock = getIndentedBlock(composeText, new RegExp(`^\\s{2}${serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*$`));
      compose.serviceFound = Boolean(serviceBlock);
      if (!serviceBlock) {
        errors.push(`Compose service not found: ${serviceName}`);
      } else {
        storageRoot = parseComposeEnvironmentStorageRoot(serviceBlock) || storageRoot;
        const mounts = parseComposeMounts(serviceBlock);
        const matchingMount = mounts.find((mount) => mount.target === storageRoot || mount.target === EXPECTED_CONTAINER_STORAGE_ROOT);
        if (matchingMount) {
          durableLocal = {
            configured: true,
            source: matchingMount.source,
            target: matchingMount.target,
            type: matchingMount.type,
            explicitAck: true,
          };
        }
      }
    }
  }

  if (!durableLocal.configured && durableLocal.explicitAck && storageRoot) {
    durableLocal = {
      configured: true,
      source: storageRoot,
      target: storageRoot,
      type: "runtime-env",
      explicitAck: true,
    };
  }

  if (objectStorage.configured) {
    return {
      status: "passed",
      targetEnvironment: resolvedEnvironment,
      mode: "object-storage",
      storageRoot,
      objectStorage,
      durableLocal,
      compose,
      errors,
      warnings,
    };
  }

  if (durableLocal.configured && storageRoot) {
    return {
      status: errors.length === 0 ? "passed" : "failed",
      targetEnvironment: resolvedEnvironment,
      mode: "durable-local-mount",
      storageRoot,
      objectStorage,
      durableLocal,
      compose,
      errors,
      warnings,
    };
  }

  if (strictEnvironment && !storageRoot) {
    errors.push("Artifact storage root is missing. Set LOCAL_DOCUMENT_STORAGE_PATH or DOCUMENT_STORAGE_PATH and back it with object storage or a durable mount.");
  } else if (strictEnvironment) {
    errors.push("Artifact storage is local but no explicit durable mount/volume or object-storage configuration was found.");
  } else {
    warnings.push("Local artifact storage durability is not enforced outside staging/production mode.");
  }

  return {
    status: strictEnvironment ? "failed" : "passed",
    targetEnvironment: resolvedEnvironment,
    mode: storageRoot ? "unsafe-local" : "missing",
    storageRoot,
    objectStorage,
    durableLocal,
    compose,
    errors,
    warnings,
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runStorageSentinelDurabilitySimulation({
  writeStorageRoot,
  readStorageRoot = writeStorageRoot,
  cleanup = true,
}: {
  writeStorageRoot: string;
  readStorageRoot?: string;
  cleanup?: boolean;
}) {
  const previousLocal = process.env.LOCAL_DOCUMENT_STORAGE_PATH;
  const previousDocument = process.env.DOCUMENT_STORAGE_PATH;
  const sentinelPrefix = `.storage-durability-sentinel/${randomUUID()}`;
  const objectName = `${sentinelPrefix}/artifact.pdf`;
  const bytes = Buffer.from(`%PDF-1.4\nstorage durability sentinel ${randomUUID()}\n%%EOF\n`, "utf8");
  const expectedDigest = sha256(bytes);

  try {
    mkdirSync(writeStorageRoot, { recursive: true });
    process.env.LOCAL_DOCUMENT_STORAGE_PATH = writeStorageRoot;
    delete process.env.DOCUMENT_STORAGE_PATH;
    const storageUrl = await uploadFile(bytes.toString("base64"), objectName, "application/pdf");

    delete process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    process.env.DOCUMENT_STORAGE_PATH = readStorageRoot;
    const storedBytes = await readStoredFile(storageUrl);
    const actualDigest = sha256(storedBytes);
    const passed = actualDigest === expectedDigest;

    return {
      status: passed ? "passed" : "failed",
      storageUrl,
      expectedDigest,
      actualDigest,
      bytesWritten: bytes.length,
      boundarySimulation: "write LOCAL_DOCUMENT_STORAGE_PATH, read DOCUMENT_STORAGE_PATH from the same mounted root",
      error: passed ? null : "Digest mismatch after storage boundary simulation.",
    };
  } catch (error) {
    return {
      status: "failed",
      storageUrl: null,
      expectedDigest,
      actualDigest: null,
      bytesWritten: bytes.length,
      boundarySimulation: "write LOCAL_DOCUMENT_STORAGE_PATH, read DOCUMENT_STORAGE_PATH from the requested boundary root",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (previousLocal === undefined) delete process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    else process.env.LOCAL_DOCUMENT_STORAGE_PATH = previousLocal;
    if (previousDocument === undefined) delete process.env.DOCUMENT_STORAGE_PATH;
    else process.env.DOCUMENT_STORAGE_PATH = previousDocument;
    if (cleanup) {
      rmSync(path.join(writeStorageRoot, ".storage-durability-sentinel"), { recursive: true, force: true });
    }
  }
}

export function validateDeployWorkflowStoragePreflight({
  workflowText,
  environment,
  composePath,
  serviceName,
}: {
  workflowText: string;
  environment: EnvironmentName;
  composePath: string;
  serviceName: string;
}) {
  const requiredFragments = [
    "pnpm run storage:durability-contract --",
    `--environment ${environment}`,
    `--compose ${composePath}`,
    `--service ${serviceName}`,
    "--preflight",
    "--no-write-evidence",
  ];
  const missing = requiredFragments.filter((fragment) => !workflowText.includes(fragment));
  return {
    status: missing.length === 0 ? "passed" : "failed",
    missing,
  };
}

export async function buildStorageDurabilityEvidence({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
}: {
  rootDir?: string;
  generatedAt?: string;
} = {}) {
  const stagingContract = evaluateStorageDurabilityContract({
    targetEnvironment: "staging",
    rootDir,
    composePath: "docker-compose.yml",
    serviceName: STAGING_STORAGE_SERVICE,
  });
  const productionContract = evaluateStorageDurabilityContract({
    targetEnvironment: "production",
    rootDir,
    composePath: "docker-compose.production.yml",
    serviceName: PRODUCTION_STORAGE_SERVICE,
  });
  const simulationRoot = mkdtempSync(path.join(tmpdir(), "crp-storage-durability-"));
  const simulation = await runStorageSentinelDurabilitySimulation({ writeStorageRoot: simulationRoot });
  rmSync(simulationRoot, { recursive: true, force: true });

  const stagingWorkflow = readFileSync(repoPath(rootDir, ".github/workflows/deploy-staging.yml"), "utf8");
  const productionWorkflow = readFileSync(repoPath(rootDir, ".github/workflows/deploy-production.yml"), "utf8");
  const deployPreflight = {
    staging: validateDeployWorkflowStoragePreflight({
      workflowText: stagingWorkflow,
      environment: "staging",
      composePath: "docker-compose.yml",
      serviceName: STAGING_STORAGE_SERVICE,
    }),
    production: validateDeployWorkflowStoragePreflight({
      workflowText: productionWorkflow,
      environment: "production",
      composePath: "docker-compose.production.yml",
      serviceName: PRODUCTION_STORAGE_SERVICE,
    }),
  };
  const certifying =
    stagingContract.status === "passed" &&
    productionContract.status === "passed" &&
    simulation.status === "passed" &&
    deployPreflight.staging.status === "passed" &&
    deployPreflight.production.status === "passed";

  return {
    reportName: "storage-durability-contract",
    generatedAt,
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    auditTarget: "P0-2 Artifact storage is not certifiably durable across deploys or rollbacks.",
    evidenceType: "AUTOMATED_LOCAL_AND_STATIC_DEPLOY_PREFLIGHT",
    liveExternalProviderCallsMade: 0,
    certifying,
    CERTIFYING: certifying,
    productionReadyClaim: certifying ? "artifact-storage-contract-only" : false,
    contracts: {
      staging: stagingContract,
      production: productionContract,
    },
    sentinelSimulation: simulation,
    deployPreflight,
    commands: [
      "pnpm run storage:durability-contract",
      "pnpm exec vitest run --config vitest.config.ts tests/unit/storage-durability-contract.spec.ts tests/unit/report-artifact-storage.spec.ts tests/unit/evidence-attachment-storage.spec.ts tests/api/report-artifact-storage-reference.spec.ts",
      "git diff --check",
      "pnpm run check",
      "pnpm run production-scale:evidence",
    ],
  };
}

export function renderStorageDurabilityEvidenceMarkdown(report: Awaited<ReturnType<typeof buildStorageDurabilityEvidence>>): string {
  const lines = [
    "# Storage Durability Contract Evidence",
    "",
    `Generated: ${report.generatedAt}`,
    `Current HEAD: ${report.currentHead}`,
    `Audit target: ${report.auditTarget}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    "",
    "## Summary",
    "",
    `- Evidence type: ${report.evidenceType}`,
    `- Live external provider calls made: ${report.liveExternalProviderCallsMade}`,
    `- Staging contract: ${report.contracts.staging.status} (${report.contracts.staging.mode})`,
    `- Production contract: ${report.contracts.production.status} (${report.contracts.production.mode})`,
    `- Sentinel simulation: ${report.sentinelSimulation.status}`,
    `- Staging deploy preflight: ${report.deployPreflight.staging.status}`,
    `- Production deploy preflight: ${report.deployPreflight.production.status}`,
    "",
    "## Commands",
    "",
    ...report.commands.map((command) => `- \`${command}\``),
    "",
    "## Boundaries",
    "",
    "- Existing document storage helpers are preserved.",
    "- Object-storage configuration checks are static and do not call live GCS/S3.",
    "- Durable local storage requires an explicit compose mount or explicit runtime durability acknowledgement.",
    "- This evidence certifies only the artifact-storage durability contract, not broad production readiness.",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeStorageDurabilityEvidence(report: Awaited<ReturnType<typeof buildStorageDurabilityEvidence>>, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_STORAGE_DURABILITY_EVIDENCE_DIR,
} = {}) {
  const outputDir = repoPath(rootDir, evidenceDir);
  mkdirSync(outputDir, { recursive: true });
  const markdownPath = path.join(outputDir, STORAGE_DURABILITY_EVIDENCE_MARKDOWN);
  const jsonPath = path.join(outputDir, STORAGE_DURABILITY_EVIDENCE_JSON);
  writeFileSync(markdownPath, renderStorageDurabilityEvidenceMarkdown(report));
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    markdownPath: path.relative(rootDir, markdownPath).replace(/\\/g, "/"),
    jsonPath: path.relative(rootDir, jsonPath).replace(/\\/g, "/"),
  };
}

export function parseStorageDurabilityContractArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    environment: null,
    composePath: null,
    serviceName: null,
    evidenceDir: DEFAULT_STORAGE_DURABILITY_EVIDENCE_DIR,
    writeEvidence: true,
    preflight: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = () => {
      const next = args[index + 1];
      if (!next) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return next;
    };

    if (arg === "--environment" || arg === "--env") {
      const environment = value();
      if (!["local", "staging", "production"].includes(environment)) {
        throw new Error("--environment must be local, staging, or production.");
      }
      options.environment = environment as EnvironmentName;
    } else if (arg === "--compose") {
      options.composePath = value();
    } else if (arg === "--service") {
      options.serviceName = value();
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value();
    } else if (arg === "--preflight") {
      options.preflight = true;
      options.writeEvidence = false;
    } else if (arg === "--no-write-evidence") {
      options.writeEvidence = false;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: pnpm run storage:durability-contract -- [--environment staging|production] [--compose <path>] [--service <name>] [--preflight] [--no-write-evidence] [--json]");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function main() {
  const options = parseStorageDurabilityContractArgs(process.argv.slice(2));

  if (options.preflight || options.composePath || options.environment) {
    const report = evaluateStorageDurabilityContract({
      targetEnvironment: options.environment,
      composePath: options.composePath,
      serviceName: options.serviceName,
    });
    const output = JSON.stringify(report, null, 2);
    if (options.json || report.status === "failed") console.log(output);
    else console.log(`Storage durability contract passed for ${report.targetEnvironment}: ${report.mode}.`);
    if (report.status !== "passed") process.exit(1);
    return;
  }

  const report = await buildStorageDurabilityEvidence();
  if (options.writeEvidence) {
    const outputs = writeStorageDurabilityEvidence(report, { evidenceDir: options.evidenceDir });
    console.log(`Wrote ${outputs.markdownPath}`);
    console.log(`Wrote ${outputs.jsonPath}`);
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (!report.CERTIFYING) process.exit(1);
}

const executedPath = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (executedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
