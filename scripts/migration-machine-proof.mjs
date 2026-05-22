import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMachineEvidence,
  writeMachineEvidenceOutputs,
} from "./lib/productionEvidenceSchema.mjs";
import {
  parseMachineProofArgs,
  validateMachineProofForConfig,
} from "./lib/machineProofScript.mjs";
import {
  buildMigrationGateReport,
  MIGRATION_GATE_JSON_PATH,
} from "./migration-gate.mjs";
import { readMachineEvidenceFile } from "./lib/validateMachineEvidence.mjs";

export const MIGRATION_MACHINE_PROOF_JSON_PATH = "docs/production-scale/evidence/latest-migration-machine-proof.json";
export const MIGRATION_MACHINE_PROOF_MD_PATH = "docs/production-scale/evidence/latest-migration-machine-proof.md";
export const MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE = "MIGRATION_GOVERNANCE_MACHINE_PROOF";

export const MIGRATION_MACHINE_PROOF_CONFIG = {
  title: "Migration Governance Machine Proof",
  evidenceType: MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE,
  jsonPath: MIGRATION_MACHINE_PROOF_JSON_PATH,
  markdownPath: MIGRATION_MACHINE_PROOF_MD_PATH,
  generatorScript: "scripts/migration-machine-proof.mjs",
  command: "pnpm run migrations:machine-proof",
  productionMutation: "none",
  blockerIdsClosedWhenCertifying: ["L10-P1-006"],
  requiredChecks: [
    "migration-gate-certifying",
    "no-temporary-unresolved-allowlist",
    "no-expired-allowlist",
    "no-temporary-allowlist-certification-basis",
    "residual-statuses-classified",
    "migration-ledger-status-present",
    "no-release-blocking-findings",
    "non-mutating-gate",
  ],
};

function passCheck(name, passed, summary) {
  return {
    name,
    status: passed ? "pass" : "fail",
    summary,
  };
}

function residualStatusesFromGate(migrationGate) {
  if (Array.isArray(migrationGate?.residualMachineStatuses)) return migrationGate.residualMachineStatuses;
  const converted = Array.isArray(migrationGate?.convertedRuntimeResiduals) ? migrationGate.convertedRuntimeResiduals : [];
  const governed = Array.isArray(migrationGate?.governedRuntimeResiduals) ? migrationGate.governedRuntimeResiduals : [];
  const temporary = Array.isArray(migrationGate?.temporaryAllowlistResiduals) ? migrationGate.temporaryAllowlistResiduals : [];

  return [
    ...converted.map((source) => ({
      path: source.path,
      status: "certifying",
      classification: "ledgered additive migration",
      ledgerEntry: source.ledgerEntry ?? source.reviewedMigration ?? null,
      ledgerStatus: source.ledgerStatus ?? "ledgered additive migration",
      certifying: true,
    })),
    ...governed.map((source) => ({
      path: source.path,
      status: "certifying",
      classification: "reviewed and governed",
      ledgerEntry: source.ledgerEntry ?? null,
      ledgerStatus: source.ledgerStatus ?? null,
      certifying: true,
    })),
    ...temporary.map((source) => ({
      path: source.path,
      status: "unresolved",
      classification: "unresolved",
      ledgerEntry: source.ledgerEntry ?? null,
      ledgerStatus: source.ledgerStatus ?? null,
      certifying: false,
    })),
  ];
}

function migrationGateHasAcceptedTemporaryAllowlistBasis(migrationGate) {
  return migrationGate?.status === "accepted-temporary-allowlist" ||
    migrationGate?.releaseBasis === "accepted-temporary-allowlist" ||
    migrationGate?.certificationBasis === "accepted-temporary-allowlist" ||
    migrationGate?.metadata?.certificationBasis === "accepted-temporary-allowlist";
}

export function migrationMachineProofExtraValidation(evidence) {
  const errors = [];
  const metadata = evidence?.metadata ?? {};
  const residualStatusesProvided = Array.isArray(metadata.residualStatuses);
  const residualStatuses = residualStatusesProvided ? metadata.residualStatuses : [];

  if (metadata.migrationGateStatus === "accepted-temporary-allowlist" || metadata.acceptedTemporaryAllowlistBasis === true) {
    errors.push("migration machine proof cannot certify accepted-temporary-allowlist basis.");
  }
  if (metadata.temporaryAllowlistActive === true || Number(metadata.temporaryAllowlistResidualCount ?? 0) > 0) {
    errors.push("migration machine proof cannot certify with temporary allowlist residuals.");
  }
  if (Number(metadata.unresolvedResidualCount ?? 0) > 0) {
    errors.push("migration machine proof cannot certify unresolved residuals.");
  }
  if (Number(metadata.expiredAllowlistFindingCount ?? metadata.expiredResidualCount ?? 0) > 0) {
    errors.push("migration machine proof cannot certify expired allowlist residuals.");
  }
  if (Number(metadata.missingMigrationLedgerStatusCount ?? 0) > 0) {
    errors.push("migration machine proof requires ledgerStatus and ledgerEntry for every certifying residual.");
  }
  if (!residualStatusesProvided) {
    errors.push("migration machine proof metadata.residualStatuses must be an array.");
  } else {
    for (const residual of residualStatuses) {
      if (["unresolved", "expired"].includes(residual?.status) || ["unresolved", "expired"].includes(residual?.classification)) {
        errors.push(`migration residual ${residual?.path ?? "unknown"} is ${residual?.classification ?? residual?.status}.`);
      }
      if (residual?.certifying === true && (!residual.ledgerStatus || !residual.ledgerEntry)) {
        errors.push(`migration residual ${residual?.path ?? "unknown"} is missing migration ledger status.`);
      }
    }
  }

  return errors;
}

export function validateMigrationMachineProofEvidence(evidence, options = {}) {
  const validation = validateMachineProofForConfig(MIGRATION_MACHINE_PROOF_CONFIG, evidence, options);
  const extraErrors = migrationMachineProofExtraValidation(evidence);
  const errors = [...validation.errors, ...extraErrors];
  return {
    ...validation,
    ok: errors.length === 0,
    errors,
    certifying: errors.length === 0 && evidence?.certifying === true && evidence?.CERTIFYING === true,
  };
}

export function buildMigrationMachineProofReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  migrationGateEvidence = null,
} = {}) {
  const migrationGate = migrationGateEvidence ?? buildMigrationGateReport({ rootDir, generatedAt });
  const releaseBlockingCount = Array.isArray(migrationGate.releaseBlockingFindings)
    ? migrationGate.releaseBlockingFindings.length
    : Number(migrationGate.releaseBlockingFindings ?? 0);
  const temporaryAllowlistCount = Array.isArray(migrationGate.temporaryAllowlistResiduals)
    ? migrationGate.temporaryAllowlistResiduals.length
    : Number(migrationGate.migrationStateSummary?.temporaryAllowlistRuntimeEnsureResidualCount ?? 0);
  const expiredAllowlistCount = Array.isArray(migrationGate.releaseBlockingFindings)
    ? migrationGate.releaseBlockingFindings.filter((item) => /expired.*temporary.*allowlist/i.test(`${item.category} ${item.title}`)).length
    : 0;
  const residualStatuses = residualStatusesFromGate(migrationGate);
  const unresolvedResidualCount = residualStatuses.filter((item) =>
    item.status === "unresolved" || item.classification === "unresolved").length;
  const expiredResidualCount = residualStatuses.filter((item) =>
    item.status === "expired" || item.classification === "expired").length;
  const missingMigrationLedgerStatusCount = residualStatuses.filter((item) =>
    item.certifying === true && (!item.ledgerStatus || !item.ledgerEntry)).length;
  const acceptedTemporaryAllowlistBasis = migrationGateHasAcceptedTemporaryAllowlistBasis(migrationGate);

  const checks = [
    passCheck(
      "migration-gate-certifying",
      migrationGate.CERTIFYING === true &&
        migrationGate.releaseGateAccepted === true &&
        migrationGate.blockerCoverage?.migrationGovernance === true,
      "Migration release gate is CERTIFYING:true and accepted.",
    ),
    passCheck(
      "no-temporary-unresolved-allowlist",
      migrationGate.temporaryAllowlistActive !== true && temporaryAllowlistCount === 0,
      "No active temporary runtime ensure allowlist residuals remain.",
    ),
    passCheck(
      "no-expired-allowlist",
      expiredAllowlistCount === 0 && expiredResidualCount === 0,
      "No expired temporary allowlist residuals are present.",
    ),
    passCheck(
      "no-temporary-allowlist-certification-basis",
      acceptedTemporaryAllowlistBasis === false,
      "Migration gate does not use accepted-temporary-allowlist as a certification basis.",
    ),
    passCheck(
      "residual-statuses-classified",
      residualStatuses.every((item) =>
        ["ledgered additive migration", "reviewed and governed", "obsolete and removed"].includes(item.classification)) &&
        unresolvedResidualCount === 0 &&
        expiredResidualCount === 0,
      "Every migration residual has an exact machine-governed classification.",
    ),
    passCheck(
      "migration-ledger-status-present",
      missingMigrationLedgerStatusCount === 0,
      "Every certifying migration residual has ledger status and ledger entry evidence.",
    ),
    passCheck(
      "no-release-blocking-findings",
      releaseBlockingCount === 0,
      "No release-blocking migration governance findings remain.",
    ),
    passCheck(
      "non-mutating-gate",
      migrationGate.safety?.nonMutating === true &&
        migrationGate.safety?.requiresDatabase !== true &&
        migrationGate.safety?.mutatesDatabase !== true &&
        migrationGate.safety?.executesDdl !== true &&
        migrationGate.safety?.productionMutationAttempted !== true,
      "Migration proof is static, non-mutating, and does not require database access.",
    ),
  ];
  const failures = checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({ code: check.name, message: check.summary }));
  const certifying = failures.length === 0;

  return buildMachineEvidence({
    rootDir,
    evidenceType: MIGRATION_MACHINE_PROOF_EVIDENCE_TYPE,
    blockerId: MIGRATION_MACHINE_PROOF_CONFIG.blockerIdsClosedWhenCertifying[0],
    generatedAt,
    generatorScript: MIGRATION_MACHINE_PROOF_CONFIG.generatorScript,
    command: MIGRATION_MACHINE_PROOF_CONFIG.command,
    productionMutation: "none",
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    sanitizedArtifacts: [{ path: MIGRATION_GATE_JSON_PATH, type: "migration-gate-input" }],
    metadata: {
      blockerIdsClosedWhenCertifying: MIGRATION_MACHINE_PROOF_CONFIG.blockerIdsClosedWhenCertifying,
      migrationGateStatus: migrationGate.status,
      migrationGateCertifying: migrationGate.CERTIFYING === true,
      releaseGateAccepted: migrationGate.releaseGateAccepted === true,
      temporaryAllowlistActive: migrationGate.temporaryAllowlistActive === true,
      temporaryAllowlistResidualCount: temporaryAllowlistCount,
      acceptedTemporaryAllowlistBasis,
      releaseBlockingFindingCount: releaseBlockingCount,
      expiredAllowlistFindingCount: expiredAllowlistCount,
      expiredResidualCount,
      unresolvedResidualCount,
      missingMigrationLedgerStatusCount,
      residualStatuses,
      governedRuntimeResidualCount: migrationGate.governedRuntimeResiduals?.length ?? 0,
      convertedRuntimeResidualCount: migrationGate.convertedRuntimeResiduals?.length ?? 0,
      },
  });
}

export async function runMigrationMachineProofValidationCli(argv = process.argv.slice(2)) {
  const options = parseMachineProofArgs(argv.filter((arg) => arg !== "--no-write-evidence" && arg !== "--write-evidence"));
  const evidence = readMachineEvidenceFile(options.rootDir, MIGRATION_MACHINE_PROOF_JSON_PATH);
  const result = evidence
    ? validateMigrationMachineProofEvidence(evidence)
    : {
        ok: false,
        errors: [`Machine evidence file is missing: ${MIGRATION_MACHINE_PROOF_JSON_PATH}`],
        evidence: null,
      };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`${MIGRATION_MACHINE_PROOF_CONFIG.title} validation passed.`);
  else {
    console.error(`${MIGRATION_MACHINE_PROOF_CONFIG.title} validation failed.`);
    for (const error of result.errors) console.error(`- ${error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

export async function runMigrationMachineProofCli(argv = process.argv.slice(2)) {
  const options = parseMachineProofArgs(argv);
  const report = buildMigrationMachineProofReport({ rootDir: options.rootDir });
  let outputs = null;
  if (options.writeEvidence) {
    outputs = writeMachineEvidenceOutputs(report, {
      rootDir: options.rootDir,
      jsonPath: MIGRATION_MACHINE_PROOF_JSON_PATH,
      markdownPath: MIGRATION_MACHINE_PROOF_MD_PATH,
      title: MIGRATION_MACHINE_PROOF_CONFIG.title,
    });
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${MIGRATION_MACHINE_PROOF_CONFIG.title} generated.`);
    if (outputs) {
      console.log(`Markdown: ${outputs.markdownPath}`);
      console.log(`JSON: ${outputs.jsonPath}`);
    }
    console.log(`CERTIFYING:${report.certifying ? "true" : "false"}`);
  }
  if (!report.certifying) process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrationMachineProofCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
