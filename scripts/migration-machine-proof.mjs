import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMachineEvidence,
  writeMachineEvidenceOutputs,
} from "./lib/productionEvidenceSchema.mjs";
import {
  parseMachineProofArgs,
} from "./lib/machineProofScript.mjs";
import {
  buildMigrationGateReport,
  MIGRATION_GATE_JSON_PATH,
} from "./migration-gate.mjs";

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
      expiredAllowlistCount === 0,
      "No expired temporary allowlist residuals are present.",
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
      releaseBlockingFindingCount: releaseBlockingCount,
      expiredAllowlistFindingCount: expiredAllowlistCount,
    },
  });
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
