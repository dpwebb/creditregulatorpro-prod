import { existsSync, readFileSync } from "node:fs";

import {
  MACHINE_EVIDENCE_STATUSES,
  MACHINE_EVIDENCE_SCHEMA_VERSION,
  PRODUCTION_MUTATION_MODES,
  repoPath,
} from "./productionEvidenceSchema.mjs";
import { findSensitiveEvidenceValues } from "./sanitizeProductionEvidence.mjs";

const STRICT_SHA_RE = /^[a-f0-9]{40}$/i;

function isTrue(value) {
  return value === true;
}

export function validateMachineEvidence(evidence, {
  expectedEvidenceType = null,
  now = new Date().toISOString(),
  requireCertifying = true,
} = {}) {
  const errors = [];
  const sensitiveFindings = findSensitiveEvidenceValues(evidence);

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      ok: false,
      errors: ["Evidence must be an object."],
      sensitiveFindings,
      stale: false,
      certifying: false,
    };
  }

  if (evidence.schemaVersion !== MACHINE_EVIDENCE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${MACHINE_EVIDENCE_SCHEMA_VERSION}.`);
  }
  if (expectedEvidenceType && evidence.evidenceType !== expectedEvidenceType) {
    errors.push(`evidenceType must be ${expectedEvidenceType}.`);
  }
  for (const field of ["evidenceType", "environment", "generatedAt", "commitHash", "generatorScript", "command", "expiresAt"]) {
    if (typeof evidence[field] !== "string" || !evidence[field].trim()) {
      errors.push(`${field} is required.`);
    }
  }
  if (!STRICT_SHA_RE.test(String(evidence.commitHash ?? ""))) {
    errors.push("commitHash must be a strict 40-hex commit hash.");
  }
  if (!isTrue(evidence.nonInteractive)) errors.push("nonInteractive must be true.");
  if (!isTrue(evidence.machineAttested)) errors.push("machineAttested must be true.");
  if (evidence.generatedManually === true) errors.push("generated manually evidence is rejected.");
  if (evidence.simulatedOnly === true && evidence.environment === "production") {
    errors.push("simulated-only evidence cannot be production proof.");
  }
  if (!PRODUCTION_MUTATION_MODES.has(String(evidence.productionMutation ?? ""))) {
    errors.push("productionMutation has an invalid value.");
  }
  for (const flag of ["secretsPrinted", "piiPrinted", "rawReportBytesPrinted", "signedUrlsPrinted"]) {
    if (evidence[flag] !== false) errors.push(`${flag} must be false.`);
  }
  if (!MACHINE_EVIDENCE_STATUSES.has(String(evidence.status ?? ""))) {
    errors.push("status must be pass, limited, or fail.");
  } else if (evidence.status !== "pass") {
    errors.push("status must be pass for certifying machine evidence.");
  }
  if (requireCertifying && evidence.certifying !== true) errors.push("certifying must be true.");
  if (requireCertifying && evidence.CERTIFYING !== true) errors.push("CERTIFYING must be true.");
  if (!Number.isFinite(Number(evidence.freshnessWindowHours)) || Number(evidence.freshnessWindowHours) <= 0) {
    errors.push("freshnessWindowHours must be a positive number.");
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.length === 0) {
    errors.push("checks array is required.");
  } else {
    for (const [index, check] of evidence.checks.entries()) {
      if (!check?.name) errors.push(`checks[${index}].name is required.`);
      if (check?.status !== "pass") errors.push(`checks[${index}].status must be pass.`);
    }
  }
  if (!Array.isArray(evidence.failures)) errors.push("failures array is required.");
  if (requireCertifying && Array.isArray(evidence.failures) && evidence.failures.length > 0) {
    errors.push("failures must be empty for certifying evidence.");
  }
  if (!Array.isArray(evidence.sanitizedArtifacts)) errors.push("sanitizedArtifacts array is required.");
  if (sensitiveFindings.length > 0) errors.push("evidence contains sensitive-looking values.");

  const generatedMs = Date.parse(evidence.generatedAt);
  const expiresMs = Date.parse(evidence.expiresAt);
  const nowMs = Date.parse(now);
  const stale = Number.isFinite(expiresMs) && Number.isFinite(nowMs) ? expiresMs < nowMs : true;
  if (!Number.isFinite(generatedMs)) errors.push("generatedAt is invalid.");
  if (!Number.isFinite(expiresMs)) errors.push("expiresAt is invalid.");
  if (stale) errors.push("evidence is stale.");

  return {
    ok: errors.length === 0,
    errors,
    sensitiveFindings,
    stale,
    certifying: errors.length === 0 && evidence.certifying === true && evidence.CERTIFYING === true,
  };
}

export function readMachineEvidenceFile(rootDir, evidencePath) {
  const absolutePath = repoPath(rootDir, evidencePath);
  if (!existsSync(absolutePath)) return null;
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

export function validateMachineEvidenceFile({
  rootDir = process.cwd(),
  evidencePath,
  expectedEvidenceType = null,
  now = new Date().toISOString(),
  requireCertifying = true,
} = {}) {
  const evidence = readMachineEvidenceFile(rootDir, evidencePath);
  if (!evidence) {
    return {
      ok: false,
      errors: [`Machine evidence file is missing: ${evidencePath}`],
      sensitiveFindings: [],
      stale: false,
      certifying: false,
      evidence: null,
    };
  }
  const validation = validateMachineEvidence(evidence, { expectedEvidenceType, now, requireCertifying });
  return { ...validation, evidence };
}

