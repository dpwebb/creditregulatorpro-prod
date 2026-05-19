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
  "pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/packet-lifecycle-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/outcome-comparison.spec.ts",
  "pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/outcome-admin-review-ui.spec.tsx",
  "pnpm exec vitest run tests/api/response-document-endpoint.spec.ts",
  "pnpm exec vitest run tests/api/response-document-admin-review-endpoint.spec.ts",
  "pnpm exec vitest run tests/unit/response-classification-engine.spec.ts",
  "pnpm exec vitest run tests/unit/response-document-ui.spec.tsx",
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
  {
    name: "Outcome Tracking smoke",
    command: "pnpm run smoke:outcome-tracking",
    notes:
      "Manual/gated persisted outcome smoke. Requires CRP_OUTCOME_TRACKING_SMOKE=true, safe auth context, and synthetic fixture IDs from smoke:outcome-fixture-setup. Authenticated staging response-only smoke has passed; non-owner check remains skipped unless a safe non-owner context is configured.",
  },
  {
    name: "Outcome Admin Review smoke",
    command: "pnpm run smoke:outcome-admin-review",
    notes:
      "Manual/gated admin-review smoke. Requires CRP_OUTCOME_ADMIN_REVIEW_SMOKE=true, safe staging admin context, and a verified synthetic outcome run or fixture IDs. Authenticated staging smoke has passed for a synthetic existing run; response-document capture backend, append-only deterministic response processing, append-only response admin-review event logging, admin response UI, manual/admin response capture UI, inbox-ready intake abstraction, response-document admin-review backend, and authenticated response admin-review UI smoke now exist, while live mailbox integration remains future work.",
  },
  {
    name: "Outcome Admin Review UI smoke",
    command: "pnpm run smoke:outcome-admin-review-ui",
    notes:
      "Manual/gated admin-only Outcome Reviews UI smoke. Requires CRP_OUTCOME_ADMIN_REVIEW_UI_SMOKE=true, safe staging admin context, and a verified synthetic outcome run. Authenticated staging smoke has passed for route/list/detail, safety notices, metadata-only review action, deterministic preservation, unsupported override-control absence, and privacy/no-overexposure.",
  },
  {
    name: "Response Document smoke",
    command: "pnpm run smoke:response-document",
    notes:
      "Manual/gated response-document capture smoke. Requires CRP_RESPONSE_DOCUMENT_SMOKE=true, safe staging user/admin context, and verified synthetic outcome or packet data. Authenticated staging smoke has passed in both admin and user-owned contexts for capture/list/get, append-only deterministic response processing metadata, outcome linkage, later-report-comparison requirement, and privacy/no-overexposure.",
  },
  {
    name: "Response Document UI smoke",
    command: "pnpm run smoke:response-document-ui",
    notes:
      "Manual/gated admin-only Response Documents UI smoke. Requires CRP_RESPONSE_DOCUMENT_UI_SMOKE=true, safe staging admin context, and verified synthetic response data. Authenticated staging smoke has passed for route/list/detail visibility, deterministic processing source visibility, manual-review states, metrics, evidence/provenance notices, and the non-mutating manual intake surface; the smoke does not submit capture data.",
  },
  {
    name: "Response Document Admin Review smoke",
    command: "pnpm run smoke:response-document-admin-review",
    notes:
      "Manual/gated response-document admin-review smoke. Requires CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_SMOKE=true, safe staging admin context, and verified synthetic response data. Authenticated staging smoke has passed for admin-only metadata review, required-note validation, unsupported corrected/removed/unchanged and legal/override rejection, source preservation, runtime-safety, and privacy/no-overexposure.",
  },
  {
    name: "Response Document Admin Review UI smoke",
    command: "pnpm run smoke:response-document-admin-review-ui",
    notes:
      "Manual/gated response-document admin-review UI smoke. Requires CRP_RESPONSE_DOCUMENT_ADMIN_REVIEW_UI_SMOKE=true, safe staging admin context via session cookie, credentials, or storage state, and verified synthetic response data. Authenticated staging smoke has passed through the autonomous post-deploy response auth suite; it exercises one neutral Add Review Note action through the admin UI and keeps response documents evidence/metadata only.",
  },
];

export const KNOWN_SCALE_GAPS = [
  "Persisted outcome tracking backend has passed authenticated staging smoke for a synthetic response-only path, authenticated outcome admin-review smoke has passed for a synthetic metadata-only review path, authenticated admin-only Outcome Reviews UI smoke has passed for a metadata-only UI review path, response-document capture backend coverage plus authenticated admin/user-owned staging smoke now exist for immutable response records with append-only deterministic processing and append-only response admin-review event logging, response replay/backfill dry-run/apply tooling now exists with append-only apply events and no raw response text storage, authenticated admin-only Response Documents UI smoke covers response list/detail processing visibility plus the non-mutating manual intake surface, response-document admin-review backend coverage plus authenticated admin-review smoke now exist for metadata-only review actions, authenticated response admin-review UI smoke has passed for one metadata-only review action, and the staging deploy workflow now runs scope-gated autonomous seeded response auth smokes after deploy and health checks: runtime/app/workflow/Docker/backend/UI/script changes run the full suite, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope runs it fail-closed; live mailbox integration, historical production backfill strategy for records without stored response summaries, non-owner smoke, production-scale repeated smoke, external alert delivery, and queue/backpressure workers remain future work.",
  "Broader production-scale workflow coverage remains ongoing.",
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
        check(
          "Autonomous response auth smokes",
          "INFO",
          "Staging deploy workflow runs scope-gated seeded/authenticated response auth smokes after deploy and health checks: response capture/list/get, response UI, response admin-review backend, and response admin-review UI. Runtime/app/workflow/Docker/backend/UI/script changes run the full suite, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope runs it fail-closed. This is a deploy-time safety gate, not full production monitoring.",
          { kind: "info" },
        ),
        check(
          "App image apt-utils cleanup",
          "INFO",
          "The app Docker image includes apt-utils before OCR/PDF runtime package installation; poppler-utils, tesseract-ocr, and tesseract-ocr-eng remain installed, and filtered deploy logs no longer show the apt-utils package-install warning.",
          { kind: "info" },
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
      name: "Auth / Session Lifecycle",
      checks: [
        check(
          "Auth session lifecycle endpoint",
          "SKIP",
          "Endpoint-backed login/session/logout behavior, malformed and invalid session handling, role boundaries, admin guard samples, no client-side role escalation, and secret/no-overexposure expectations.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
      ],
    },
    {
      name: "Admin Audit / Activity Logs",
      checks: [
        check(
          "Admin audit log endpoint",
          "SKIP",
          "Endpoint-backed admin-only access, support/non-admin denial, supported filters and pagination, safe audit summaries, no secret/full SIN/full account/raw-text leakage, regulation/packet/evidence/correction row safety, and runtime-safety boundaries.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
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
        check(
          "Packet delivery/status endpoint",
          "SKIP",
          "Endpoint-backed ownership, status updates, send/delivery behavior, provider-call mocking, audit/evidence expectations, duplicate/retry blocking, stale attachment safety, no-overexposure, and runtime-safety boundaries.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check("Packet readiness", "SKIP", "Helper and endpoint readiness fail-closed coverage.", {
          command: "pnpm exec vitest run tests/unit/packet-readiness.spec.ts",
        }),
        check("Packet PDF", "SKIP", "Packet PDF rendering tests are available but not in the default bounded run.", {
          command: "pnpm exec vitest run tests/unit/dispute-packet-pdf.spec.ts",
        }),
      ],
    },
    {
      name: "Outcome Tracking",
      checks: [
        check(
          "Outcome comparison helper",
          "SKIP",
          "No-schema deterministic helper coverage for unchanged, removed, corrected, partially_corrected, reinserted, new_issue, unresolved, needs_review, not_comparable, and response_received classifications.",
          {
            command: "pnpm exec vitest run tests/unit/outcome-comparison.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Persisted outcome tracking endpoint",
          "SKIP",
          "Endpoint-backed persisted backend coverage for outcome_comparison_run and finding_outcome compare/list/get flows. Backend-only: no UI, and response documents remain evidence only rather than canonical credit-report facts.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Outcome admin-review endpoint",
          "SKIP",
          "Endpoint-backed admin-only metadata review coverage for finding/run review statuses, required notes/confirmations, sanitized audit, deterministic outcome preservation, source-record immutability, and no runtime truth, packet, parser, violation, override, or furnisher path activation.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Outcome admin-review UI",
          "SKIP",
          "Admin-only review UI coverage for outcome run list/detail, safe snapshots, metadata-only review actions, unsupported override-control absence, and source guards limiting calls to existing outcome list/get/admin-review endpoints.",
          {
            command: "pnpm exec vitest run tests/unit/outcome-admin-review-ui.spec.tsx",
            runByDefault: true,
          },
        ),
        check(
          "Response document capture endpoint",
          "SKIP",
          "Endpoint-backed response capture coverage for bureau_response_event plus append-only response_processing_event and response_admin_review_event schema creation, owner/admin/support boundaries, packet/outcome/finding/evidence/tradeline/violation linkage, deterministic processing metadata, inbox-ready manual_admin/simulated_inbox intake, response-text hashing, duplicate/idempotent intake handling, sanitized audit, privacy/no-overexposure, metrics, and source guards that prevent credit-report parser, OCR pipeline, packet, violation, runtime truth, admin override, direct furnisher paths, or live mailbox integration. Authenticated staging smoke has passed in admin and user-owned contexts for capture/list/get and outcome-linked email response metadata.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-document-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response classification engine",
          "SKIP",
          "Unit coverage for deterministic response classification, confidence gating, negation and contradiction handling, metadata-only/OCR-damaged fail-closed states, manual-review fail-closed states, evidence-linked provenance, regulation-reference review links, and no readiness/violation truth mutation.",
          {
            command: "pnpm exec vitest run tests/unit/response-classification-engine.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response replay/backfill dry-run",
          "SKIP",
          "Operator-only replay report for response records. Dry-run is default and reports total, replayable, non-replayable reason counts, stale/missing classifier metadata, manual-review/uncertainty counts, duplicate-attempt audit count, and replay timestamps where available; apply mode is explicit and append-only. This is tooling, not live mailbox integration or queue/backpressure proof.",
          {
            command: "pnpm run response:replay -- --dry-run",
          },
        ),
        check(
          "Response document admin-review endpoint",
          "SKIP",
          "Endpoint-backed admin-only metadata review coverage for bureau_response_event review status plus append-only response_admin_review_event rows, related/unrelated/archive/note/link actions, same-user packet/outcome/finding validation, required evidence-only/no-canonical-change/no-outcome-classification confirmations, sanitized audit, privacy/no-overexposure, unsupported corrected/removed/legal override-action rejection, source preservation, and source guards preventing parser, OCR, packet, violation, runtime truth, admin override, direct furnisher, or mailbox paths. Authenticated staging smoke has passed for synthetic response 1 with required-note validation, unsupported action rejection, link_to_outcome, add_review_note, metadata-only review updates, deterministic source preservation, runtime-safety, and privacy/no-overexposure.",
          {
            kind: "endpoint-test",
            command: "pnpm exec vitest run tests/api/response-document-admin-review-endpoint.spec.ts",
            runByDefault: true,
          },
        ),
        check(
          "Response document admin UI",
          "SKIP",
          "Admin-only Response Documents UI coverage for list/detail, supported filters, response processing metrics, deterministic extraction source visibility, manual-review states, safe metadata rendering, evidence/provenance notices, manual/admin response capture controls, idempotent duplicate result visibility, metadata-only admin-review controls, required notes, confirmation guardrails, unsupported legal/override/live-inbox/source-truth controls, and source guards limiting mutations to response capture/admin-review endpoints only. Authenticated staging UI smoke has passed for route/list/detail and the metadata-only admin-review UI action path.",
          {
            command: "pnpm exec vitest run tests/unit/response-document-ui.spec.tsx",
            runByDefault: true,
          },
        ),
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
