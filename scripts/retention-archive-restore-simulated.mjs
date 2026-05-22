import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanRestoreDrillEvidenceSensitiveContent } from "./staging-backup-restore-checklist.mjs";

export const DEFAULT_RETENTION_EVIDENCE_DIR = "docs/production-scale/evidence";
export const RETENTION_ARCHIVE_RESTORE_MARKERS = {
  preview: "SIMULATED_RETENTION_PREVIEW_COMPLETED",
  archiveWrite: "SIMULATED_RETENTION_ARCHIVE_WRITE_COMPLETED",
  restoreVerify: "SIMULATED_RETENTION_RESTORE_VERIFY_COMPLETED",
  auditEvents: "SIMULATED_RETENTION_AUDIT_EVENTS_EMITTED",
  applyGuard: "SIMULATED_RETENTION_APPLY_GUARD_VERIFIED",
};

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_SECRET_KEYS = ["FLOOT_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];
const APPLY_CONFIRMATION = "APPLY_RETENTION_PURGE";
const ONE_YEAR_DAYS = 365;

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

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function detectRetentionSimulationProductionEnvironment(env = process.env) {
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

function syntheticRetentionRecords(generatedAt) {
  const now = new Date(generatedAt);
  const oldDate = new Date(now.getTime() - (ONE_YEAR_DAYS + 45) * 24 * 60 * 60 * 1000).toISOString();
  const recentDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: "SIMULATED-RETENTION-REPORT-001",
      table: "reportArtifact",
      ownerKey: "SIMULATED-OWNER-A",
      createdAt: oldDate,
      payloadHash: sha256("SIMULATED report artifact payload 001"),
    },
    {
      id: "SIMULATED-RETENTION-TRADELINE-001",
      table: "tradeline",
      ownerKey: "SIMULATED-OWNER-A",
      createdAt: oldDate,
      payloadHash: sha256("SIMULATED tradeline payload 001"),
    },
    {
      id: "SIMULATED-RETENTION-EVIDENCE-001",
      table: "evidenceEvent",
      ownerKey: "SIMULATED-OWNER-A",
      createdAt: oldDate,
      payloadHash: sha256("SIMULATED evidence event payload 001"),
    },
    {
      id: "SIMULATED-RETENTION-RECENT-001",
      table: "reportArtifact",
      ownerKey: "SIMULATED-OWNER-B",
      createdAt: recentDate,
      payloadHash: sha256("SIMULATED recent payload 001"),
    },
  ];
}

function simulatePreview(records, generatedAt) {
  const cutoff = new Date(new Date(generatedAt).getTime() - ONE_YEAR_DAYS * 24 * 60 * 60 * 1000);
  const eligible = records.filter((record) => new Date(record.createdAt) < cutoff);
  return {
    marker: RETENTION_ARCHIVE_RESTORE_MARKERS.preview,
    status: "passed",
    retentionWindowDays: ONE_YEAR_DAYS,
    cutoffIso: cutoff.toISOString(),
    eligibleRecordCount: eligible.length,
    totalRecordCount: records.length,
    eligibleRecordIds: eligible.map((record) => record.id),
    destructiveMutationPerformed: false,
  };
}

function simulateArchiveWrite(eligibleRecords, simulationId, generatedAt) {
  const archiveId = `SIMULATED-RETENTION-ARCHIVE-${simulationId}`;
  const archivedRecords = eligibleRecords.map((record) => ({
    syntheticArchiveRecordId: `SIMULATED-ARCHIVE-ENTRY-${record.id}`,
    sourceRecordId: record.id,
    table: record.table,
    payloadHash: record.payloadHash,
  }));
  return {
    marker: RETENTION_ARCHIVE_RESTORE_MARKERS.archiveWrite,
    status: "passed",
    archiveId,
    archiveCreatedAt: generatedAt,
    archivedRecordCount: archivedRecords.length,
    archivedRecords,
    archiveManifestHash: sha256(JSON.stringify(archivedRecords)),
    syntheticOnly: true,
    physicalArchiveWritten: false,
  };
}

function simulateRestoreVerification(archive, eligibleRecords, simulationId) {
  const restoredHashes = new Map(archive.archivedRecords.map((record) => [record.sourceRecordId, record.payloadHash]));
  const verifiedRecords = eligibleRecords.map((record) => ({
    sourceRecordId: record.id,
    restoredPayloadHash: restoredHashes.get(record.id),
    sourcePayloadHash: record.payloadHash,
    verified: restoredHashes.get(record.id) === record.payloadHash,
  }));
  return {
    marker: RETENTION_ARCHIVE_RESTORE_MARKERS.restoreVerify,
    status: verifiedRecords.every((record) => record.verified) ? "passed" : "failed",
    restoreVerificationId: `SIMULATED-RETENTION-RESTORE-${simulationId}`,
    verifiedRecordCount: verifiedRecords.filter((record) => record.verified).length,
    expectedRecordCount: eligibleRecords.length,
    verifiedRecords,
    machinePhysicalRestoreProofStillRequired: true,
  };
}

function simulateAuditEvents({ preview, archive, restoreVerification, simulationId, generatedAt }) {
  const events = [
    {
      eventId: `SIMULATED-AUDIT-${simulationId}-PREVIEW`,
      action: "RETENTION_PREVIEW_SIMULATED",
      marker: preview.marker,
      at: generatedAt,
      status: "SUCCESS",
    },
    {
      eventId: `SIMULATED-AUDIT-${simulationId}-ARCHIVE`,
      action: "RETENTION_ARCHIVE_WRITE_SIMULATED",
      marker: archive.marker,
      at: generatedAt,
      status: "SUCCESS",
    },
    {
      eventId: `SIMULATED-AUDIT-${simulationId}-RESTORE`,
      action: "RETENTION_RESTORE_VERIFY_SIMULATED",
      marker: restoreVerification.marker,
      at: generatedAt,
      status: "SUCCESS",
    },
    {
      eventId: `SIMULATED-AUDIT-${simulationId}-APPLY-GUARD`,
      action: "RETENTION_APPLY_GUARD_SIMULATED",
      marker: RETENTION_ARCHIVE_RESTORE_MARKERS.applyGuard,
      at: generatedAt,
      status: "SUCCESS",
    },
  ];
  return {
    marker: RETENTION_ARCHIVE_RESTORE_MARKERS.auditEvents,
    status: "passed",
    eventCount: events.length,
    events,
  };
}

function verifyApplyGuard(rootDir) {
  const adminSchema = readFileSync(repoPath(rootDir, "endpoints/admin/retention_POST.schema.ts"), "utf8");
  const cronSchema = readFileSync(repoPath(rootDir, "endpoints/retention/auto-purge_POST.schema.ts"), "utf8");
  const adminEndpoint = readFileSync(repoPath(rootDir, "endpoints/admin/retention_POST.ts"), "utf8");
  const cronEndpoint = readFileSync(repoPath(rootDir, "endpoints/retention/auto-purge_POST.ts"), "utf8");
  const helper = readFileSync(repoPath(rootDir, "helpers/dataRetention.tsx"), "utf8");
  const applyGuard = readFileSync(repoPath(rootDir, "helpers/retentionApplyGuard.ts"), "utf8");
  const adminConfirmationGuard = adminSchema.includes("RETENTION_APPLY_CONFIRMATION") || adminSchema.includes(APPLY_CONFIRMATION);
  const cronConfirmationGuard = cronSchema.includes("RETENTION_APPLY_CONFIRMATION") || cronSchema.includes(APPLY_CONFIRMATION);
  const applyGuardConstantPresent = applyGuard.includes(APPLY_CONFIRMATION);
  const ok =
    adminConfirmationGuard &&
    cronConfirmationGuard &&
    applyGuardConstantPresent &&
    adminEndpoint.includes("previewRetention()") &&
    cronEndpoint.includes("previewRetention()") &&
    helper.includes("confirmDelete flag is false") &&
    helper.includes("365 * 24 * 60 * 60 * 1000");
  return {
    marker: RETENTION_ARCHIVE_RESTORE_MARKERS.applyGuard,
    status: ok ? "passed" : "failed",
    destructivePathRequiresConfirmation: adminConfirmationGuard && cronConfirmationGuard && applyGuardConstantPresent,
    previewDefaultPresent: adminEndpoint.includes("previewRetention()") && cronEndpoint.includes("previewRetention()"),
    confirmDeleteGuardPresent: helper.includes("confirmDelete flag is false"),
    retentionWindowDays: ONE_YEAR_DAYS,
    retentionWindowChangedByThisCommand: false,
  };
}

export function scanRetentionEvidenceSensitiveContent(text) {
  const findings = new Set(scanRestoreDrillEvidenceSensitiveContent(text));
  const extraPatterns = [
    { name: "raw-signature-data", pattern: /\bsignatureData\s*[:=]\s*["']?data:/i },
    { name: "signed-url", pattern: /https?:\/\/[^\s]+(?:X-Amz-Signature|GoogleAccessId|Signature=)[^\s]*/i },
  ];
  for (const item of extraPatterns) {
    if (item.pattern.test(text)) findings.add(item.name);
  }
  return Array.from(findings).sort();
}

function hasProductionRestoreClaim(text) {
  return /\bproduction\b.{0,80}\b(?:retention\s+)?(?:archive|restore|purge)\b.{0,80}\b(completed|complete|succeeded|successful|passed|done)\b/i.test(text) ||
    /\b(?:retention\s+)?(?:archive|restore|purge)\b.{0,80}\bproduction\b.{0,80}\b(completed|complete|succeeded|successful|passed|done)\b/i.test(text);
}

export function validateRetentionArchiveRestoreEvidenceText(text) {
  const source = String(text ?? "");
  const evidenceTypeMatches = source.match(/\b(SIMULATED|MACHINE[- ]ATTESTED)\b/gi) ?? [];
  const hasEvidenceType = evidenceTypeMatches.length > 0;
  const simulated = /\bSIMULATED\b/i.test(source);
  const machineAttested = /\bMACHINE[- ]ATTESTED\b/i.test(source);
  const sensitiveFindings = scanRetentionEvidenceSensitiveContent(source);
  const productionRestoreClaimed = hasProductionRestoreClaim(source);
  const syntheticArchiveIdPresent = /SIMULATED-RETENTION-ARCHIVE-[A-Za-z0-9_-]+/i.test(source);
  const syntheticRestoreIdPresent = /SIMULATED-RETENTION-RESTORE-[A-Za-z0-9_-]+/i.test(source);
  const requiredMachineFields = ["machineAttested", "nonInteractive", "sanitizedArtifacts"];
  const missingMachineProofFields = productionRestoreClaimed && !machineAttested
    ? requiredMachineFields
    : productionRestoreClaimed
      ? requiredMachineFields.filter((field) => !new RegExp(field, "i").test(source))
      : [];
  const errors = [];
  if (!hasEvidenceType) errors.push("Evidence must identify SIMULATED or MACHINE-ATTESTED proof type.");
  if (simulated && !syntheticArchiveIdPresent) errors.push("SIMULATED evidence must include a synthetic archive ID.");
  if (simulated && !syntheticRestoreIdPresent) errors.push("SIMULATED evidence must include a synthetic restore verification ID.");
  if (sensitiveFindings.length > 0) errors.push(`Sensitive content detected: ${sensitiveFindings.join(", ")}.`);
  if (productionRestoreClaimed && missingMachineProofFields.length > 0) {
    errors.push(`Production retention restore/archive claim requires machine proof fields: ${missingMachineProofFields.join(", ")}.`);
  }
  return {
    ok: errors.length === 0,
    errors,
    evidenceType: simulated ? "SIMULATED" : machineAttested ? "MACHINE-ATTESTED" : "unknown",
    sensitiveFindings,
    productionRestoreClaimed,
    syntheticArchiveIdPresent,
    syntheticRestoreIdPresent,
    missingMachineProofFields,
  };
}

export function validateSimulatedRetentionArchiveRestoreReport(report) {
  const errors = [];
  if (report.evidenceType !== "SIMULATED") errors.push("report evidenceType must be SIMULATED");
  if (report.machinePhysicalArchiveRestoreProofStillRequired !== true) {
    errors.push("machinePhysicalArchiveRestoreProofStillRequired must be true");
  }
  if (!String(report.archive?.archiveId ?? "").startsWith("SIMULATED-RETENTION-ARCHIVE-")) {
    errors.push("archiveId must be synthetic");
  }
  if (!String(report.restoreVerification?.restoreVerificationId ?? "").startsWith("SIMULATED-RETENTION-RESTORE-")) {
    errors.push("restoreVerificationId must be synthetic");
  }
  if (report.preview?.destructiveMutationPerformed !== false) errors.push("preview must be non-destructive");
  if (report.archive?.physicalArchiveWritten !== false) errors.push("physical archive must not be written");
  if (report.applyGuard?.status !== "passed") errors.push("apply guard verification must pass");
  if ((report.auditEvidence?.eventCount ?? 0) < 4) errors.push("simulated audit events are missing");
  if (report.safety?.productionDataMutated !== false) errors.push("production data must not be mutated");
  if (report.safety?.destructiveRetentionEnabled !== false) errors.push("destructive retention must not be enabled");
  if (report.safety?.retentionWindowsChanged !== false) errors.push("retention windows must not change");
  if (report.safety?.liveExternalProvidersConnected !== false) errors.push("external providers must not be connected");

  const textValidation = validateRetentionArchiveRestoreEvidenceText(JSON.stringify(report));
  if (!textValidation.ok) errors.push(...textValidation.errors);

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function buildSimulatedRetentionArchiveRestoreReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  simulationId = `sim-retention-${randomUUID()}`,
} = {}) {
  const productionEnvironment = detectRetentionSimulationProductionEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing SIMULATED retention archive/restore in a production-like environment: ${productionEnvironment.reason}`);
  }

  const branch = safeGit(["branch", "--show-current"], rootDir);
  const commit = safeGit(["rev-parse", "HEAD"], rootDir);
  const records = syntheticRetentionRecords(generatedAt);
  const preview = simulatePreview(records, generatedAt);
  const eligibleRecords = records.filter((record) => preview.eligibleRecordIds.includes(record.id));
  const archive = simulateArchiveWrite(eligibleRecords, simulationId, generatedAt);
  const restoreVerification = simulateRestoreVerification(archive, eligibleRecords, simulationId);
  const applyGuard = verifyApplyGuard(rootDir);
  const auditEvidence = simulateAuditEvents({ preview, archive, restoreVerification, simulationId, generatedAt });

  const report = {
    reportName: "retention-archive-restore-simulated",
    evidenceType: "SIMULATED",
    generatedAt,
    branch,
    commit,
    simulationId,
    status: restoreVerification.status === "passed" && applyGuard.status === "passed" ? "passed" : "failed",
    readinessClaim: "No production, broad-production, or production-at-scale readiness claim is made.",
    machinePhysicalArchiveRestoreProofStillRequired: true,
    relationToDisasterRecovery: "SIMULATED retention archive/restore proof is lifecycle recoverability evidence only. It is not a substitute for non-interactive disaster recovery restore machine proof.",
    syntheticRecords: records,
    preview,
    archive,
    restoreVerification,
    auditEvidence,
    applyGuard,
    validationRules: {
      evidenceMustIdentifySimulatedOrMachineAttested: true,
      simulatedEvidenceRequiresSyntheticArchiveAndRestoreIds: true,
      noRawPiiOrSecretsAllowed: true,
      productionRestoreClaimsRequireMachineProof: true,
    },
    safety: {
      evidenceType: "SIMULATED",
      syntheticFixturesOnly: true,
      productionDataMutated: false,
      productionDataPurged: false,
      destructiveRetentionEnabled: false,
      existingPreviewConfirmationGuardsWeakened: false,
      retentionWindowsChanged: false,
      liveExternalProvidersConnected: false,
      realConsumerPiiUsed: false,
      realCreditReportsUsed: false,
      productionDatabaseDumpsUsed: false,
      changesParserBehavior: false,
      changesOcrBehavior: false,
      changesPacketWording: false,
      changesViolationLogic: false,
      changesStorageBehavior: false,
      changesPacketPdfBehavior: false,
      changesResponseQueueSemantics: false,
      changesDbPoolBehavior: false,
      changesDeploymentActivation: false,
    },
  };

  const validation = validateSimulatedRetentionArchiveRestoreReport(report);
  if (!validation.ok) {
    throw new Error(`SIMULATED retention archive/restore validation failed: ${validation.errors.join("; ")}`);
  }
  return {
    ...report,
    validation,
  };
}

export function renderSimulatedRetentionArchiveRestoreMarkdown(report) {
  const lines = [
    "# SIMULATED Retention Archive/Restore Evidence",
    "",
    "SIMULATED evidence only. This is not physical retention archive/restore completion and is not production proof.",
    "",
    `Generated at: ${report.generatedAt}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Simulation ID: \`${report.simulationId}\``,
    `Status: ${report.status}`,
    `Evidence type: ${report.evidenceType}`,
    `Machine physical archive/restore proof still required: ${report.machinePhysicalArchiveRestoreProofStillRequired ? "yes" : "no"}`,
    "",
    "## SIMULATED Retention Preview",
    "",
    `- Marker: ${report.preview.marker}`,
    `- Retention window days: ${report.preview.retentionWindowDays}`,
    `- Eligible synthetic records: ${report.preview.eligibleRecordCount}`,
    "- Destructive mutation performed: no",
    "",
    "## SIMULATED Archive Marker/Write",
    "",
    `- Archive ID: \`${report.archive.archiveId}\``,
    `- Archived synthetic records: ${report.archive.archivedRecordCount}`,
    `- Archive manifest hash: \`${report.archive.archiveManifestHash}\``,
    "- Physical archive written: no",
    "",
    "## SIMULATED Restore Verification",
    "",
    `- Restore verification ID: \`${report.restoreVerification.restoreVerificationId}\``,
    `- Verified synthetic records: ${report.restoreVerification.verifiedRecordCount}/${report.restoreVerification.expectedRecordCount}`,
    "- Machine physical restore proof still required: yes",
    "",
    "## SIMULATED Audit Evidence",
    "",
    ...report.auditEvidence.events.map((event) => `- ${event.eventId}: ${event.action} (${event.status}) marker=${event.marker}`),
    "",
    "## Apply Guard Verification",
    "",
    `- Marker: ${report.applyGuard.marker}`,
    `- Destructive path requires confirmation: ${report.applyGuard.destructivePathRequiresConfirmation ? "yes" : "no"}`,
    `- Preview default present: ${report.applyGuard.previewDefaultPresent ? "yes" : "no"}`,
    `- Confirm-delete guard present: ${report.applyGuard.confirmDeleteGuardPresent ? "yes" : "no"}`,
    "- Destructive production retention enabled by this task: no",
    "",
    "## Safety",
    "",
    "- Production data mutated: no",
    "- Production data purged: no",
    "- Retention windows changed: no",
    "- Existing preview/confirmation guards weakened: no",
    "- Live external providers connected: no",
    "- Real consumer PII, real credit reports, production database dumps, or credentials used: no",
    "- Parser, OCR, packet wording, violation logic, storage, packet PDF, response queue, DB pool, and deployment activation changed: no",
    "",
    "## Remaining Requirement",
    "",
    "Blocker 22 remains partial. SIMULATED retention archive/restore proof does not replace non-interactive machine-attested archive/restore lifecycle evidence. Disaster recovery restore proof remains a separate machine-attested requirement.",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeSimulatedRetentionArchiveRestoreEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_RETENTION_EVIDENCE_DIR,
} = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-retention-archive-restore-simulated.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-retention-archive-restore-simulated.json"));
  const markdown = renderSimulatedRetentionArchiveRestoreMarkdown(report);
  const textValidation = validateRetentionArchiveRestoreEvidenceText(`${markdown}\n${JSON.stringify(report)}`);
  if (!textValidation.ok) {
    throw new Error(`Retention archive/restore evidence text validation failed: ${textValidation.errors.join("; ")}`);
  }
  writeFileSync(repoPath(rootDir, markdownPath), markdown, "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    evidenceDir: DEFAULT_RETENTION_EVIDENCE_DIR,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run retention:archive-restore:simulated -- [options]",
        "",
        "Creates SIMULATED retention archive/restore evidence using synthetic local records only.",
        "No production data is purged, no physical archive is written, and no live provider is called.",
        "",
        "Options:",
        "  --json                    Also print JSON evidence to stdout.",
        "  --root <path>             Project root. Defaults to current working directory.",
        "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue());
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue());
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildSimulatedRetentionArchiveRestoreReport({ rootDir: options.rootDir });
  const outputs = writeSimulatedRetentionArchiveRestoreEvidence(report, {
    rootDir: options.rootDir,
    evidenceDir: options.evidenceDir,
  });
  console.log("SIMULATED retention archive/restore evidence generated.");
  console.log("SIMULATED evidence is not production proof and does not complete physical retention recoverability.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log("Non-interactive archive/restore machine proof remains required.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
