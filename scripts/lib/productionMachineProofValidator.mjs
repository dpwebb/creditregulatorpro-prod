import { validateMachineEvidence, validateMachineEvidenceFile } from "./validateMachineEvidence.mjs";

export function validateProductionMachineProof(evidence, options = {}) {
  return validateMachineEvidence(evidence, options);
}

export function validateProductionMachineProofFile(options = {}) {
  return validateMachineEvidenceFile(options);
}
