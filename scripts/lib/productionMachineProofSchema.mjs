import {
  MACHINE_EVIDENCE_SCHEMA_VERSION,
  MACHINE_EVIDENCE_STATUSES,
  PRODUCTION_MUTATION_MODES,
  buildMachineEvidence,
  normalizeRelativePath,
  repoPath,
  safeGit,
  writeMachineEvidenceOutputs,
} from "./productionEvidenceSchema.mjs";
import {
  PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
  PRODUCTION_MACHINE_PROOF_REQUIRED_FIELDS,
  machineProofBlockerIdForConfig,
} from "./productionMachineProofPolicy.mjs";

export {
  MACHINE_EVIDENCE_SCHEMA_VERSION,
  MACHINE_EVIDENCE_STATUSES,
  PRODUCTION_MUTATION_MODES,
  PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
  PRODUCTION_MACHINE_PROOF_REQUIRED_FIELDS,
  normalizeRelativePath,
  repoPath,
  safeGit,
  writeMachineEvidenceOutputs,
};

export function buildProductionMachineProofEvidence(options = {}) {
  return buildMachineEvidence({
    policyVersion: PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
    humanObserved: false,
    manualApprovalRequired: false,
    dryRunOnly: false,
    ...options,
  });
}

export function machineProofSchemaDefaultsForConfig(config = {}) {
  return {
    blockerId: machineProofBlockerIdForConfig(config),
    policyVersion: PRODUCTION_MACHINE_PROOF_POLICY_VERSION,
    nonInteractive: true,
    machineAttested: true,
    humanObserved: false,
    manualApprovalRequired: false,
    simulatedOnly: false,
    dryRunOnly: false,
  };
}
