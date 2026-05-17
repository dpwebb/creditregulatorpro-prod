import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type DashboardStatus = "PASS" | "FAIL" | "SKIP" | "MANUAL" | "OPEN" | "INFO";

export type DashboardCheck = {
  name: string;
  status: DashboardStatus;
  command?: string;
  notes: string;
  kind: "repository" | "local-test" | "endpoint-test" | "smoke" | "manual" | "gap" | "info";
  runByDefault?: boolean;
  requiresCredentials?: boolean;
};

export type DashboardCategory = {
  name: string;
  checks: DashboardCheck[];
};

type GitRunner = (args: string[]) => string;
type FileExists = (path: string) => boolean;
type CommandRunner = (command: string) => number;

type BuildDashboardOptions = {
  cwd?: string;
  runGit?: GitRunner;
  fileExists?: FileExists;
};

export const DASHBOARD_SAFETY_BOUNDARIES = {
  modifiesFiles: false,
  callsProductionWithCredentials: false,
  touchesProductionDb: false,
  createsData: false,
  promotesProduction: false,
  activatesRuntimeBridgeMappings: false,
  generatesPackets: false,
  usesRealConsumerData: false,
  runsAuthenticatedSmokeByDefault: false,
};

export const SAFE_RUN_CHECK_COMMANDS = [
  "pnpm exec vitest run tests/unit/public-static-dev-assets.spec.ts",
  "pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/evidence-location-index.spec.ts",
  "pnpm exec vitest run tests/unit/legal-reference-language.spec.ts",
  "pnpm run test:golden-path",
  "pnpm run test:contracts",
  "pnpm run test:api",
  "pnpm run typecheck",
];

export const GATED_SMOKE_CHECKS = [
  {
    name: "Reconciliation Candidates UI smoke",
    command: "pnpm run smoke:reconciliation-candidates-ui",
    notes: "Manual/gated staging smoke. Requires CRP_RECONCILIATION_CANDIDATE_UI_SMOKE=true and safe admin context.",
  },
  {
    name: "Runtime Bridge Mapping smoke",
    command: "pnpm run smoke:runtime-bridge-mapping",
    notes: "Manual/gated staging smoke. Requires CRP_RUNTIME_BRIDGE_MAPPING_SMOKE=true and safe admin context.",
  },
  {
    name: "Runtime Bridge Mapping UI smoke",
    command: "pnpm run smoke:runtime-bridge-mapping-ui",
    notes: "Manual/gated staging smoke. Requires CRP_RUNTIME_BRIDGE_MAPPING_UI_SMOKE=true and safe admin context.",
  },
  {
    name: "Advisory Bridge Report smoke",
    command: "pnpm run smoke:advisory-bridge-report",
    notes: "Manual/gated staging smoke. Requires CRP_ADVISORY_BRIDGE_REPORT_SMOKE=true and safe admin context.",
  },
  {
    name: "Authenticated Workflow smoke",
    command: "pnpm run smoke:auth-workflow",
    notes: "Manual/gated synthetic-user staging smoke. Requires CRP_AUTH_WORKFLOW_SMOKE=true and cleanup enabled.",
  },
];

export const KNOWN_SCALE_GAPS = [
  "Auth/session/logout lifecycle endpoint coverage still needs expansion.",
  "Admin audit-log filtering and sanitization coverage still needs expansion.",
  "Packet delivery/status/send endpoint coverage still needs expansion.",
  "Outcome tracking is not implemented.",
  "Admin correction candidate classification remains future work.",
  "Formal rule/version approval workflow remains future work.",
  "Backup/restore verification remains future work.",
  "Monitoring and alert delivery remain future work.",
  "Broader anonymized real-world fixtures are still needed.",
  "No admin override exists and it should remain absent.",
  "DB registry remains non-runtime governance metadata.",
  "Static runtime mappings remain active runtime truth.",
];

function defaultRunGit(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readGitValue(runGit: GitRunner, args: string[], fallback = "unknown"): string {
  try {
    const value = runGit(args).trim();
    return value.length > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function repoFileExists(cwd: string, fileExists: FileExists, path: string): boolean {
  return fileExists(`${cwd}/${path}`) || fileExists(path);
}

function normalizeCategoryName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function check(
  name: string,
  status: DashboardStatus,
  notes: string,
  details: Partial<DashboardCheck> = {},
): DashboardCheck {
  return {
    name,
    status,
    notes,
    kind: details.kind ?? "local-test",
    command: details.command,
    runByDefault: details.runByDefault ?? false,
    requiresCredentials: details.requiresCredentials ?? false,
  };
}

export function parseArgs(argv: string[]) {
  const flags = new Set(argv);
  const categoryIndex = argv.indexOf("--category");
  return {
    json: flags.has("--json"),
    runChecks: flags.has("--run-checks"),
    listChecks: flags.has("--list-checks"),
    category: categoryIndex >= 0 ? argv[categoryIndex + 1] ?? "" : "",
  };
}

export function buildOperatorDashboard(options: BuildDashboardOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? defaultRunGit;
  const fileExists = options.fileExists ?? existsSync;
  const statusShort = readGitValue(runGit, ["status", "--short"], "");
  const branch = readGitValue(runGit, ["branch", "--show-current"]);
  const commit = readGitValue(runGit, ["rev-parse", "HEAD"]);
  const subject = readGitValue(runGit, ["log", "-1", "--pretty=%s"]);
  const clean = statusShort.length === 0;
  const checklistExists = repoFileExists(cwd, fileExists, "docs/production-readiness-checklist.md");
  const readinessReportExists = repoFileExists(cwd, fileExists, "scripts/production-readiness-report.ts");

  const categories: DashboardCategory[] = [
    {
      name: "Repository / Release State",
      checks: [
        check("Working tree clean", clean ? "PASS" : "FAIL", clean ? "No uncommitted changes." : statusShort, {
          kind: "repository",
        }),
        check("Branch", "INFO", branch, { kind: "repository" }),
        check("Commit", "INFO", `${commit} ${subject}`, { kind: "repository" }),
        check(
          "Production-readiness checklist exists",
          checklistExists ? "PASS" : "FAIL",
          "docs/production-readiness-checklist.md",
          { kind: "repository" },
        ),
        check(
          "Production-readiness report exists",
          readinessReportExists ? "PASS" : "FAIL",
          "scripts/production-readiness-report.ts",
          { kind: "repository" },
        ),
      ],
    },
    {
      name: "Core Logical Regression",
      checks: [
        check("Golden Path", "SKIP", "Logical chain: upload, parse, canonical map, issue detection, evidence bind, packet, PDF.", {
          command: "pnpm run test:golden-path",
          runByDefault: true,
        }),
        check("Deterministic ingestion report", "SKIP", "Available local parser/replay/evidence coverage report; not part of default dashboard run.", {
          command: "pnpm run test:deterministic-ingestion-report",
        }),
        check("Typecheck", "SKIP", "TypeScript compile safety.", {
          command: "pnpm run typecheck",
          runByDefault: true,
        }),
        check("Contracts", "SKIP", "Contract suite.", {
          command: "pnpm run test:contracts",
          runByDefault: true,
        }),
        check("API suite", "SKIP", "Endpoint/API regression suite.", {
          kind: "endpoint-test",
          command: "pnpm run test:api",
          runByDefault: true,
        }),
      ],
    },
    {
      name: "Packet Reliability",
      checks: [
        check("Packet lifecycle endpoint", "SKIP", "Endpoint-backed readiness/build/create/PDF/non-owner/stale-ID coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts",
          runByDefault: true,
        }),
        check("Packet readiness", "SKIP", "Helper and endpoint readiness fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/packet-readiness.spec.ts",
        }),
        check("Packet PDF", "SKIP", "Packet PDF rendering tests are available but not in the default bounded run.", {
          command: "pnpm exec vitest run tests/unit/dispute-packet-pdf.spec.ts",
        }),
      ],
    },
    {
      name: "Report Ingest / Retrieval",
      checks: [
        check(
          "Report ingest lifecycle endpoint",
          "SKIP",
          "Endpoint-backed auth, ownership, upload contract, process/failure behavior, report list/detail, Stage Lab separation, and privacy expectations.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Parser Lab run endpoint", "SKIP", "Stage Lab controlled scanned-PDF 400 behavior and sideEffects:none coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/unit/parser-lab-run-endpoint.spec.ts",
        }),
        check("Credit-report PDF eligibility", "SKIP", "Upload PDF eligibility and scanned/image-only fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/credit-report-pdf-eligibility.spec.ts",
        }),
        check("Deterministic OCR readiness", "SKIP", "OCR readiness and provenance fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/deterministic-ocr-readiness.spec.ts",
        }),
      ],
    },
    {
      name: "Violation Search / Status",
      checks: [
        check(
          "Violation search/status endpoint",
          "SKIP",
          "Endpoint-backed ownership, supported filters/status, dismiss/delete contract, packet-readiness consistency, privacy/audit expectations, and non-owner denial.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Violation search preservation", "SKIP", "Helper-level compatibility coverage for issue search fields and stable violation indexing.", {
          command: "pnpm exec vitest run tests/unit/violation-search-preservation.spec.ts",
        }),
        check("Creditor-validation auth", "SKIP", "Additional endpoint auth boundary coverage for creditor-validation paths.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/creditor-validation-auth.spec.ts",
        }),
      ],
    },
    {
      name: "Evidence / Coordinate Coverage",
      checks: [
        check(
          "Evidence privacy endpoint",
          "SKIP",
          "Endpoint-backed auth/ownership, attachment behavior, compact evidence metadata, no raw text/full SIN/full account/storage-secret leakage, audit expectations, and runtime-safety boundaries.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Evidence location index", "SKIP", "Evidence sidecar, page, OCR/native coordinates, and safe omission behavior.", {
          command: "pnpm exec vitest run tests/unit/evidence-location-index.spec.ts",
          runByDefault: true,
        }),
        check("OCR coordinates", "SKIP", "Tesseract TSV coordinate matching and fail-closed omissions.", {
          command: "pnpm exec vitest run tests/unit/ocr-evidence-coordinates.spec.ts",
        }),
        check("Native PDF coordinates", "SKIP", "pdfjs coordinate sidecar matching and fail-closed omissions.", {
          command: "pnpm exec vitest run tests/unit/pdfjs-evidence-coordinates.spec.ts",
        }),
        check("Complex real-world coordinate fixtures", "OPEN", "More anonymized real-world layouts remain future coverage.", {
          kind: "gap",
        }),
      ],
    },
    {
      name: "Regulation / Governance",
      checks: [
        check("Legal-reference language", "SKIP", "Consumer wording stays neutral and reference-based.", {
          command: "pnpm exec vitest run tests/unit/legal-reference-language.spec.ts",
          runByDefault: true,
        }),
        check("Regulation reconciliation", "SKIP", "Static-vs-DB reconciliation helper coverage.", {
          command: "pnpm exec vitest run tests/unit/regulation-reference-reconciliation.spec.ts",
        }),
        check("Reconciliation candidate API", "SKIP", "Endpoint-backed inert candidate lifecycle coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-reconciliation-candidates-endpoint.spec.ts",
        }),
        check("Runtime bridge mapping API", "SKIP", "Endpoint-backed governance-only bridge mapping coverage.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-runtime-bridge-mappings-endpoint.spec.ts",
        }),
        check("Shadow bridge diagnostics", "SKIP", "Endpoint-backed shadow report remains read-only and non-runtime.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-shadow-bridge-report-endpoint.spec.ts",
        }),
        check("Advisory bridge diagnostics", "SKIP", "Endpoint-backed advisory report remains admin/internal and non-runtime.", {
          kind: "endpoint-test",
          command: "pnpm exec vitest run tests/api/regulation-advisory-bridge-report-endpoint.spec.ts",
        }),
        check("DB registry runtime status", "INFO", "DB registry remains non-runtime governance metadata.", {
          kind: "info",
        }),
        check("Runtime selector status", "INFO", "No runtime selector exists; static runtime mappings remain active truth.", {
          kind: "info",
        }),
      ],
    },
    {
      name: "Public / Internal Exposure",
      checks: [
        check("Public static guard", "SKIP", "Guards internal docs and confidential PDFs out of public/static/output paths.", {
          kind: "local-test",
          command: "pnpm exec vitest run tests/unit/public-static-dev-assets.spec.ts",
          runByDefault: true,
        }),
        check("Internal docs under static/output", "INFO", "Covered by the public-static guard.", {
          kind: "info",
        }),
        check("Confidential PDF under output/pdf", "INFO", "Covered by the public-static guard.", {
          kind: "info",
        }),
      ],
    },
    {
      name: "Manual / Gated Smoke",
      checks: GATED_SMOKE_CHECKS.map((smoke) =>
        check(smoke.name, "MANUAL", smoke.notes, {
          kind: "smoke",
          command: smoke.command,
          requiresCredentials: true,
        }),
      ),
    },
    {
      name: "Known Coverage Gaps",
      checks: KNOWN_SCALE_GAPS.map((gap) => check(gap, "OPEN", gap, { kind: "gap" })),
    },
  ];

  return finalizeDashboard({
    generatedAt: new Date().toISOString(),
    branch,
    commit,
    workingTreeClean: clean,
    safety: DASHBOARD_SAFETY_BOUNDARIES,
    categories,
    knownGaps: KNOWN_SCALE_GAPS,
  });
}

function flattenChecks(categories: DashboardCategory[]): DashboardCheck[] {
  return categories.flatMap((category) => category.checks);
}

function buildSummary(categories: DashboardCategory[]) {
  const summary = { pass: 0, fail: 0, skip: 0, manual: 0, open: 0, info: 0 };
  for (const item of flattenChecks(categories)) {
    const key = item.status.toLowerCase() as keyof typeof summary;
    summary[key] += 1;
  }
  return summary;
}

function finalizeDashboard(report: {
  generatedAt: string;
  branch: string;
  commit: string;
  workingTreeClean: boolean;
  safety: typeof DASHBOARD_SAFETY_BOUNDARIES;
  categories: DashboardCategory[];
  knownGaps: string[];
}) {
  return {
    ...report,
    summary: buildSummary(report.categories),
  };
}

export function filterDashboard(report: ReturnType<typeof buildOperatorDashboard>, category: string) {
  const normalized = normalizeCategoryName(category);
  if (!normalized) return report;
  const categories = report.categories.filter((item) => normalizeCategoryName(item.name).includes(normalized));
  return finalizeDashboard({ ...report, categories });
}

export function listChecks(report: ReturnType<typeof buildOperatorDashboard>) {
  return report.categories.flatMap((category) =>
    category.checks.map((item) => ({
      category: category.name,
      name: item.name,
      status: item.status,
      command: item.command ?? "",
      runByDefault: item.runByDefault === true,
      requiresCredentials: item.requiresCredentials === true,
    })),
  );
}

export function applyRunResults(
  report: ReturnType<typeof buildOperatorDashboard>,
  commandRunner: CommandRunner = defaultCommandRunner,
) {
  const runResults = new Map<string, DashboardStatus>();
  const reportCommands = new Set(
    flattenChecks(report.categories)
      .map((item) => item.command)
      .filter((command): command is string => Boolean(command)),
  );
  for (const command of SAFE_RUN_CHECK_COMMANDS.filter((item) => reportCommands.has(item))) {
    const status = commandRunner(command) === 0 ? "PASS" : "FAIL";
    runResults.set(command, status);
  }

  const categories = report.categories.map((category) => ({
    ...category,
    checks: category.checks.map((item) => {
      if (!item.command || !runResults.has(item.command)) return item;
      return {
        ...item,
        status: runResults.get(item.command) ?? item.status,
        notes: `${item.notes} Checked by --run-checks.`,
      };
    }),
  }));

  return finalizeDashboard({ ...report, categories });
}

function defaultCommandRunner(command: string): number {
  const [program, ...args] = command.split(" ");
  const result = process.platform === "win32" && program === "pnpm"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { stdio: "inherit" })
    : spawnSync(program, args, { stdio: "inherit" });
  return result.status ?? 1;
}

function renderStatus(status: DashboardStatus): string {
  return `[${status}]`;
}

export function renderDashboard(report: ReturnType<typeof buildOperatorDashboard>): string {
  const lines = [
    "CREDIT REGULATOR PRO - OPERATOR REGRESSION DASHBOARD",
    "",
    `Generated: ${report.generatedAt}`,
    `Branch: ${report.branch}`,
    `Commit: ${report.commit}`,
    `Working tree clean: ${report.workingTreeClean ? "yes" : "no"}`,
    "",
  ];

  for (const category of report.categories) {
    lines.push(`${category.name}:`);
    for (const item of category.checks) {
      const commandText = item.command ? ` (${item.command})` : "";
      lines.push(`${renderStatus(item.status)} ${item.name}${commandText}`);
      if (item.notes) lines.push(`  ${item.notes}`);
    }
    lines.push("");
  }

  lines.push(
    "Status values:",
    "- PASS: check passed",
    "- FAIL: check failed or required release state is unsafe",
    "- SKIP: available local check was not run in this dashboard invocation",
    "- MANUAL: gated smoke or operator step requiring explicit context",
    "- OPEN: known scale-readiness gap",
    "- INFO: release context or non-runtime safety note",
  );

  return lines.join("\n");
}

function renderCheckList(report: ReturnType<typeof buildOperatorDashboard>): string {
  const lines = ["Operator dashboard checks", ""];
  for (const item of listChecks(report)) {
    const mode = item.runByDefault ? "run-checks" : item.requiresCredentials ? "manual" : "listed";
    const command = item.command ? ` - ${item.command}` : "";
    lines.push(`[${mode}] ${item.category}: ${item.name}${command}`);
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let report = filterDashboard(buildOperatorDashboard(), options.category);

  if (options.runChecks) {
    report = applyRunResults(report);
    if (report.summary.fail > 0) process.exitCode = 1;
  }

  if (options.listChecks) {
    console.log(options.json ? JSON.stringify(listChecks(report), null, 2) : renderCheckList(report));
    return;
  }

  console.log(options.json ? JSON.stringify(report, null, 2) : renderDashboard(report));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
