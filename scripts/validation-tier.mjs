import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TIER_NAMES = ["fast", "changed", "staging", "release", "admin"];

const DEFAULT_STAGING_BASE_URL = "https://staging.creditregulatorpro.com";
const STRICT_SHA_RE = /^[0-9a-f]{40}$/i;

export const COMMANDS = {
  lintStatus: {
    id: "lintStatus",
    label: "Lint status",
    note: "No lint infrastructure is configured; tier continues with typecheck/build/tests.",
  },
  typecheck: {
    id: "typecheck",
    label: "TypeScript typecheck",
    command: "pnpm run typecheck",
  },
  build: {
    id: "build",
    label: "Application build",
    command: "pnpm run build",
  },
  goldenPath: {
    id: "goldenPath",
    label: "Golden path regression",
    command: "pnpm run test:golden-path",
  },
  unitCheck: {
    id: "unitCheck",
    label: "Full Vitest unit/API/contract suite",
    command: "pnpm run test:unit:check",
  },
  deterministicIngestion: {
    id: "deterministicIngestion",
    label: "Deterministic ingestion report",
    command: "pnpm run test:deterministic-ingestion-report",
  },
  creditRegression: {
    id: "creditRegression",
    label: "Credit parser regression",
    command: "pnpm run test:credit-regression",
  },
  tradelineInternal: {
    id: "tradelineInternal",
    label: "Tradeline internal regression",
    command: "pnpm run test:tradeline-internal",
  },
  violationCorrections: {
    id: "violationCorrections",
    label: "Violation correction regression",
    command: "pnpm run test:violation-corrections",
  },
  migrationsGate: {
    id: "migrationsGate",
    label: "Migration governance production gate",
    command: "pnpm run migrations:gate",
  },
  packetPdfCache: {
    id: "packetPdfCache",
    label: "Packet PDF cache-miss proof",
    command: "pnpm run packet-pdf:cache-miss-proof",
  },
  authSmoke: {
    id: "authSmoke",
    label: "Authenticated upload/results runtime smoke",
    command: "pnpm run smoke:auth-workflow",
    env: {
      CRP_AUTH_WORKFLOW_SMOKE: "true",
      STAGING_BASE_URL: DEFAULT_STAGING_BASE_URL,
    },
  },
  packetSmoke: {
    id: "packetSmoke",
    label: "Authenticated packet PDF runtime smoke",
    command: "pnpm run smoke:auth-workflow:packet",
    env: {
      CRP_AUTH_WORKFLOW_SMOKE: "true",
      CRP_AUTH_WORKFLOW_SMOKE_INCLUDE_PACKET: "true",
      STAGING_BASE_URL: DEFAULT_STAGING_BASE_URL,
    },
  },
  responseSoak: {
    id: "responseSoak",
    label: "Response soak check",
    command: "pnpm run response:soak-check",
  },
  storageDurability: {
    id: "storageDurability",
    label: "Storage durability contract",
    command: "pnpm run storage:durability-contract",
  },
  deployRollback: {
    id: "deployRollback",
    label: "Deploy rollback simulation",
    command: "pnpm run deploy:rollback-simulation",
  },
  productionScaleEvidence: {
    id: "productionScaleEvidence",
    label: "Production-scale evidence",
    command: "pnpm run production-scale:evidence",
  },
  productionPromotionPack: {
    id: "productionPromotionPack",
    label: "Production promotion pack",
    command: "pnpm run production-scale:promotion-pack",
  },
  productionPromotionGuard: {
    id: "productionPromotionGuard",
    label: "Production promotion guard",
    command: "pnpm run production-scale:promotion-guard",
  },
  adminStatic: {
    id: "adminStatic",
    label: "Admin route/role static tests",
    command:
      "pnpm exec vitest run --config vitest.config.ts tests/unit/admin-sidebar-routes.spec.ts tests/contracts/route-auth-classification.spec.ts tests/api/support-role-privacy-matrix.spec.ts",
  },
  adminClickThrough: {
    id: "adminClickThrough",
    label: "Admin click-through certification",
    command: "pnpm exec playwright test tests/e2e/admin-sidebar-routes.spec.ts tests/e2e/admin-security-functions.spec.ts",
  },
};

const FULL_BASELINE_COMMAND_IDS = [
  "typecheck",
  "build",
  "goldenPath",
  "unitCheck",
  "deterministicIngestion",
  "creditRegression",
  "tradelineInternal",
  "violationCorrections",
];

const RELEASE_SAFETY_COMMAND_IDS = [
  "migrationsGate",
  "packetPdfCache",
  "authSmoke",
  "packetSmoke",
  "responseSoak",
  "storageDurability",
  "deployRollback",
  "productionScaleEvidence",
  "productionPromotionPack",
  "productionPromotionGuard",
];

const ADMIN_CERTIFICATION_COMMAND_IDS = ["adminStatic", "adminClickThrough"];

const SUBSYSTEM_COMMANDS = {
  parserIngestion: ["deterministicIngestion", "creditRegression"],
  violationCompliance: ["tradelineInternal", "violationCorrections"],
  packetEvidence: [
    {
      id: "packetTargeted",
      label: "Packet/evidence targeted tests",
      command:
        "pnpm exec vitest run --config vitest.config.ts tests/unit/dispute-packet-template.spec.ts tests/unit/dispute-packet-pdf.spec.ts tests/unit/dispute-packet-humanization.spec.ts tests/api/packet-lifecycle-endpoint.spec.ts",
    },
  ],
  authRoles: [
    {
      id: "authRoleTargeted",
      label: "Auth/role targeted tests",
      command:
        "pnpm exec vitest run --config vitest.config.ts tests/api/auth-session-lifecycle-endpoint.spec.ts tests/api/support-role-privacy-matrix.spec.ts tests/contracts/route-auth-classification.spec.ts",
    },
  ],
  adminCritical: ["adminStatic"],
  migrations: ["migrationsGate"],
};

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

function safeGit(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

function hasGitRevision(revision) {
  if (!revision || /^0{40}$/.test(revision)) return false;
  try {
    git(["cat-file", "-e", `${revision}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function splitChangedFiles(value) {
  return String(value ?? "")
    .split(/[\r\n,]+/)
    .map((entry) => normalizePath(entry.trim()))
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = [...argv];
  let tier = args.shift();
  const options = {
    base: process.env.VALIDATION_BASE_SHA || "",
    head: process.env.VALIDATION_HEAD_SHA || "HEAD",
    dryRun: false,
    forceFullRegression: false,
    requireAdmin: false,
    changedFiles: splitChangedFiles(process.env.VALIDATION_CHANGED_FILES),
  };

  if (!tier || tier.startsWith("--")) {
    args.unshift(tier ?? "");
    tier = "";
  }

  if (tier === "certify:admin") tier = "admin";
  if (!TIER_NAMES.includes(tier)) {
    throw new Error(`Usage: node scripts/validation-tier.mjs <${TIER_NAMES.join("|")}> [options]`);
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--") continue;
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--force-full-regression") {
      options.forceFullRegression = true;
      continue;
    }
    if (arg === "--require-admin") {
      options.requireAdmin = true;
      continue;
    }
    if (arg === "--base") {
      options.base = args[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      options.base = arg.slice("--base=".length);
      continue;
    }
    if (arg === "--head") {
      options.head = args[index + 1] ?? "HEAD";
      index += 1;
      continue;
    }
    if (arg.startsWith("--head=")) {
      options.head = arg.slice("--head=".length) || "HEAD";
      continue;
    }
    if (arg === "--changed-file") {
      options.changedFiles.push(normalizePath(args[index + 1] ?? ""));
      index += 1;
      continue;
    }
    if (arg.startsWith("--changed-file=")) {
      options.changedFiles.push(normalizePath(arg.slice("--changed-file=".length)));
      continue;
    }
    throw new Error(`Unknown validation option '${arg}'`);
  }

  return { tier, options };
}

export function collectChangedFiles(options = {}) {
  const explicit = unique((options.changedFiles ?? []).map(normalizePath));
  if (explicit.length > 0) return explicit;

  const dirtyFiles = unique([
    ...splitChangedFiles(safeGit(["diff", "--name-only", "HEAD"])),
    ...splitChangedFiles(safeGit(["diff", "--cached", "--name-only"])),
    ...splitChangedFiles(safeGit(["ls-files", "--others", "--exclude-standard"])),
  ]);
  if (dirtyFiles.length > 0) return dirtyFiles;

  const head = options.head || "HEAD";
  const base = options.base;
  if (hasGitRevision(base) && hasGitRevision(head)) {
    return unique(splitChangedFiles(safeGit(["diff", "--name-only", `${base}..${head}`])));
  }

  if (hasGitRevision(`${head}^`) && hasGitRevision(head)) {
    return unique(splitChangedFiles(safeGit(["diff", "--name-only", `${head}^..${head}`])));
  }

  return [];
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

export function classifyChangedFiles(files) {
  const normalizedFiles = unique(files.map(normalizePath));
  const docsOnly = normalizedFiles.length > 0 && normalizedFiles.every((file) =>
    file.endsWith(".md") ||
    file.startsWith("docs/") ||
    file.startsWith(".github/pull_request_template") ||
    file.startsWith("README"),
  );

  const parserIngestion = normalizedFiles.some((file) =>
    matchesAny(file, [
      /^helpers\/.*(parser|parse|ingest|canonical|tradeline|bureau|creditReport|transunion|equifax)/i,
      /^scripts\/.*(ingest|parser|credit-report|deterministic)/i,
      /^endpoints\/.*(ingest|parser|upload|report-artifact)/i,
      /^tests\/(unit|api|extraction)\/.*(parser|ingest|credit|deterministic|tradeline)/i,
    ]),
  );
  const violationCompliance = normalizedFiles.some((file) =>
    matchesAny(file, [
      /^helpers\/.*(violation|compliance|regulation|detector|finding)/i,
      /^endpoints\/.*(violation|compliance|regulation)/i,
      /^tests\/.*(violation|compliance|regulation|legal-authority)/i,
    ]),
  );
  const packetEvidence = normalizedFiles.some((file) =>
    matchesAny(file, [
      /^helpers\/.*(packet|dispute|evidence|pdf)/i,
      /^endpoints\/.*(packet|evidence|responses)/i,
      /^pages\/.*(packet|response|upload-results|upload-review)/i,
      /^components\/.*(Packet|Evidence|Response|UploadScan)/,
      /^tests\/.*(packet|evidence|response-document|upload-processing)/i,
    ]),
  );
  const authRoles = normalizedFiles.some((file) =>
    matchesAny(file, [
      /^helpers\/.*(auth|role|session|permission|visibility)/i,
      /^endpoints\/auth\//i,
      /^endpoints\/.*(session|login|role|support)/i,
      /^tests\/.*(auth|role|permission|privacy|route-auth)/i,
      /^server\.ts$/i,
    ]),
  );
  const migrations = normalizedFiles.some((file) =>
    matchesAny(file, [
      /^migrations\//i,
      /^scripts\/.*migration/i,
      /^helpers\/.*schema/i,
      /^tests\/.*migration/i,
    ]),
  );
  const adminCritical = normalizedFiles.some((file) =>
    matchesAny(file, [
      /^pages\/admin/i,
      /^components\/.*Admin/i,
      /^helpers\/admin/i,
      /^endpoints\/admin\//i,
      /^tests\/.*admin/i,
      /^App\.tsx$/i,
      /^server\.ts$/i,
      /^helpers\/adminSidebarRoutes\.ts$/i,
    ]),
  );
  const workflowOnly = normalizedFiles.length > 0 && normalizedFiles.every((file) =>
    file === "package.json" ||
    file.startsWith(".github/") ||
    file.startsWith(".agents/") ||
    file.startsWith("scripts/") ||
    file.startsWith("docs/") ||
    file === "AGENTS.md",
  );
  const fullRegressionRequired =
    normalizedFiles.length === 0 ||
    parserIngestion ||
    violationCompliance ||
    packetEvidence ||
    authRoles ||
    migrations ||
    adminCritical;

  return {
    files: normalizedFiles,
    docsOnly,
    workflowOnly,
    parserIngestion,
    violationCompliance,
    packetEvidence,
    authRoles,
    migrations,
    adminCritical,
    fullRegressionRequired,
  };
}

function existingDirectTestFiles(files) {
  return files.filter((file) => /^tests\/.*\.spec\.tsx?$/.test(file) && existsSync(file));
}

function relatedTestFiles(files) {
  const candidates = [];
  for (const file of files) {
    const parsed = path.posix.parse(file);
    const stem = parsed.name.replace(/\.(test|spec)$/i, "");
    if (file.startsWith("helpers/")) candidates.push(`tests/unit/${stem}.spec.ts`);
    if (file.startsWith("components/") || file.startsWith("pages/")) {
      candidates.push(`tests/unit/${stem}.spec.tsx`, `tests/unit/${stem}.spec.ts`);
    }
    if (file.startsWith("endpoints/")) candidates.push(`tests/api/${stem}.spec.ts`);
    if (file.startsWith("scripts/")) candidates.push(`tests/unit/${stem}.spec.ts`);
  }
  return unique(candidates.map(normalizePath).filter((file) => existsSync(file)));
}

function targetedVitestCommand(id, label, files) {
  const testFiles = unique(files);
  if (testFiles.length === 0) return null;
  return {
    id,
    label,
    command: `pnpm exec vitest run --config vitest.config.ts ${testFiles.join(" ")}`,
  };
}

function commandFromId(commandOrId) {
  if (typeof commandOrId === "string") return COMMANDS[commandOrId];
  return commandOrId;
}

function pushCommand(queue, commandOrId) {
  const command = commandFromId(commandOrId);
  if (!command) return;
  if (queue.some((entry) => (entry.command ?? entry.note) === (command.command ?? command.note))) return;
  queue.push(command);
}

function appendChangedAreaCommands(queue, classification) {
  const directTests = existingDirectTestFiles(classification.files);
  const relatedTests = relatedTestFiles(classification.files);
  pushCommand(queue, targetedVitestCommand("changedTests", "Changed/related Vitest tests", [...directTests, ...relatedTests]));

  for (const key of ["parserIngestion", "violationCompliance", "packetEvidence", "authRoles", "adminCritical", "migrations"]) {
    if (!classification[key]) continue;
    for (const command of SUBSYSTEM_COMMANDS[key] ?? []) pushCommand(queue, command);
  }
}

export function adminClickThroughAvailable(env = process.env) {
  if (env.E2E_ADMIN_EMAIL && env.E2E_ADMIN_PASSWORD) return true;
  const baseUrl = env.E2E_BASE_URL || "http://localhost:5175";
  return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(baseUrl);
}

export function buildValidationPlan({ tier, changedFiles = [], forceFullRegression = false, requireAdmin = false } = {}) {
  if (!TIER_NAMES.includes(tier)) throw new Error(`Unknown validation tier '${tier}'`);
  const classification = classifyChangedFiles(changedFiles);
  const queue = [];
  const fullRegression = forceFullRegression || classification.fullRegressionRequired;
  const adminRequired = requireAdmin || (tier === "release" && classification.adminCritical);

  if (tier === "fast") {
    pushCommand(queue, "typecheck");
    appendChangedAreaCommands(queue, classification);
  } else if (tier === "changed") {
    pushCommand(queue, "typecheck");
    appendChangedAreaCommands(queue, classification);
    if (fullRegression && !classification.docsOnly) pushCommand(queue, "goldenPath");
  } else if (tier === "staging") {
    pushCommand(queue, "lintStatus");
    pushCommand(queue, "typecheck");
    pushCommand(queue, "build");
    if (fullRegression && !classification.docsOnly) {
      for (const id of FULL_BASELINE_COMMAND_IDS.filter((entry) => !["typecheck", "build"].includes(entry))) {
        pushCommand(queue, id);
      }
      if (classification.migrations) pushCommand(queue, "migrationsGate");
    } else {
      appendChangedAreaCommands(queue, classification);
    }
  } else if (tier === "release") {
    pushCommand(queue, "lintStatus");
    for (const id of FULL_BASELINE_COMMAND_IDS) pushCommand(queue, id);
    for (const id of RELEASE_SAFETY_COMMAND_IDS) pushCommand(queue, id);
    if (adminRequired) {
      for (const id of ADMIN_CERTIFICATION_COMMAND_IDS) pushCommand(queue, id);
    }
  } else if (tier === "admin") {
    for (const id of ADMIN_CERTIFICATION_COMMAND_IDS) pushCommand(queue, id);
  }

  return {
    tier,
    changedFiles: classification.files,
    classification,
    fullRegression,
    adminRequired,
    commands: queue,
  };
}

function runCommand(entry, { dryRun }) {
  if (entry.note) {
    console.log(`[validation] ${entry.label}: ${entry.note}`);
    return;
  }
  console.log(`[validation] ${entry.label}: ${entry.command}`);
  if (dryRun) return;
  const result = spawnSync(entry.command, {
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(entry.env ?? {}),
    },
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${entry.label} failed with exit code ${result.status ?? 1}`);
  }
}

function renderPlan(plan) {
  console.log(`[validation] tier=${plan.tier}`);
  console.log(`[validation] changed_files=${plan.changedFiles.length ? plan.changedFiles.join(", ") : "unknown-or-none"}`);
  console.log(`[validation] full_regression=${plan.fullRegression ? "yes" : "no"}`);
  console.log(`[validation] admin_click_through_required=${plan.adminRequired ? "yes" : "no"}`);
  console.log("[validation] commands:");
  for (const command of plan.commands) {
    console.log(`- ${command.command ?? command.note}`);
  }
}

function main() {
  try {
    const { tier, options } = parseArgs(process.argv.slice(2));
    const changedFiles = collectChangedFiles(options);
    const plan = buildValidationPlan({
      tier,
      changedFiles,
      forceFullRegression: options.forceFullRegression,
      requireAdmin: options.requireAdmin,
    });

    renderPlan(plan);

    if (plan.adminRequired && !adminClickThroughAvailable(process.env)) {
      throw new Error(
        "Admin click-through certification is required but E2E admin credentials are unavailable. Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD or run against localhost with local admin auth.",
      );
    }

    for (const command of plan.commands) runCommand(command, { dryRun: options.dryRun });
    console.log(`[validation] COMPLETE: ${tier} validation passed.`);
  } catch (error) {
    console.error(`[validation] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
