import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_ALERTS_DRY_RUN_EVIDENCE_DIR = "docs/production-scale/evidence";

export const REQUIRED_ALERT_DRY_RUN_CATEGORIES = [
  "critical_ingest_queue_backlog",
  "dead_letter_response_backlog",
  "stale_running_response_job",
  "packet_pdf_cache_warning",
  "storage_raw_report_warning",
  "db_pool_pressure_warning",
  "restore_evidence_missing_warning",
  "dashboard_skip_warning",
];

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
const LIVE_ALERT_FLAG_KEYS = [
  "CRP_LIVE_PROVIDER_CALLS",
  "CRP_ENABLE_LIVE_PROVIDERS",
  "CRP_ALLOW_LIVE_PROVIDERS",
  "CRP_ENABLE_LIVE_ALERTS",
  "CRP_ALLOW_LIVE_ALERTS",
  "SLACK_LIVE_ALERTS_ENABLED",
  "WEBHOOK_LIVE_ALERTS_ENABLED",
  "PAGERDUTY_LIVE_ALERTS_ENABLED",
  "SENDGRID_LIVE_DELIVERY_ENABLED",
  "SMTP_LIVE_DELIVERY_ENABLED",
  "SMS_LIVE_DELIVERY_ENABLED",
];

export const FORBIDDEN_ALERT_PAYLOAD_PATTERNS = [
  { key: "raw_pdf_or_base64_pdf", pattern: /(%PDF|JVBERi0|data:application\/pdf;base64)/i },
  { key: "raw_report_payload_key", pattern: /"?((fileDataBase64)|(bytesBase64)|(rawReport)|(rawText)|(rawPdf)|(storageUrl)|(signedUrl))"?\s*:/i },
  { key: "long_base64_blob", pattern: /\b[A-Za-z0-9+/]{160,}={0,2}\b/ },
  { key: "database_url_or_credential_url", pattern: /([a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@|postgres:\/\/|postgresql:\/\/|mysql:\/\/|mongodb:\/\/|database_url)/i },
  { key: "api_secret_token_or_private_key", pattern: /(bearer\s+[a-z0-9._-]+|basic\s+[a-z0-9+/=._-]+|sk-[a-z0-9_-]{10,}|ghp_[a-z0-9_]{10,}|github_pat_[a-z0-9_]+|xox[baprs]-[a-z0-9-]+|akia[0-9a-z]{16}|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private key|password\s*[:=]|secret\s*[:=]|session=|cookie=)/i },
  { key: "signed_url_signature", pattern: /(x-goog-signature|x-amz-signature|signature=|x-amz-credential)/i },
  { key: "email_address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { key: "ssn_or_sin", pattern: /\b(\d{3}[- ]?\d{2}[- ]?\d{4}|\d{3}[- ]?\d{3}[- ]?\d{3})\b/ },
  { key: "credit_card_like_number", pattern: /\b(?:\d[ -]*?){13,16}\b/ },
];

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

function enabledFlag(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value ?? "").trim().toLowerCase());
}

export function detectAlertsDryRunProductionEnvironment(env = process.env) {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }
  for (const key of PRODUCTION_SECRET_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }
  return { productionLike: false, reason: "" };
}

export function detectLiveAlertFlags(env = process.env) {
  const enabledFlags = LIVE_ALERT_FLAG_KEYS.filter((key) => enabledFlag(env[key]));
  return {
    enabled: enabledFlags.length > 0,
    enabledFlags,
  };
}

function alertPayload(input) {
  return {
    category: input.category,
    severity: input.severity,
    evidenceType: "SIMULATED",
    deliveryMode: "DRY RUN",
    payloadSanitized: true,
    liveExternalCallMade: false,
    payload: {
      service: "creditregulatorpro",
      environment: "SIMULATED_LOCAL",
      category: input.category,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      metric: input.metric,
      runbookAction: input.runbookAction,
      dedupeKey: `SIMULATED_${input.category}`,
      containsPii: false,
      containsSecrets: false,
      containsRawReportData: false,
      containsSignedUrls: false,
      externalDeliveryAttempted: false,
    },
  };
}

export function buildSimulatedAlertPayloads() {
  return [
    alertPayload({
      category: "critical_ingest_queue_backlog",
      severity: "critical",
      title: "Critical ingest queue backlog",
      summary: "SIMULATED ingest queue backlog crossed the critical operator threshold.",
      metric: { name: "ingest_queued_jobs", value: 125, threshold: 100, unit: "jobs" },
      runbookAction: "Inspect ingest worker status, queue drain evidence, and remediation queue before any release claim.",
    }),
    alertPayload({
      category: "dead_letter_response_backlog",
      severity: "critical",
      title: "Dead-letter response backlog",
      summary: "SIMULATED response-processing dead-letter backlog requires operator review.",
      metric: { name: "response_dead_letter_jobs", value: 3, threshold: 1, unit: "jobs" },
      runbookAction: "Use admin remediation review; do not delete queue history or mutate terminal records silently.",
    }),
    alertPayload({
      category: "stale_running_response_job",
      severity: "critical",
      title: "Stale-running response job",
      summary: "SIMULATED stale-running response job is visible for explicit operator review.",
      metric: { name: "response_stale_running_jobs", value: 1, threshold: 1, unit: "jobs" },
      runbookAction: "Review stale-running job evidence without auto-reclaiming or changing queue semantics.",
    }),
    alertPayload({
      category: "packet_pdf_cache_warning",
      severity: "warning",
      title: "Packet PDF/cache warning",
      summary: "SIMULATED packet PDF cache-miss/render warning is capacity evidence only, not a queue fix.",
      metric: { name: "packet_pdf_cache_misses", value: 4, threshold: 1, unit: "misses" },
      runbookAction: "Record cache-miss timing evidence and keep packet wording and PDF behavior unchanged.",
    }),
    alertPayload({
      category: "storage_raw_report_warning",
      severity: "warning",
      title: "Storage/raw report warning",
      summary: "SIMULATED storage inventory warning indicates possible historical inline raw-report rows.",
      metric: { name: "possible_inline_raw_report_rows", value: 2, threshold: 1, unit: "rows" },
      runbookAction: "Run sanitized raw-report inventory; do not print raw bytes or silently migrate historical rows.",
    }),
    alertPayload({
      category: "db_pool_pressure_warning",
      severity: "warning",
      title: "DB/pool pressure warning",
      summary: "SIMULATED DB pool pressure signal crossed the warning threshold.",
      metric: { name: "db_active_connection_signal", value: 24, threshold: 20, unit: "connections" },
      runbookAction: "Capture bounded local or staging-safe pool evidence without stressing production.",
    }),
    alertPayload({
      category: "restore_evidence_missing_warning",
      severity: "critical",
      title: "Restore evidence missing",
      summary: "SIMULATED restore evidence warning indicates non-interactive restore machine proof remains required.",
      metric: { name: "machine_restore_evidence_records", value: 0, threshold: 1, unit: "records" },
      runbookAction: "Run restore:machine-proof with sanitized machine-attested RPO/RTO evidence.",
    }),
    alertPayload({
      category: "dashboard_skip_warning",
      severity: "warning",
      title: "Dashboard skip warning",
      summary: "SIMULATED dashboard warning states SKIP rows cannot be treated as PASS evidence.",
      metric: { name: "dashboard_skip_rows", value: 12, threshold: 1, unit: "rows" },
      runbookAction: "Record exact commands and skipped rows; dashboard PASS alone is not sufficient release evidence.",
    }),
  ];
}

export function scanAlertPayloadSensitiveContent(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const findings = [];
  for (const item of FORBIDDEN_ALERT_PAYLOAD_PATTERNS) {
    if (item.pattern.test(text)) findings.push(item.key);
  }
  return findings;
}

export function validateAlertsDryRunReport(report) {
  const errors = [];
  const categories = new Set((report.alerts ?? []).map((alert) => alert.category));
  const missingCategories = REQUIRED_ALERT_DRY_RUN_CATEGORIES.filter((category) => !categories.has(category));

  if (report.evidenceType !== "SIMULATED") errors.push("report evidenceType must be SIMULATED");
  if (report.deliveryMode !== "DRY RUN") errors.push("report deliveryMode must be DRY RUN");
  if (report.safety?.liveExternalAlertsSent !== 0) errors.push("live external alerts sent must be zero");
  if (report.safety?.liveExternalProviderCallsMade !== 0) errors.push("live external provider calls must be zero");
  if (report.safety?.responseQueueSemanticsChanged !== false) errors.push("response queue semantics must remain unchanged");
  if (missingCategories.length > 0) errors.push(`missing alert categories: ${missingCategories.join(", ")}`);
  if ((report.alerts ?? []).some((alert) => alert.payloadSanitized !== true || alert.liveExternalCallMade !== false)) {
    errors.push("all alert payloads must be sanitized dry-run payloads with no live external calls");
  }
  if ((report.sanitization?.sensitiveFindings ?? []).length > 0) {
    errors.push(`sensitive alert payload findings: ${report.sanitization.sensitiveFindings.join(", ")}`);
  }
  return { ok: errors.length === 0, errors };
}

export function buildAlertsDryRunReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
} = {}) {
  const productionEnvironment = detectAlertsDryRunProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing alerts dry-run in a production-like environment: ${productionEnvironment.reason}`);
  }

  const liveFlags = detectLiveAlertFlags(env);
  if (liveFlags.enabled) {
    throw new Error(`Refusing alerts dry-run because live alert/provider flag(s) are enabled: ${liveFlags.enabledFlags.join(", ")}.`);
  }

  const alerts = buildSimulatedAlertPayloads();
  const sensitiveFindings = Array.from(new Set(scanAlertPayloadSensitiveContent(alerts)));
  const report = {
    reportName: "alerts-dry-run-evidence",
    evidenceType: "SIMULATED",
    deliveryMode: "DRY RUN",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    warning: "SIMULATED DRY RUN alert evidence is not live external alert delivery proof and does not claim production-at-scale readiness.",
    requiredCategories: REQUIRED_ALERT_DRY_RUN_CATEGORIES,
    alerts,
    sanitization: {
      payloadsSanitized: sensitiveFindings.length === 0,
      sensitiveFindings,
      piiSecretsRawReportScanner: "passed-if-sensitiveFindings-empty",
    },
    safety: {
      productionMutationForbidden: true,
      productionDataMutated: false,
      productionEnvironmentDetected: false,
      syntheticFixturesOnly: true,
      liveExternalAlertsSent: 0,
      liveExternalProviderCallsMade: 0,
      alertProviderConfiguredOrRequired: false,
      liveScheduledDaemonEnabled: false,
      responseQueueSemanticsChanged: false,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      packetWordingChanged: false,
      packetPdfBehaviorChanged: false,
      storageBehaviorChanged: false,
      retentionBehaviorChanged: false,
      deploymentActivationChanged: false,
      realConsumerPiiUsed: false,
      rawReportsUsed: false,
      secretsOrCredentialsUsed: false,
    },
    statements: [
      "DRY RUN and SIMULATED: no live external alerts were sent.",
      "Payloads are synthetic and sanitized; no PII, secrets, raw reports, signed URLs, or credential URLs are allowed.",
      "Live external alerting remains disabled unless separately configured, reviewed, and proven.",
      "If no external alert provider is used, an accepted exclusion must cite this dry-run plus operator-monitoring coverage.",
      "Dashboard PASS alone is not sufficient release evidence; SKIP rows must remain visible.",
    ],
    blockers: {
      blocker8ResponseOperations: "Partial/SIMULATED evidence only; live scheduler, physical purge/archive, and historical backfill are not proven complete.",
      blocker9Alerting: "SIMULATED dry-run/mock alert proof only; live external alert delivery remains disabled.",
      blocker25DashboardSkipSemantics: "Dry-run includes dashboard skip warning; dashboard reporting must distinguish PASS, FAIL, SKIP, SIMULATED, and MACHINE_REQUIRED.",
    },
  };

  const validation = validateAlertsDryRunReport(report);
  if (!validation.ok) {
    throw new Error(`Alerts dry-run validation failed: ${validation.errors.join("; ")}`);
  }
  return {
    ...report,
    validation,
  };
}

export function renderAlertsDryRunMarkdown(report) {
  const lines = [
    "# SIMULATED DRY RUN Alert Evidence",
    "",
    "SIMULATED DRY RUN evidence only. No live external alerts were sent, no live external providers were called, and this is not production alert-delivery proof.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Validation: ${report.validation.ok ? "passed" : "failed"}`,
    "",
    "## Required Warning",
    "",
    "- SIMULATED alert evidence is not production proof.",
    "- DRY RUN alert payloads are not live email, Slack, webhook, SMS, push, or pager delivery.",
    "- Dashboard PASS alone is not sufficient release evidence.",
    "- Response queue semantics were not changed.",
    "",
    "## Alert Categories",
    "",
  ];

  for (const alert of report.alerts) {
    lines.push(
      `- ${alert.category}: ${alert.severity.toUpperCase()} (${alert.evidenceType} ${alert.deliveryMode})`,
      `  - ${alert.payload.summary}`,
      `  - Metric: ${alert.payload.metric.name}=${alert.payload.metric.value} threshold=${alert.payload.metric.threshold} ${alert.payload.metric.unit}`,
      `  - Live external call made: ${alert.liveExternalCallMade ? "yes" : "no"}`,
    );
  }

  lines.push(
    "",
    "## Sanitization",
    "",
    `- Payloads sanitized: ${report.sanitization.payloadsSanitized ? "yes" : "no"}`,
    `- Sensitive findings: ${report.sanitization.sensitiveFindings.length === 0 ? "none" : report.sanitization.sensitiveFindings.join(", ")}`,
    "- Raw report data included: no",
    "- PII, secrets, tokens, credential URLs, signed URLs, and signature data included: no",
    "",
    "## Safety",
    "",
    `- Live external alerts sent: ${report.safety.liveExternalAlertsSent}`,
    `- Live external provider calls made: ${report.safety.liveExternalProviderCallsMade}`,
    "- Live scheduled daemon enabled: no",
    "- Production data mutated: no",
    "- Synthetic fixtures only: yes",
    "- Parser, OCR, packet wording, storage, packet PDF, retention, deployment activation, and response queue semantics changed: no",
    "",
    "## Remaining Blocking Work",
    "",
    `- Blocker 8: ${report.blockers.blocker8ResponseOperations}`,
    `- Blocker 9: ${report.blockers.blocker9Alerting}`,
    `- Blocker 25: ${report.blockers.blocker25DashboardSkipSemantics}`,
    "",
    "## Accepted Exclusion Path",
    "",
    "If no external alert provider is used, release evidence must explicitly cite the accepted exclusion, this SIMULATED dry-run, operator dashboard coverage, and the human monitoring path. The exclusion must not be described as live external alert proof.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeAlertsDryRunEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_ALERTS_DRY_RUN_EVIDENCE_DIR,
} = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-alerts-dry-run.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-alerts-dry-run.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderAlertsDryRunMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_ALERTS_DRY_RUN_EVIDENCE_DIR,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage: pnpm run alerts:dry-run -- [options]",
    "",
    "Generates SIMULATED DRY RUN alert evidence with sanitized payloads and zero live external calls.",
    "",
    "Options:",
    "  --json                    Print the JSON report to stdout.",
    "  --root <path>             Project root. Defaults to current working directory.",
    "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
  ].join("\n"));
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = buildAlertsDryRunReport({
      rootDir: options.rootDir,
    });
    const outputs = writeAlertsDryRunEvidence(report, {
      rootDir: options.rootDir,
      evidenceDir: options.evidenceDir,
    });
    console.log("SIMULATED DRY RUN alert evidence generated.");
    console.log("Live external alerts sent: 0");
    console.log("Live external provider calls made: 0");
    console.log(`Alert categories: ${report.alerts.length}/${report.requiredCategories.length}`);
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
    console.log("SIMULATED dry-run alert evidence is not production proof.");
    if (options.json) console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
