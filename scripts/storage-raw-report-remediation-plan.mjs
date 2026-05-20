import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAW_REPORT_REMEDIATION_PLAN_MD_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.md";
export const RAW_REPORT_REMEDIATION_PLAN_JSON_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-remediation-plan.json";
export const RAW_REPORT_REMEDIATION_ACCEPTANCE_MD_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.md";
export const RAW_REPORT_REMEDIATION_ACCEPTANCE_JSON_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-remediation-acceptance.json";
export const RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH =
  "docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.json";
export const RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH =
  "docs/production-scale/evidence/storage-raw-report-remediation-acceptance-evidence.md";
export const RAW_REPORT_INVENTORY_JSON_PATH =
  "docs/production-scale/evidence/latest-storage-raw-report-inventory.json";

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
const MUTATION_ENV_KEYS = [
  "CRP_STORAGE_RAW_REPORT_REMEDIATION_APPLY",
  "CRP_STORAGE_RAW_REPORT_REMEDIATION_EXECUTE",
  "CRP_STORAGE_RAW_REPORT_REMEDIATION_MUTATE",
];
const FORBIDDEN_MUTATION_ARGS = new Set(["--apply", "--execute", "--run", "--mutate", "--production"]);
const PLACEHOLDER_VALUES = new Set(["todo", "tbd", "n/a", "na", "none", "null", "placeholder"]);

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
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

function readJsonIfPresent(rootDir, relativePath) {
  const absolutePath = repoPath(rootDir, relativePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countOrNull(value) {
  const parsed = safeNumber(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function countLabel(value) {
  return value === null || value === undefined ? "unavailable" : String(value);
}

function isTruthyString(value) {
  return /^(1|true|yes|apply|execute|mutate)$/i.test(String(value ?? "").trim());
}

export function detectRawReportRemediationProductionEnvironment(env = process.env) {
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

export function detectRawReportRemediationMutationRequest({ args = [], env = process.env } = {}) {
  const forbiddenArg = args.find((arg) => FORBIDDEN_MUTATION_ARGS.has(arg));
  if (forbiddenArg) return { mutationRequested: true, reason: `${forbiddenArg} is forbidden; this command is dry-run only.` };
  for (const key of MUTATION_ENV_KEYS) {
    if (isTruthyString(env[key])) {
      return { mutationRequested: true, reason: `${key} requested mutation; this command is dry-run only.` };
    }
  }
  return { mutationRequested: false, reason: "" };
}

export function scanRawReportRemediationSensitiveContent(text) {
  const findings = [];
  const patterns = [
    ["database-url", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s)]+/i],
    ["private-key-block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["api-token", /\b(?:sk|ghp|github_pat|xox[baprs])[_-][A-Za-z0-9_-]{12,}\b/i],
    ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i],
    ["access-key", /\bAKIA[0-9A-Z]{16}\b/i],
    ["session-cookie", /\b(?:session|cookie|floot_built_app_session)=\S{12,}/i],
    ["raw-pdf-bytes", /(?:%PDF-|JVBERi0|data:application\/pdf;base64,)/i],
    ["raw-report-text", /\b(?:rawExtractedText|raw\s+report\s+text|raw\s+pdf\s+text|full\s+credit\s+report\s+text)\s*[:=]/i],
    ["long-base64-blob", /\b[A-Za-z0-9+/]{160,}={0,2}\b/],
    ["signed-url", /https?:\/\/[^\s]+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s]*/i],
    ["ssn-or-sin", /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/],
    ["obvious-email-pii", /\b[A-Z0-9._%+-]+@(?!example\.test\b|example\.invalid\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(text)) findings.push(name);
  }
  return findings;
}

function isPlaceholderValue(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || PLACEHOLDER_VALUES.has(normalized);
}

function tableCounts(inventory, key) {
  const table = inventory?.tables?.[key] ?? {};
  return {
    totalRows: countOrNull(table.totalRows),
    storageUrlRows: countOrNull(table.storageUrlRows),
    localReferenceRows: countOrNull(table.localReferenceRows),
    possibleInlineBase64Rows: countOrNull(table.possibleInlineBase64Rows),
    dataUrlBase64Rows: countOrNull(table.dataUrlBase64Rows),
    nonLocalReferenceRows: countOrNull(table.nonLocalReferenceRows),
    nullStorageRows: countOrNull(table.nullStorageRows),
  };
}

function unavailableCounts() {
  return {
    totalRows: null,
    storageUrlRows: null,
    localReferenceRows: null,
    possibleInlineBase64Rows: null,
    dataUrlBase64Rows: null,
    nonLocalReferenceRows: null,
    nullStorageRows: null,
  };
}

function readInventorySummary(rootDir) {
  if (!existsSync(repoPath(rootDir, RAW_REPORT_INVENTORY_JSON_PATH))) {
    return {
      path: RAW_REPORT_INVENTORY_JSON_PATH,
      exists: false,
      status: "missing",
      countsReliable: false,
      generatedAt: null,
      sensitiveFindings: [],
      tables: {
        reportArtifact: unavailableCounts(),
        evidenceAttachment: unavailableCounts(),
      },
    };
  }

  const inventory = readJsonIfPresent(rootDir, RAW_REPORT_INVENTORY_JSON_PATH);
  const sensitiveFindings = scanRawReportRemediationSensitiveContent(JSON.stringify(inventory ?? {}));
  const countsReliable = inventory?.countsReliable === true && sensitiveFindings.length === 0;
  return {
    path: RAW_REPORT_INVENTORY_JSON_PATH,
    exists: true,
    status: sensitiveFindings.length > 0 ? "rejected-sensitive-inventory" : String(inventory?.status ?? "unknown"),
    countsReliable,
    generatedAt: inventory?.generatedAt ?? null,
    sensitiveFindings,
    tables: countsReliable
      ? {
          reportArtifact: tableCounts(inventory, "reportArtifact"),
          evidenceAttachment: tableCounts(inventory, "evidenceAttachment"),
        }
      : {
          reportArtifact: unavailableCounts(),
          evidenceAttachment: unavailableCounts(),
        },
  };
}

function buildCategoryRows(inventoryEvidence) {
  const reportArtifact = inventoryEvidence.tables.reportArtifact;
  const evidenceAttachment = inventoryEvidence.tables.evidenceAttachment;
  return [
    {
      table: "report_artifact",
      field: "storage_url",
      category: "legacy-inline-pdf-candidates",
      estimatedRows: reportArtifact.possibleInlineBase64Rows,
      remediationAction: "Operator-approved copy to report-artifact storage reference after checksum verification; keep legacy resolver compatibility during rollout.",
    },
    {
      table: "report_artifact",
      field: "storage_url",
      category: "data-url-inline-pdf-candidates",
      estimatedRows: reportArtifact.dataUrlBase64Rows,
      remediationAction: "Operator-approved normalize data URL payload to storage reference after validation; preserve rollback snapshot.",
    },
    {
      table: "report_artifact",
      field: "storage_url",
      category: "already-reference-or-null",
      estimatedRows:
        reportArtifact.localReferenceRows === null || reportArtifact.nonLocalReferenceRows === null || reportArtifact.nullStorageRows === null
          ? null
          : reportArtifact.localReferenceRows + reportArtifact.nonLocalReferenceRows + reportArtifact.nullStorageRows,
      remediationAction: "No byte migration planned; validate compatibility and metadata visibility only.",
    },
    {
      table: "evidence_attachment",
      field: "storage_url",
      category: "legacy-inline-attachment-candidates",
      estimatedRows: evidenceAttachment.possibleInlineBase64Rows,
      remediationAction: "Operator-approved copy to evidence attachment storage reference after checksum verification; keep legacy resolver compatibility during rollout.",
    },
    {
      table: "evidence_attachment",
      field: "storage_url",
      category: "data-url-inline-attachment-candidates",
      estimatedRows: evidenceAttachment.dataUrlBase64Rows,
      remediationAction: "Operator-approved normalize data URL payload to storage reference after validation; preserve rollback snapshot.",
    },
    {
      table: "evidence_attachment",
      field: "storage_url",
      category: "already-reference-or-null",
      estimatedRows:
        evidenceAttachment.localReferenceRows === null ||
        evidenceAttachment.nonLocalReferenceRows === null ||
        evidenceAttachment.nullStorageRows === null
          ? null
          : evidenceAttachment.localReferenceRows + evidenceAttachment.nonLocalReferenceRows + evidenceAttachment.nullStorageRows,
      remediationAction: "No byte migration planned; validate compatibility and metadata visibility only.",
    },
  ];
}

export function buildStorageRawReportRemediationPlanReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  args = [],
  inventoryEvidence = null,
} = {}) {
  const productionEnvironment = detectRawReportRemediationProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing raw report remediation planning in a production-like environment: ${productionEnvironment.reason}`);
  }
  const mutationRequest = detectRawReportRemediationMutationRequest({ args, env });
  if (mutationRequest.mutationRequested) {
    throw new Error(`Refusing raw report remediation mutation: ${mutationRequest.reason}`);
  }

  const inventory = inventoryEvidence ?? readInventorySummary(rootDir);
  const categories = buildCategoryRows(inventory);
  const inventoryReady = inventory.exists && inventory.countsReliable;
  const status = inventoryReady ? "planned-awaiting-operator-approval" : inventory.exists ? "inventory-unreliable" : "inventory-missing";
  const affectedTables = Array.from(new Set(categories.filter((item) => item.estimatedRows === null || item.estimatedRows > 0).map((item) => item.table)));

  return {
    reportName: "storage-raw-report-remediation-plan",
    evidenceType: "SANITIZED_DRY_RUN_REMEDIATION_PLAN",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status,
    productionProof: false,
    dryRunOnly: true,
    productionMutationRefused: true,
    rawValuesPrinted: false,
    rawBytesPrinted: false,
    signedUrlsPrinted: false,
    storageSecretsPrinted: false,
    realConsumerPiiUsed: false,
    historicalRowsDeleted: false,
    historicalRowsMigratedByCodex: false,
    inventoryEvidence: {
      path: inventory.path,
      exists: inventory.exists,
      status: inventory.status,
      countsReliable: inventory.countsReliable,
      generatedAt: inventory.generatedAt,
      sensitiveFindings: inventory.sensitiveFindings,
    },
    affectedTables,
    estimatedCounts: {
      reportArtifact: inventory.tables.reportArtifact,
      evidenceAttachment: inventory.tables.evidenceAttachment,
    },
    remediationCategories: categories,
    remediationPlan: {
      dryRunOnly: true,
      mutationCommandAvailable: false,
      productionMutationAllowed: false,
      steps: [
        "Confirm a current staging-safe sanitized inventory exists and counts are reliable.",
        "Take a fresh backup before any operator-approved remediation.",
        "Use an approved process to copy inline bytes to storage references in bounded batches with checksum verification.",
        "Retain old inline compatibility until post-remediation read-path checks pass.",
        "Record pre/post aggregate counts only; do not record raw storageUrl values or raw bytes.",
        "Submit sanitized operator acceptance evidence for blocker 6 review.",
      ],
    },
    rollbackStrategy: [
      "Do not delete historical rows during remediation.",
      "Capture a pre-remediation backup and row-count snapshot before any operator-run process.",
      "Use transaction-bounded batches so failed batches can be rolled back independently.",
      "Preserve legacy inline resolver compatibility until post-remediation validation is complete.",
      "If validation fails, restore affected storage_url values from the approved backup/snapshot and rerun compatibility checks.",
    ],
    operatorApprovalRequirements: [
      "Named operator or role approves the plan before execution.",
      "Approval references the sanitized inventory and this dry-run plan evidence.",
      "Approval confirms no raw PII, raw report bytes, signed URLs, storage secrets, or database URLs are included in evidence.",
      "Approval confirms Codex will not run production mutation.",
      "Approval records bounded batch size, rollback owner, and validation owner.",
    ],
    backupPrerequisite:
      "A fresh backup and restore-readiness acknowledgement are required before any operator-approved remediation process runs.",
    postRemediationValidationSteps: [
      "Rerun pnpm run storage:raw-report-inventory and compare aggregate counts only.",
      "Verify legacy inline reportArtifact records remain readable through resolveReportArtifactPdfBase64 compatibility tests.",
      "Verify legacy inline evidenceAttachment records remain readable through resolveEvidenceAttachmentBase64 compatibility tests.",
      "Run pnpm run test:api and focused storage compatibility tests.",
      "Submit sanitized acceptance evidence with post-remediation counts and signed acknowledgement.",
    ],
    blockerCoverage: {
      blocker6GovernedWorkflowPrepared: inventoryReady,
      blocker6AcceptedClosed: false,
    },
    safety: {
      productionDataMutated: false,
      productionBackupsAccessedByCodex: false,
      rawSensitiveValuesExposed: false,
      parserBehaviorChanged: false,
      ocrBehaviorChanged: false,
      packetBehaviorChanged: false,
      violationBehaviorChanged: false,
      storageCompatibilityWeakened: false,
    },
    requiredStatements: [
      "This is a dry-run-only remediation plan.",
      "This command does not delete historical rows.",
      "This command does not migrate production data.",
      "This command does not print raw base64, raw PDFs, raw report text, PII, storage secrets, signed URLs, or database URLs.",
      "Blocker 6 remains remediation-required until sanitized operator acceptance evidence is submitted and accepted.",
    ],
    outputPaths: {
      markdown: RAW_REPORT_REMEDIATION_PLAN_MD_PATH,
      json: RAW_REPORT_REMEDIATION_PLAN_JSON_PATH,
    },
  };
}

function renderCountsTable(title, counts) {
  return [
    `### ${title}`,
    "",
    "| Metric | Estimated count |",
    "| --- | ---: |",
    `| Total rows | ${countLabel(counts.totalRows)} |`,
    `| Rows with storageUrl | ${countLabel(counts.storageUrlRows)} |`,
    `| local: storage references | ${countLabel(counts.localReferenceRows)} |`,
    `| Possible inline base64 rows | ${countLabel(counts.possibleInlineBase64Rows)} |`,
    `| data:*;base64 rows | ${countLabel(counts.dataUrlBase64Rows)} |`,
    `| Non-local external-style references | ${countLabel(counts.nonLocalReferenceRows)} |`,
    `| Null storage rows | ${countLabel(counts.nullStorageRows)} |`,
  ].join("\n");
}

export function renderStorageRawReportRemediationPlanMarkdown(report) {
  const lines = [
    "# Storage Raw Report Remediation Plan",
    "",
    "Sanitized dry-run-only plan. No raw report bytes, inline base64 values, raw report text, signed URLs, storage secrets, database URLs, or real consumer PII are printed.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Evidence type: ${report.evidenceType}`,
    `Status: ${report.status}`,
    `Dry-run only: ${report.dryRunOnly ? "yes" : "no"}`,
    `Production mutation refused: ${report.productionMutationRefused ? "yes" : "no"}`,
    "",
    "## Inventory Evidence",
    "",
    `- Path: \`${report.inventoryEvidence.path}\``,
    `- Exists: ${report.inventoryEvidence.exists ? "yes" : "no"}`,
    `- Status: ${report.inventoryEvidence.status}`,
    `- Counts reliable: ${report.inventoryEvidence.countsReliable ? "yes" : "no"}`,
    `- Sensitive findings: ${report.inventoryEvidence.sensitiveFindings.length}`,
    "",
    "## Estimated Counts",
    "",
    renderCountsTable("reportArtifact.storageUrl", report.estimatedCounts.reportArtifact),
    "",
    renderCountsTable("evidenceAttachment.storageUrl", report.estimatedCounts.evidenceAttachment),
    "",
    "## Remediation Categories",
    "",
    "| Table | Field | Category | Estimated rows | Planned action |",
    "| --- | --- | --- | ---: | --- |",
    ...report.remediationCategories.map(
      (item) =>
        `| ${item.table} | ${item.field} | ${item.category} | ${countLabel(item.estimatedRows)} | ${item.remediationAction} |`,
    ),
    "",
    "## Operator Approval Requirements",
    "",
    ...report.operatorApprovalRequirements.map((item) => `- ${item}`),
    "",
    "## Backup Prerequisite",
    "",
    report.backupPrerequisite,
    "",
    "## Rollback Strategy",
    "",
    ...report.rollbackStrategy.map((item) => `- ${item}`),
    "",
    "## Post-Remediation Validation",
    "",
    ...report.postRemediationValidationSteps.map((item) => `- ${item}`),
    "",
    "## Safety",
    "",
    ...report.requiredStatements.map((item) => `- ${item}`),
  ];
  return `${lines.join("\n")}\n`;
}

export function writeStorageRawReportRemediationPlan(report, { rootDir = process.cwd() } = {}) {
  writeText(rootDir, RAW_REPORT_REMEDIATION_PLAN_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeText(rootDir, RAW_REPORT_REMEDIATION_PLAN_MD_PATH, renderStorageRawReportRemediationPlanMarkdown(report));
  return {
    markdownPath: RAW_REPORT_REMEDIATION_PLAN_MD_PATH,
    jsonPath: RAW_REPORT_REMEDIATION_PLAN_JSON_PATH,
  };
}

function validatePostRemediationCounts(value) {
  const errors = [];
  if (!value || typeof value !== "object") {
    return {
      errors: ["postRemediationCounts must be present."],
      remainingPossibleInlineBase64Rows: null,
    };
  }
  const reportArtifact = safeNumber(value.reportArtifact?.possibleInlineBase64Rows);
  const evidenceAttachment = safeNumber(value.evidenceAttachment?.possibleInlineBase64Rows);
  if (!Number.isInteger(reportArtifact) || reportArtifact < 0) {
    errors.push("postRemediationCounts.reportArtifact.possibleInlineBase64Rows must be a non-negative integer.");
  }
  if (!Number.isInteger(evidenceAttachment) || evidenceAttachment < 0) {
    errors.push("postRemediationCounts.evidenceAttachment.possibleInlineBase64Rows must be a non-negative integer.");
  }
  return {
    errors,
    remainingPossibleInlineBase64Rows:
      errors.length === 0 && reportArtifact !== null && evidenceAttachment !== null
        ? reportArtifact + evidenceAttachment
        : null,
  };
}

export function validateRawReportRemediationAcceptanceEvidence(evidence) {
  const errors = [];
  const serialized = JSON.stringify(evidence ?? {});
  const sensitiveFindings = scanRawReportRemediationSensitiveContent(serialized);
  const postCounts = validatePostRemediationCounts(evidence?.postRemediationCounts);

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push("Raw report remediation acceptance evidence must be a JSON object.");
  }
  if (evidence?.evidenceType !== "HUMAN_OBSERVED_RAW_REPORT_REMEDIATION") {
    errors.push("evidenceType must be HUMAN_OBSERVED_RAW_REPORT_REMEDIATION.");
  }
  if (/\bsimulated\b/i.test(String(evidence?.evidenceType ?? "")) || evidence?.simulatedEvidence === true) {
    errors.push("SIMULATED evidence cannot be accepted as blocker 6 remediation proof.");
  }

  const requiredTextFields = [
    ["operatorNameOrRole", "operatorNameOrRole"],
    ["approvedAt", "approvedAt"],
    ["performedAt", "performedAt"],
    ["inventoryEvidencePath", "inventoryEvidencePath"],
    ["remediationPlanEvidencePath", "remediationPlanEvidencePath"],
  ];
  for (const [key, label] of requiredTextFields) {
    if (isPlaceholderValue(evidence?.[key])) errors.push(`${label} is required and cannot be a placeholder.`);
  }

  const requiredBooleans = [
    ["inventoryRun", true],
    ["remediationPlanApproved", true],
    ["remediationPerformedByOperatorOrApprovedProcess", true],
    ["oldInlineCompatibilityTested", true],
    ["sanitizedEvidence", true],
    ["postRemediationCountsRecorded", true],
    ["backupRestorePrerequisiteAcknowledged", true],
    ["operatorAcknowledgementSigned", true],
    ["historicalInlineRowsResolved", true],
    ["noRawSensitiveValuesAppearInEvidence", true],
    ["productionDataMutatedByCodex", false],
    ["codexPerformedRemediation", false],
  ];
  for (const [key, expected] of requiredBooleans) {
    if (evidence?.[key] !== expected) errors.push(`${key} must be ${expected}.`);
  }

  errors.push(...postCounts.errors);
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  const accepted = errors.length === 0;
  return {
    accepted,
    status: accepted ? "accepted" : "failed",
    errors,
    sensitiveFindings,
    remainingPossibleInlineBase64Rows: postCounts.remainingPossibleInlineBase64Rows,
    blockerCoverage: {
      historicalRawReportBytes: accepted,
    },
  };
}

function resolveAcceptanceEvidencePath(rootDir, evidencePath = null) {
  if (evidencePath) {
    const normalized = normalizeRelativePath(evidencePath);
    return {
      path: normalized,
      exists: existsSync(repoPath(rootDir, normalized)),
      explicit: true,
      type: normalized.endsWith(".json") ? "json" : "unsupported",
    };
  }
  if (existsSync(repoPath(rootDir, RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH))) {
    return {
      path: RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
      exists: true,
      explicit: false,
      type: "json",
    };
  }
  if (existsSync(repoPath(rootDir, RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH))) {
    return {
      path: RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
      exists: true,
      explicit: false,
      type: "unsupported",
    };
  }
  return {
    path: null,
    exists: false,
    explicit: false,
    type: "missing",
  };
}

export function buildRawReportRemediationAcceptanceReport({
  rootDir = process.cwd(),
  evidencePath = null,
  generatedAt = new Date().toISOString(),
  rawReportRemediationEvidence = null,
} = {}) {
  const resolved = rawReportRemediationEvidence
    ? { path: evidencePath ?? "injected-evidence", exists: true, explicit: false, type: "json" }
    : resolveAcceptanceEvidencePath(rootDir, evidencePath);

  if (!resolved.exists) {
    const status = resolved.explicit ? "failed" : "not-submitted";
    return {
      reportName: "storage-raw-report-remediation-acceptance",
      generatedAt,
      status,
      accepted: false,
      evidencePath: resolved.path,
      defaultEvidencePaths: [
        RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
        RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
      ],
      validation: {
        accepted: false,
        status,
        errors: resolved.explicit
          ? [`Submitted raw report remediation evidence file is missing: ${resolved.path}.`]
          : ["No raw report remediation acceptance evidence has been submitted."],
        sensitiveFindings: [],
        remainingPossibleInlineBase64Rows: null,
        blockerCoverage: {
          historicalRawReportBytes: false,
        },
      },
      blockerCoverage: {
        historicalRawReportBytes: false,
      },
      safety: {
        productionDataMutatedByCodex: false,
        codexPerformedRemediation: false,
        rawSensitiveValuesAccepted: false,
      },
    };
  }

  let parsed = rawReportRemediationEvidence;
  let readError = null;
  if (!parsed) {
    if (resolved.type !== "json") {
      readError = "Acceptance evidence must be submitted as sanitized JSON.";
    } else {
      try {
        parsed = JSON.parse(readText(rootDir, resolved.path));
      } catch {
        readError = "Acceptance evidence JSON could not be parsed.";
      }
    }
  }

  const validation = readError
    ? {
        accepted: false,
        status: "failed",
        errors: [readError],
        sensitiveFindings: [],
        remainingPossibleInlineBase64Rows: null,
        blockerCoverage: {
          historicalRawReportBytes: false,
        },
      }
    : validateRawReportRemediationAcceptanceEvidence(parsed);

  return {
    reportName: "storage-raw-report-remediation-acceptance",
    generatedAt,
    status: validation.accepted ? "accepted" : "failed",
    accepted: validation.accepted,
    evidencePath: resolved.path,
    defaultEvidencePaths: [
      RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
      RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
    ],
    validation,
    blockerCoverage: validation.blockerCoverage,
    safety: {
      productionDataMutatedByCodex: parsed?.productionDataMutatedByCodex === true,
      codexPerformedRemediation: parsed?.codexPerformedRemediation === true,
      rawSensitiveValuesAccepted: validation.sensitiveFindings.length > 0 && validation.accepted,
    },
  };
}

export function renderRawReportRemediationAcceptanceMarkdown(report) {
  const lines = [
    "# Storage Raw Report Remediation Acceptance",
    "",
    `Generated at: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Accepted: ${report.accepted ? "yes" : "no"}`,
    `Evidence path: ${report.evidencePath ?? "not submitted"}`,
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 6 historical raw report bytes: ${report.blockerCoverage?.historicalRawReportBytes ? "accepted" : "not accepted"}`,
    "",
    "## Validation",
    "",
  ];

  if (report.validation?.errors?.length) {
    lines.push(...report.validation.errors.map((error) => `- ${error}`));
  } else {
    lines.push("- Sanitized operator remediation evidence passed strict acceptance validation.");
  }

  lines.push(
    "",
    "## Safety",
    "",
    "- This command does not delete historical rows.",
    "- This command does not migrate production data.",
    "- This command does not access production backups.",
    "- This command does not mutate production.",
    "- Evidence containing raw sensitive values is never accepted.",
  );

  return `${lines.join("\n")}\n`;
}

export function writeRawReportRemediationAcceptanceReport(report, { rootDir = process.cwd() } = {}) {
  writeText(rootDir, RAW_REPORT_REMEDIATION_ACCEPTANCE_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  writeText(rootDir, RAW_REPORT_REMEDIATION_ACCEPTANCE_MD_PATH, renderRawReportRemediationAcceptanceMarkdown(report));
  return {
    markdownPath: RAW_REPORT_REMEDIATION_ACCEPTANCE_MD_PATH,
    jsonPath: RAW_REPORT_REMEDIATION_ACCEPTANCE_JSON_PATH,
  };
}

export function parseStorageRawReportRemediationArgs(args) {
  const options = {
    rootDir: process.cwd(),
    json: false,
    acceptance: false,
    evidencePath: null,
    noWrite: false,
    rawArgs: args,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (FORBIDDEN_MUTATION_ARGS.has(arg)) {
      throw new Error(`Unknown or forbidden option: ${arg}. This command is dry-run only and cannot mutate production.`);
    }
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--acceptance") {
      options.acceptance = true;
      continue;
    }
    if (arg === "--no-write") {
      options.noWrite = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--evidence") {
      options.evidencePath = normalizeRelativePath(nextValue());
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage: pnpm run storage:raw-report-remediation-plan -- [options]",
    "       pnpm run storage:raw-report-remediation-acceptance -- [options]",
    "",
    "Writes sanitized, non-mutating historical raw-report remediation plan or acceptance evidence.",
    "",
    "Options:",
    "  --json              Also print JSON report.",
    "  --root <path>       Project root. Defaults to current working directory.",
    "  --evidence <path>   Acceptance evidence JSON path.",
    "  --no-write          Do not write latest acceptance or plan outputs.",
  ].join("\n"));
}

function printPlanReport(report, outputs) {
  console.log("Sanitized storage raw report remediation plan generated.");
  console.log("Dry-run only. No historical rows were deleted or migrated.");
  console.log("No raw storageUrl values, raw bytes, signed URLs, secrets, database URLs, or PII were printed.");
  if (outputs) {
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
  console.log(`Status: ${report.status}`);
  console.log(`Blocker 6 accepted closed: ${report.blockerCoverage.blocker6AcceptedClosed ? "yes" : "no"}`);
}

function printAcceptanceReport(report, outputs) {
  if (report.status === "not-submitted") {
    console.log("No raw report remediation acceptance evidence artifact submitted.");
    console.log("Blocker 6 remains remediation-required.");
  } else if (report.status === "failed") {
    console.error("Raw report remediation acceptance failed.");
    for (const error of report.validation?.errors ?? []) console.error(`[FAIL] ${error}`);
  } else {
    console.log("Raw report remediation acceptance evidence accepted.");
    console.log(`Evidence path: ${report.evidencePath}`);
  }
  console.log(`Blocker 6 coverage: ${report.blockerCoverage?.historicalRawReportBytes ? "accepted" : "not accepted"}`);
  if (outputs) {
    console.log(`Markdown: ${outputs.markdownPath}`);
    console.log(`JSON: ${outputs.jsonPath}`);
  }
}

async function main() {
  const options = parseStorageRawReportRemediationArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.acceptance) {
    const report = buildRawReportRemediationAcceptanceReport({
      rootDir: options.rootDir,
      evidencePath: options.evidencePath,
    });
    const outputs = options.noWrite ? null : writeRawReportRemediationAcceptanceReport(report, { rootDir: options.rootDir });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printAcceptanceReport(report, outputs);
    if (report.status === "failed") process.exitCode = 1;
    return;
  }

  const report = buildStorageRawReportRemediationPlanReport({
    rootDir: options.rootDir,
    args: options.rawArgs,
  });
  const outputs = options.noWrite ? null : writeStorageRawReportRemediationPlan(report, { rootDir: options.rootDir });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printPlanReport(report, outputs);
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
