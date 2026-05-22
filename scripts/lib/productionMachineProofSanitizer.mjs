import { findSensitiveEvidenceValues as findSensitiveMachineProofValues } from "./sanitizeProductionEvidence.mjs";

export {
  SENSITIVE_VALUE_PATTERNS,
  findSensitiveEvidenceValues,
  sanitizeProductionEvidenceValue,
} from "./sanitizeProductionEvidence.mjs";

export function hasForbiddenMachineProofContent(value) {
  return findSensitiveMachineProofValues(value).length > 0;
}
