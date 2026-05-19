import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type ReadinessCommand = {
  label: string;
  command: string;
  args: string[];
  required: boolean;
};

type GitRunner = (args: string[]) => string;
type FileExists = (path: string) => boolean;

type BuildReportOptions = {
  cwd?: string;
  enforceClean?: boolean;
  runGit?: GitRunner;
  fileExists?: FileExists;
};

export const REPORT_SAFETY_BOUNDARIES = {
  modifiesFiles: false,
  callsProductionEndpoints: false,
  touchesProductionDb: false,
  createsData: false,
  promotesProduction: false,
  activatesRuntimeBridgeMappings: false,
  createsPackets: false,
  usesRealConsumerData: false,
};

export const READINESS_LEVELS = [
  {
    name: "Controlled Production Ready",
    meaning: "Bounded production operation within the documented scope; unsupported or uncertain cases fail closed.",
  },
  {
    name: "General Production Ready",
    meaning: "Broader endpoint-backed user flows, admin correction classification, backup/restore verification, and monitoring are in place.",
  },
  {
    name: "Scale Production Ready",
    meaning: "Sustained monitoring, alert delivery, restore drills, broader fixtures, outcome tracking, and production-scale coverage are proven.",
  },
];

export const REQUIRED_OPERATOR_FILES = [
  "docs/limited-beta-operator-launch-policy.md",
  "docs/production-readiness-checklist.md",
  "scripts/production-readiness-gate.mjs",
  "scripts/promote-production.mjs",
  "scripts/golden-path-regression-dashboard.ts",
  "tests/unit/public-static-dev-assets.spec.ts",
  "tests/api/packet-lifecycle-endpoint.spec.ts",
  "tests/db/local-db-harness.spec.ts",
];

export const CORE_READINESS_COMMANDS: ReadinessCommand[] = [
  {
    label: "public-static internal exposure guard",
    command: "pnpm",
    args: ["exec", "vitest", "run", "tests/unit/public-static-dev-assets.spec.ts"],
    required: true,
  },
  {
    label: "packet lifecycle endpoint coverage",
    command: "pnpm",
    args: ["exec", "vitest", "run", "tests/api/packet-lifecycle-endpoint.spec.ts"],
    required: true,
  },
  {
    label: "Golden Path",
    command: "pnpm",
    args: ["run", "test:golden-path"],
    required: true,
  },
  {
    label: "contracts",
    command: "pnpm",
    args: ["run", "test:contracts"],
    required: true,
  },
  {
    label: "API tests",
    command: "pnpm",
    args: ["run", "test:api"],
    required: true,
  },
  {
    label: "typecheck",
    command: "pnpm",
    args: ["run", "typecheck"],
    required: true,
  },
  {
    label: "diff whitespace check",
    command: "git",
    args: ["diff", "--check"],
    required: true,
  },
];

export const ROLLBACK_SHA_REMINDER =
  "Record the current production SHA before promotion and keep it as the rollback target.";

function defaultRunGit(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function normalizeCommand(command: ReadinessCommand): string {
  return [command.command, ...command.args].join(" ");
}

function readGitValue(runGit: GitRunner, args: string[], fallback = "unknown"): string {
  try {
    const value = runGit(args).trim();
    return value.length > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

export function parseArgs(argv: string[]) {
  const flags = new Set(argv);
  return {
    json: flags.has("--json"),
    runChecks: flags.has("--run-checks"),
    enforceClean: flags.has("--enforce-clean"),
  };
}

export function buildProductionReadinessReport(options: BuildReportOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? defaultRunGit;
  const fileExists = options.fileExists ?? existsSync;
  const statusShort = readGitValue(runGit, ["status", "--short"], "");
  const requiredFiles = REQUIRED_OPERATOR_FILES.map((path) => ({
    path,
    exists: fileExists(`${cwd}/${path}`) || fileExists(path),
  }));
  const missingRequiredFiles = requiredFiles.filter((file) => !file.exists).map((file) => file.path);
  const clean = statusShort.length === 0;
  const dirtyBlocked = options.enforceClean === true && !clean;

  return {
    status: dirtyBlocked || missingRequiredFiles.length > 0 ? "blocked" : "review_required",
    git: {
      branch: readGitValue(runGit, ["branch", "--show-current"]),
      clean,
      statusShort,
      latestCommit: readGitValue(runGit, ["rev-parse", "HEAD"]),
      latestSubject: readGitValue(runGit, ["log", "-1", "--pretty=%s"]),
    },
    safety: REPORT_SAFETY_BOUNDARIES,
    requiredFiles,
    missingRequiredFiles,
    readinessLevels: READINESS_LEVELS,
    requiredChecks: CORE_READINESS_COMMANDS.map((check) => ({
      label: check.label,
      command: normalizeCommand(check),
      required: check.required,
    })),
    rollbackReminder: ROLLBACK_SHA_REMINDER,
    operatorDecision:
      dirtyBlocked
        ? "Stop: working tree is dirty and --enforce-clean was requested."
        : "Review the checklist, run required checks, record rollback SHA, then decide whether promotion is controlled-production ready.",
  };
}

function renderReport(report: ReturnType<typeof buildProductionReadinessReport>): string {
  const lines = [
    "Production Readiness Report",
    "",
    `Status: ${report.status}`,
    `Branch: ${report.git.branch}`,
    `Latest commit: ${report.git.latestCommit}`,
    `Latest subject: ${report.git.latestSubject}`,
    `Working tree clean: ${report.git.clean ? "yes" : "no"}`,
    "",
    "Required operator files:",
    ...report.requiredFiles.map((file) => `- ${file.exists ? "OK" : "MISSING"} ${file.path}`),
    "",
    "Required local checks:",
    ...report.requiredChecks.map((check) => `- ${check.command}`),
    "",
    "Readiness levels:",
    ...report.readinessLevels.map((level) => `- ${level.name}: ${level.meaning}`),
    "",
    `Rollback reminder: ${report.rollbackReminder}`,
    "",
    "Safety boundaries:",
    ...Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value}`),
    "",
    `Operator decision: ${report.operatorDecision}`,
  ];

  if (!report.git.clean && report.git.statusShort) {
    lines.push("", "Dirty working tree files:", report.git.statusShort);
  }

  return lines.join("\n");
}

function runCheck(check: ReadinessCommand) {
  const result = process.platform === "win32" && check.command === "pnpm"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", normalizeCommand(check)], { stdio: "inherit" })
    : spawnSync(check.command, check.args, { stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error(`${check.label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildProductionReadinessReport({ enforceClean: options.enforceClean });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderReport(report));
  }

  if (report.status === "blocked") {
    process.exit(1);
  }

  if (options.runChecks) {
    for (const check of CORE_READINESS_COMMANDS) {
      console.log(`\n[RUN] ${check.label}`);
      runCheck(check);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
