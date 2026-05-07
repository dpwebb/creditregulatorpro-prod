import {
  buildDeterministicCreditReportPipelinePackage,
  stableCanonicalJson,
  type BuildDeterministicPipelineInput,
  type DeterministicPipelinePackage,
} from "./deterministicCreditReportPipeline";
import { sha256Hex } from "./reportBinaryUtils";

export const DETERMINISTIC_REPLAY_VALIDATION_VERSION =
  "deterministic-replay-validation-v1";

export interface DeterministicReplayValidation {
  version: typeof DETERMINISTIC_REPLAY_VALIDATION_VERSION;
  ok: boolean;
  replayHash: string;
  replayedHash: string;
  canonicalResultSha256: string;
  replayedCanonicalResultSha256: string;
  candidatePoolsSha256: string;
  replayedCandidatePoolsSha256: string;
  checkedKeys: string[];
  differences: string[];
}

function hashCanonical(value: unknown): string {
  return sha256Hex(stableCanonicalJson(value));
}

export function validateDeterministicReplay(
  input: BuildDeterministicPipelineInput,
  expected: DeterministicPipelinePackage,
): DeterministicReplayValidation {
  const replayed = buildDeterministicCreditReportPipelinePackage(input);
  const candidatePoolsSha256 = hashCanonical(expected.candidatePools);
  const replayedCandidatePoolsSha256 = hashCanonical(replayed.candidatePools);
  const checkedKeys = [
    "replayHash",
    "canonicalResultSha256",
    "candidatePools",
    "finalOutput",
    "rawTextSha256",
    "documentBinarySha256",
  ];
  const differences: string[] = [];

  if (expected.replayHash !== replayed.replayHash) differences.push("replayHash");
  if (expected.canonicalResultSha256 !== replayed.canonicalResultSha256) {
    differences.push("canonicalResultSha256");
  }
  if (candidatePoolsSha256 !== replayedCandidatePoolsSha256) differences.push("candidatePools");
  if (hashCanonical(expected.finalOutput) !== hashCanonical(replayed.finalOutput)) {
    differences.push("finalOutput");
  }
  if (expected.rawTextSha256 !== replayed.rawTextSha256) differences.push("rawTextSha256");
  if (expected.documentBinarySha256 !== replayed.documentBinarySha256) {
    differences.push("documentBinarySha256");
  }

  return {
    version: DETERMINISTIC_REPLAY_VALIDATION_VERSION,
    ok: differences.length === 0,
    replayHash: expected.replayHash,
    replayedHash: replayed.replayHash,
    canonicalResultSha256: expected.canonicalResultSha256,
    replayedCanonicalResultSha256: replayed.canonicalResultSha256,
    candidatePoolsSha256,
    replayedCandidatePoolsSha256,
    checkedKeys,
    differences,
  };
}

export function assertDeterministicReplay(
  input: BuildDeterministicPipelineInput,
  expected: DeterministicPipelinePackage,
): DeterministicReplayValidation {
  const validation = validateDeterministicReplay(input, expected);
  if (!validation.ok) {
    throw new Error(
      `Deterministic replay validation failed for keys: ${validation.differences.join(", ")}`,
    );
  }
  return validation;
}
