import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMachineEvidence,
  normalizeRelativePath,
  repoPath,
  writeMachineEvidenceOutputs,
} from "./productionEvidenceSchema.mjs";
import { findSensitiveEvidenceValues } from "./sanitizeProductionEvidence.mjs";
import { validateMachineEvidence, validateMachineEvidenceFile } from "./validateMachineEvidence.mjs";

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

export function parseMachineProofArgs(args) {
  const options = {
    rootDir: process.cwd(),
    attestationPath: null,
    json: false,
    writeEvidence: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--attestation") {
      options.attestationPath = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write-evidence") {
      options.writeEvidence = false;
      continue;
    }
    if (arg === "--write-evidence") {
      options.writeEvidence = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readAttestation(rootDir, attestationPath) {
  if (!attestationPath) return { parsed: null, errors: ["machine attestation path was not provided."] };
  const absolutePath = repoPath(rootDir, attestationPath);
  if (!existsSync(absolutePath)) return { parsed: null, errors: [`machine attestation file is missing: ${attestationPath}`] };
  try {
    return { parsed: JSON.parse(readFileSync(absolutePath, "utf8")), errors: [] };
  } catch {
    return { parsed: null, errors: [`machine attestation file is not parseable JSON: ${attestationPath}`] };
  }
}

function attestationCheckStatus(attestation, name) {
  const checks = Array.isArray(attestation?.checks) ? attestation.checks : [];
  return checks.find((check) => check?.name === name || check?.id === name)?.status ?? "missing";
}

function configuredCheckSets(config) {
  if (Array.isArray(config.acceptedCheckSets) && config.acceptedCheckSets.length > 0) {
    return config.acceptedCheckSets.map((set, index) => ({
      name: set.name ?? `accepted-check-set-${index + 1}`,
      checks: Array.isArray(set.checks) ? set.checks : [],
    }));
  }

  return [{
    name: "default",
    checks: Array.isArray(config.requiredChecks) ? config.requiredChecks : [],
  }];
}

function selectAttestedCheckSet(config, attestation) {
  const checkSets = configuredCheckSets(config);
  if (!attestation) return checkSets[0];
  return checkSets.find((set) => set.checks.every((name) => attestationCheckStatus(attestation, name) === "pass")) ?? checkSets[0];
}

export function configuredMachineProofValidationErrors(config, evidence) {
  const checkSets = configuredCheckSets(config);
  const evidenceChecks = new Set(
    (Array.isArray(evidence?.checks) ? evidence.checks : [])
      .filter((check) => check?.status === "pass")
      .map((check) => check.name),
  );

  if (checkSets.some((set) => set.checks.every((name) => evidenceChecks.has(name)))) {
    return [];
  }

  const expected = checkSets
    .map((set) => `${set.name}: ${set.checks.join(", ")}`)
    .join(" | ");
  return [`machine proof is missing a complete accepted check set (${expected}).`];
}

export function validateMachineProofForConfig(config, evidence, options = {}) {
  const validation = validateMachineEvidence(evidence, {
    expectedEvidenceType: config.evidenceType,
    now: options.now,
    requireCertifying: options.requireCertifying ?? true,
  });
  const domainErrors = validation.ok || evidence
    ? configuredMachineProofValidationErrors(config, evidence)
    : [];
  const errors = [...validation.errors, ...domainErrors];
  return {
    ...validation,
    ok: errors.length === 0,
    errors,
    certifying: errors.length === 0 && evidence?.certifying === true && evidence?.CERTIFYING === true,
  };
}

export function buildAttestedMachineProofReport(config, {
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
  attestationPath = null,
} = {}) {
  const resolvedAttestationPath = attestationPath ?? env[config.attestationEnv] ?? null;
  const { parsed: attestation, errors: readErrors } = readAttestation(rootDir, resolvedAttestationPath);
  const failures = [];
  const missingRuntimeInputs = [];

  if (!resolvedAttestationPath) {
    missingRuntimeInputs.push(config.attestationEnv);
  }
  for (const error of readErrors) failures.push({ code: "attestation-unavailable", message: error });

  const sensitiveFindings = attestation ? findSensitiveEvidenceValues(attestation) : [];
  if (sensitiveFindings.length > 0) {
    failures.push({ code: "sensitive-attestation", message: "Machine attestation contains sensitive-looking values." });
  }

  if (attestation) {
    if (attestation.nonInteractive !== true) failures.push({ code: "non-interactive-missing", message: "Attestation nonInteractive must be true." });
    if (attestation.machineAttested !== true) failures.push({ code: "machine-attested-missing", message: "Attestation machineAttested must be true." });
    if (attestation.generatedManually === true) failures.push({ code: "manual-attestation", message: "Generated manually attestations are rejected." });
    if (attestation.simulatedOnly === true && (attestation.environment ?? "production") === "production") {
      failures.push({ code: "simulated-production-proof", message: "Simulated-only attestation cannot certify production proof." });
    }
    if (attestation.status !== "pass") failures.push({ code: "attestation-not-pass", message: "Attestation status must be pass." });
    if (attestation.certifying !== true && attestation.CERTIFYING !== true) {
      failures.push({ code: "attestation-not-certifying", message: "Attestation certifying flag must be true." });
    }
  }

  const selectedCheckSet = selectAttestedCheckSet(config, attestation);
  const checks = selectedCheckSet.checks.map((name) => {
    const status = attestation ? attestationCheckStatus(attestation, name) : "missing";
    const passed = status === "pass";
    if (attestation && !passed) {
      failures.push({ code: "required-check-not-pass", message: `${name} did not pass.` });
    }
    return {
      name,
      status: passed ? "pass" : "fail",
      summary: passed ? "Machine attestation check passed." : "Machine attestation check missing or failed.",
    };
  });

  const certifying = failures.length === 0 && missingRuntimeInputs.length === 0 && checks.every((check) => check.status === "pass");

  return buildMachineEvidence({
    rootDir,
    evidenceType: config.evidenceType,
    generatedAt,
    commitHash: env.CRP_MACHINE_EVIDENCE_COMMIT_HASH ?? null,
    generatorScript: config.generatorScript,
    command: config.command,
    productionMutation: config.productionMutation ?? "none",
    status: certifying ? "pass" : "fail",
    certifying,
    checks,
    failures,
    missingRuntimeInputs,
    sanitizedArtifacts: [
      ...(resolvedAttestationPath ? [{ path: resolvedAttestationPath, type: "machine-attestation-input" }] : []),
      ...(config.sanitizedArtifacts ?? []),
    ],
    metadata: {
      blockerIdsClosedWhenCertifying: config.blockerIdsClosedWhenCertifying ?? [],
      attestationPath: resolvedAttestationPath,
      acceptedCheckSet: selectedCheckSet.name,
      sensitiveFindingCount: sensitiveFindings.length,
      ...(attestation?.metadata && typeof attestation.metadata === "object" ? attestation.metadata : {}),
      ...(config.metadata ?? {}),
    },
  });
}

export async function runAttestedMachineProofCli(config, argv = process.argv.slice(2)) {
  const options = parseMachineProofArgs(argv);
  const report = buildAttestedMachineProofReport(config, {
    rootDir: options.rootDir,
    env: process.env,
    attestationPath: options.attestationPath,
  });
  let outputs = null;
  if (options.writeEvidence) {
    outputs = writeMachineEvidenceOutputs(report, {
      rootDir: options.rootDir,
      jsonPath: config.jsonPath,
      markdownPath: config.markdownPath,
      title: config.title,
    });
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${config.title} generated.`);
    if (outputs) {
      console.log(`Markdown: ${outputs.markdownPath}`);
      console.log(`JSON: ${outputs.jsonPath}`);
    }
    console.log(`CERTIFYING:${report.certifying ? "true" : "false"}`);
    if (report.missingRuntimeInputs.length) {
      console.log(`Missing machine input: ${report.missingRuntimeInputs.join(", ")}`);
    }
  }
  if (!report.certifying) process.exitCode = 1;
}

export async function runMachineProofValidationCli(config, argv = process.argv.slice(2)) {
  const options = parseMachineProofArgs(argv.filter((arg) => arg !== "--no-write-evidence" && arg !== "--write-evidence"));
  const result = validateMachineEvidenceFile({
    rootDir: options.rootDir,
    evidencePath: config.jsonPath,
    expectedEvidenceType: config.evidenceType,
  });
  const domainErrors = result.evidence ? configuredMachineProofValidationErrors(config, result.evidence) : [];
  const validatedResult = {
    ...result,
    ok: result.ok && domainErrors.length === 0,
    errors: [...result.errors, ...domainErrors],
  };
  if (options.json) console.log(JSON.stringify(validatedResult, null, 2));
  else if (validatedResult.ok) console.log(`${config.title} validation passed.`);
  else {
    console.error(`${config.title} validation failed.`);
    for (const error of validatedResult.errors) console.error(`- ${error}`);
  }
  if (!validatedResult.ok) process.exitCode = 1;
}

export function isMain(importMetaUrl) {
  return process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}
