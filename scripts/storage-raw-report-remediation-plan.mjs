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
export const RAW_REPORT_REMEDIATION_ACCEPTANCE_TEMPLATE_JSON_PATH =
  "docs/production-scale/evidence/storage-raw-report-remediation-acceptance-template.json";
export const RAW_REPORT_REMEDIATION_ACCEPTANCE_TEMPLATE_MD_PATH =
  "docs/production-scale/evidence/storage-raw-report-remediation-acceptance-template.md";
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
    ["account-number-label", /\b(?:accountNumber|account_number|account\s+number)\s*[:=]\s*["']?[A-Za-z0-9-]{4,}/i],
    ["address-label", /\b(?:streetAddress|street_address|addressLine|address_line|mailingAddress|mailing_address)\s*[:=]/i],
    ["full-name-label", /\b(?:fullName|full_name|consumerName|consumer_name)\s*[:=]/i],
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

function validateCountsObject(value, label) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [`${label} counts must be present.`];
  }
  for (const key of [
    "totalRows",
    "storageUrlRows",
    "localReferenceRows",
    "possibleInlineBase64Rows",
    "dataUrlBase64Rows",
    "nonLocalReferenceRows",
    "nullStorageRows",
  ]) {
    const raw = value[key];
    if (!Number.isInteger(raw) || raw < 0) {
      errors.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  return errors;
}

export function validateStorageRawReportInventoryEvidence(inventory) {
  const errors = [];
  const sensitiveFindings = scanRawReportRemediationSensitiveContent(JSON.stringify(inventory ?? {}));

  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    errors.push("Inventory evidence must be a JSON object.");
  } else {
    if (inventory.evidenceType !== "SANITIZED_READ_ONLY_INVENTORY") {
      errors.push("evidenceType must be SANITIZED_READ_ONLY_INVENTORY.");
    }
    if (inventory.status !== "completed") errors.push("Inventory status must be completed.");
    if (inventory.databaseReachable !== true || inventory.countsReliable !== true) {
      errors.push("Reliable database connectivity is required before inventory can certify.");
    }
    if (!inventory.environment) errors.push("environment is required.");
    if (!inventory.generatedAt) errors.push("generatedAt is required.");
    if (inventory.inventoryMethod !== "read-only-aggregate-sql-counts") {
      errors.push("inventoryMethod must be read-only-aggregate-sql-counts.");
    }
    if (inventory.dataSource?.kind !== "database" || inventory.dataSource?.reliable !== true) {
      errors.push("dataSource must record a reliable database source.");
    }
    if (inventory.confidence?.level !== "high" || inventory.confidence?.countsReliable !== true) {
      errors.push("confidence must be high with reliable counts.");
    }
    if (inventory.rawValuesPrinted !== false || inventory.rawBytesPrinted !== false || inventory.signedUrlsPrinted !== false) {
      errors.push("Inventory must not print raw values, raw bytes, or signed URLs.");
    }
    if (inventory.productionDataMutated !== false || inventory.historicalRowsMigrated !== false) {
      errors.push("Inventory must be non-mutating and must not migrate historical rows.");
    }
    errors.push(...validateCountsObject(inventory.tables?.reportArtifact, "tables.reportArtifact"));
    errors.push(...validateCountsObject(inventory.tables?.evidenceAttachment, "tables.evidenceAttachment"));
    errors.push(...validateCountsObject(inventory.recordCounts?.reportArtifact, "recordCounts.reportArtifact"));
    errors.push(...validateCountsObject(inventory.recordCounts?.evidenceAttachment, "recordCounts.evidenceAttachment"));
    if (!inventory.unresolvedCounts || typeof inventory.unresolvedCounts !== "object") {
      errors.push("unresolvedCounts must be present.");
    }
    if (!inventory.remediationCandidateCounts || typeof inventory.remediationCandidateCounts !== "object") {
      errors.push("remediationCandidateCounts must be present.");
    }
  }

  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  const accepted = errors.length === 0;
  return {
    accepted,
    certifying: accepted,
    status: accepted ? "accepted-reliable-inventory" : "failed",
    errors,
    sensitiveFindings,
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
      validation: {
        accepted: false,
        certifying: false,
        status: "failed",
        errors: ["Inventory evidence file is missing."],
        sensitiveFindings: [],
      },
      tables: {
        reportArtifact: unavailableCounts(),
        evidenceAttachment: unavailableCounts(),
      },
    };
  }

  const inventory = readJsonIfPresent(rootDir, RAW_REPORT_INVENTORY_JSON_PATH);
  const sensitiveFindings = scanRawReportRemediationSensitiveContent(JSON.stringify(inventory ?? {}));
  const validation = validateStorageRawReportInventoryEvidence(inventory);
  const countsReliable = validation.accepted;
  return {
    path: RAW_REPORT_INVENTORY_JSON_PATH,
    exists: true,
    status: sensitiveFindings.length > 0 ? "rejected-sensitive-inventory" : String(inventory?.status ?? "unknown"),
    countsReliable,
    generatedAt: inventory?.generatedAt ?? null,
    sensitiveFindings,
    validation,
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
      remediationAction: "Machine-attested bounded copy to report-artifact storage reference after checksum verification; keep legacy resolver compatibility during rollout.",
    },
    {
      table: "report_artifact",
      field: "storage_url",
      category: "data-url-inline-pdf-candidates",
      estimatedRows: reportArtifact.dataUrlBase64Rows,
      remediationAction: "Machine-attested bounded normalize data URL payload to storage reference after validation; preserve rollback snapshot.",
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
      remediationAction: "Machine-attested bounded copy to evidence attachment storage reference after checksum verification; keep legacy resolver compatibility during rollout.",
    },
    {
      table: "evidence_attachment",
      field: "storage_url",
      category: "data-url-inline-attachment-candidates",
      estimatedRows: evidenceAttachment.dataUrlBase64Rows,
      remediationAction: "Machine-attested bounded normalize data URL payload to storage reference after validation; preserve rollback snapshot.",
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
  const status = inventoryReady ? "planned-awaiting-machine-proof" : inventory.exists ? "inventory-unreliable" : "inventory-missing";
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
      validation: inventory.validation,
    },
    affectedTables,
    estimatedCounts: {
      reportArtifact: inventory.tables.reportArtifact,
      evidenceAttachment: inventory.tables.evidenceAttachment,
    },
    remediationCategories: categories,
    remediationPlan: {
      dryRunOnly: true,
      applySeparation: "This script never applies remediation; a separate non-interactive machine proof must certify any bounded apply.",
      mutationCommandAvailable: false,
      productionMutationAllowed: false,
      inventoryReliableRequiredForAcceptance: true,
      steps: [
        "Confirm a current staging-safe sanitized inventory exists and counts are reliable.",
        "Take a fresh backup before any bounded remediation.",
        "Use a machine-attested process to copy inline bytes to storage references in bounded batches with checksum verification.",
        "Retain old inline compatibility until post-remediation read-path checks pass.",
        "Record pre/post aggregate counts only; do not record raw storageUrl values or raw bytes.",
        "Submit sanitized machine-attested acceptance evidence for blocker 6 review.",
      ],
    },
    rollbackStrategy: [
      "Do not delete historical rows during remediation.",
      "Capture a pre-remediation backup and row-count snapshot before any bounded remediation process.",
      "Use transaction-bounded batches so failed batches can be rolled back independently.",
      "Preserve legacy inline resolver compatibility until post-remediation validation is complete.",
      "If validation fails, restore affected storage_url values from the approved backup/snapshot and rerun compatibility checks.",
    ],
    machineProofRequirements: [
      "Machine proof references the sanitized inventory and this dry-run plan evidence.",
      "Machine proof confirms no raw PII, raw report bytes, signed URLs, storage secrets, or database URLs are included in evidence.",
      "Machine proof confirms this planning command did not run production mutation.",
      "Machine proof records bounded batch size, rollback verification, and validation result.",
      "Machine proof is non-interactive and does not require operator acknowledgement or manual approval.",
    ],
    backupPrerequisite:
      "A fresh backup and machine restore-readiness proof are required before any bounded remediation process certifies.",
    postRemediationValidationSteps: [
      "Rerun pnpm run storage:raw-report-inventory and compare aggregate counts only.",
      "Verify legacy inline reportArtifact records remain readable through resolveReportArtifactPdfBase64 compatibility tests.",
      "Verify legacy inline evidenceAttachment records remain readable through resolveEvidenceAttachmentBase64 compatibility tests.",
      "Run pnpm run test:api and focused storage compatibility tests.",
      "Submit sanitized machine acceptance evidence with post-remediation counts.",
    ],
    blockerCoverage: {
      blocker6GovernedWorkflowPrepared: inventoryReady,
      blocker6AcceptedClosed: false,
    },
    acceptancePolicy: {
      reliableInventoryRequired: true,
      dryRunPlanIsNotCompleteRemediation: true,
      machineApplyProofRequired: true,
      productionProofRequiresAcceptedProductionEvidence: true,
      stagingInventoryIsStagingProofOnly: true,
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
      "Blocker 6 remains remediation-required until sanitized machine acceptance evidence is submitted and accepted.",
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
    `- Inventory accepted: ${report.inventoryEvidence.validation?.accepted ? "yes" : "no"}`,
    `- Inventory validation errors: ${report.inventoryEvidence.validation?.errors?.length ?? 0}`,
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
    "## Machine Proof Requirements",
    "",
    ...report.machineProofRequirements.map((item) => `- ${item}`),
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

function pathUnderProductionEvidenceDir(value, label) {
  const errors = [];
  const normalized = normalizeRelativePath(value);
  if (isPlaceholderValue(normalized)) {
    errors.push(`${label} is required and cannot be a placeholder.`);
  } else if (!normalized.startsWith("docs/production-scale/evidence/")) {
    errors.push(`${label} must be under docs/production-scale/evidence/.`);
  }
  return errors;
}

function validateRawReportRemediationPlanEvidence(plan, inventoryValidation) {
  const errors = [];
  const sensitiveFindings = scanRawReportRemediationSensitiveContent(JSON.stringify(plan ?? {}));
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    errors.push("Remediation plan evidence must be present.");
  } else {
    if (plan.evidenceType !== "SANITIZED_DRY_RUN_REMEDIATION_PLAN") {
      errors.push("Remediation plan evidenceType must be SANITIZED_DRY_RUN_REMEDIATION_PLAN.");
    }
    if (plan.dryRunOnly !== true || plan.productionMutationRefused !== true) {
      errors.push("Remediation plan must be dry-run only and production-mutation-refusing.");
    }
    if (plan.status !== "planned-awaiting-machine-proof") {
      errors.push("Remediation plan must be based on reliable inventory before acceptance can close remediation.");
    }
    if (plan.inventoryEvidence?.countsReliable !== true || plan.inventoryEvidence?.validation?.accepted !== true) {
      errors.push("Remediation plan must record accepted reliable inventory evidence.");
    }
    if (inventoryValidation?.accepted !== true) {
      errors.push("Remediation plan cannot close without accepted reliable inventory evidence.");
    }
    if (plan.blockerCoverage?.blocker6GovernedWorkflowPrepared !== true) {
      errors.push("Remediation plan must prepare blocker 6 governed workflow from reliable inventory.");
    }
    if (plan.rawValuesPrinted !== false || plan.rawBytesPrinted !== false || plan.signedUrlsPrinted !== false) {
      errors.push("Remediation plan must not print raw values, raw bytes, or signed URLs.");
    }
    if (plan.safety?.rawSensitiveValuesExposed === true || plan.safety?.productionDataMutated === true) {
      errors.push("Remediation plan must not expose raw sensitive values or mutate production.");
    }
  }
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected in remediation plan: ${sensitiveFindings.join(", ")}.`);
  }
  return {
    accepted: errors.length === 0,
    errors,
    sensitiveFindings,
  };
}

export function validateRawReportRemediationAcceptanceEvidence(
  evidence,
  {
    inventoryEvidence = null,
    remediationPlanEvidence = null,
  } = {},
) {
  const errors = [];
  const serialized = JSON.stringify(evidence ?? {});
  const sensitiveFindings = scanRawReportRemediationSensitiveContent(serialized);
  const postCounts = validatePostRemediationCounts(evidence?.postRemediationCounts);
  const inventoryValidation = validateStorageRawReportInventoryEvidence(inventoryEvidence);
  const remediationPlanValidation = validateRawReportRemediationPlanEvidence(remediationPlanEvidence, inventoryValidation);

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push("Raw report remediation acceptance evidence must be a JSON object.");
  }
  if (isPlaceholderValue(evidence?.evidenceId)) {
    errors.push("evidenceId is required and cannot be a placeholder.");
  }
  if (evidence?.evidenceType !== "MACHINE_ATTESTED_RAW_REPORT_REMEDIATION") {
    errors.push("evidenceType must be MACHINE_ATTESTED_RAW_REPORT_REMEDIATION.");
  }
  if (evidence?.environment !== "production") {
    errors.push("environment must be production for blocker 6 production remediation proof.");
  }
  if (!["apply", "machine-applied", "completed-machine-apply", "approved-bounded"].includes(String(evidence?.remediationMode ?? ""))) {
    errors.push("remediationMode must record a machine-attested bounded remediation, not a dry-run.");
  }
  if (evidence?.dryRunOnly === true || evidence?.dryRunOnlyRemediation === true) {
    errors.push("Dry-run-only remediation evidence cannot close production raw-report remediation.");
  }
  if (/\bsimulated\b/i.test(String(evidence?.evidenceType ?? "")) || evidence?.simulatedEvidence === true) {
    errors.push("SIMULATED evidence cannot be accepted as blocker 6 remediation proof.");
  }
  if (evidence?.operatorAcknowledgementSigned === true || evidence?.remediationPerformedByOperatorOrApprovedProcess === true) {
    errors.push("Legacy operator acknowledgement or operator-applied proof is not accepted; use machine-attested remediation proof.");
  }

  const requiredTextFields = [
    ["machineActorId", "machineActorId"],
    ["machineProofGeneratedAt", "machineProofGeneratedAt"],
    ["performedAt", "performedAt"],
    ["inventoryEvidencePath", "inventoryEvidencePath"],
    ["remediationPlanEvidencePath", "remediationPlanEvidencePath"],
  ];
  for (const [key, label] of requiredTextFields) {
    if (isPlaceholderValue(evidence?.[key])) errors.push(`${label} is required and cannot be a placeholder.`);
  }
  errors.push(...pathUnderProductionEvidenceDir(evidence?.inventoryEvidencePath, "inventoryEvidencePath"));
  errors.push(...pathUnderProductionEvidenceDir(evidence?.remediationPlanEvidencePath, "remediationPlanEvidencePath"));
  if (evidence?.supportingEvidencePaths !== undefined && !Array.isArray(evidence.supportingEvidencePaths)) {
    errors.push("supportingEvidencePaths must be an array when present.");
  }
  for (const [index, attachmentPath] of (Array.isArray(evidence?.supportingEvidencePaths) ? evidence.supportingEvidencePaths : []).entries()) {
    errors.push(...pathUnderProductionEvidenceDir(attachmentPath, `supportingEvidencePaths[${index}]`));
  }

  const requiredBooleans = [
    ["inventoryRun", true],
    ["reliableInventoryAccepted", true],
    ["remediationPlanPolicySatisfied", true],
    ["remediationPerformedByMachineProcess", true],
    ["remediationApplied", true],
    ["oldInlineCompatibilityTested", true],
    ["sanitizedEvidence", true],
    ["postRemediationCountsRecorded", true],
    ["backupRestorePrerequisiteVerified", true],
    ["nonInteractive", true],
    ["machineAttested", true],
    ["humanObserved", false],
    ["manualApprovalRequired", false],
    ["historicalInlineRowsResolved", true],
    ["noRawSensitiveValuesAppearInEvidence", true],
    ["productionDataMutatedByCodex", false],
    ["codexPerformedRemediation", false],
  ];
  for (const [key, expected] of requiredBooleans) {
    if (evidence?.[key] !== expected) errors.push(`${key} must be ${expected}.`);
  }

  errors.push(...postCounts.errors);
  errors.push(...inventoryValidation.errors.map((error) => `Inventory evidence rejected: ${error}`));
  errors.push(...remediationPlanValidation.errors.map((error) => `Remediation plan evidence rejected: ${error}`));
  if (sensitiveFindings.length > 0) {
    errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  }

  const accepted = errors.length === 0;
  return {
    accepted,
    status: accepted ? "accepted" : "failed",
    errors,
    sensitiveFindings,
    inventoryValidation,
    remediationPlanValidation,
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

function readLinkedJsonEvidence(rootDir, relativePath, label) {
  const errors = pathUnderProductionEvidenceDir(relativePath, label);
  if (errors.length > 0) {
    return { parsed: null, error: errors[0] };
  }
  const normalized = normalizeRelativePath(relativePath);
  if (!existsSync(repoPath(rootDir, normalized))) {
    return { parsed: null, error: `${label} file is missing: ${normalized}.` };
  }
  try {
    return { parsed: JSON.parse(readText(rootDir, normalized)), error: null };
  } catch {
    return { parsed: null, error: `${label} JSON could not be parsed.` };
  }
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
      productionProof: false,
      stagingProof: false,
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
        inventoryValidation: validateStorageRawReportInventoryEvidence(null),
        remediationPlanValidation: validateRawReportRemediationPlanEvidence(null, validateStorageRawReportInventoryEvidence(null)),
        remainingPossibleInlineBase64Rows: null,
        blockerCoverage: {
          historicalRawReportBytes: false,
        },
      },
      linkedEvidence: {
        inventoryEvidencePath: null,
        remediationPlanEvidencePath: null,
        reliableInventoryAccepted: false,
        remediationPlanAccepted: false,
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

  let inventoryEvidence = null;
  let remediationPlanEvidence = null;
  const linkedEvidenceErrors = [];
  if (!readError && parsed) {
    const inventoryRead = readLinkedJsonEvidence(rootDir, parsed.inventoryEvidencePath, "inventoryEvidencePath");
    const planRead = readLinkedJsonEvidence(rootDir, parsed.remediationPlanEvidencePath, "remediationPlanEvidencePath");
    inventoryEvidence = inventoryRead.parsed;
    remediationPlanEvidence = planRead.parsed;
    if (inventoryRead.error) linkedEvidenceErrors.push(inventoryRead.error);
    if (planRead.error) linkedEvidenceErrors.push(planRead.error);
  }

  const validation = readError
    ? {
        accepted: false,
        status: "failed",
        errors: [readError],
        sensitiveFindings: [],
        inventoryValidation: validateStorageRawReportInventoryEvidence(null),
        remediationPlanValidation: validateRawReportRemediationPlanEvidence(null, validateStorageRawReportInventoryEvidence(null)),
        remainingPossibleInlineBase64Rows: null,
        blockerCoverage: {
          historicalRawReportBytes: false,
        },
      }
    : validateRawReportRemediationAcceptanceEvidence(parsed, {
        inventoryEvidence,
        remediationPlanEvidence,
      });
  validation.errors.push(...linkedEvidenceErrors);
  if (linkedEvidenceErrors.length > 0) {
    validation.accepted = false;
    validation.status = "failed";
    validation.blockerCoverage = { historicalRawReportBytes: false };
  }

  return {
    reportName: "storage-raw-report-remediation-acceptance",
    generatedAt,
    status: validation.accepted ? "accepted" : "failed",
    accepted: validation.accepted,
    productionProof: validation.accepted && parsed?.environment === "production",
    stagingProof: parsed?.environment === "staging" && validation.accepted,
    evidencePath: resolved.path,
    defaultEvidencePaths: [
      RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_JSON_PATH,
      RAW_REPORT_REMEDIATION_ACCEPTANCE_EVIDENCE_MD_PATH,
    ],
    linkedEvidence: {
      inventoryEvidencePath: parsed?.inventoryEvidencePath ?? null,
      remediationPlanEvidencePath: parsed?.remediationPlanEvidencePath ?? null,
      reliableInventoryAccepted: validation.inventoryValidation?.accepted === true,
      remediationPlanAccepted: validation.remediationPlanValidation?.accepted === true,
    },
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
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    `Evidence path: ${report.evidencePath ?? "not submitted"}`,
    "",
    "## Linked Evidence",
    "",
    `- Reliable inventory accepted: ${report.linkedEvidence?.reliableInventoryAccepted ? "yes" : "no"}`,
    `- Remediation plan accepted: ${report.linkedEvidence?.remediationPlanAccepted ? "yes" : "no"}`,
    `- Inventory path: \`${report.linkedEvidence?.inventoryEvidencePath ?? "not submitted"}\``,
    `- Plan path: \`${report.linkedEvidence?.remediationPlanEvidencePath ?? "not submitted"}\``,
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
    lines.push("- Sanitized machine remediation evidence passed strict acceptance validation.");
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
