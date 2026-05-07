import { describe, expect, it } from "vitest";

import { buildIngestResponse } from "../../helpers/ingestResponseBuilder";

const canonicalOutput = {
  version: "deterministic-credit-report-pipeline-v1",
  fields: {},
  evidence: {
    fieldIndex: {},
    coverage: {
      totalCanonicalFields: 0,
      fieldsWithEvidence: 0,
      fieldsMissingEvidence: [],
      requiredFieldKeys: [],
      requiredFieldsWithEvidence: 0,
      requiredFieldsMissingEvidence: [],
      coveragePercent: 100,
      requiredCoveragePercent: 100,
    },
  },
  reportMetadata: {},
  consumerInfo: null,
  tradelines: [],
};

describe("ingest response canonical consistency", () => {
  it("returns the same canonical output, replay hash, and validation produced by the deterministic pipeline", () => {
    const replayValidation = {
      version: "deterministic-replay-validation-v1",
      ok: true,
      replayHash: "replay-hash",
      replayedHash: "replay-hash",
      canonicalResultSha256: "canonical-sha",
      replayedCanonicalResultSha256: "canonical-sha",
      candidatePoolsSha256: "pool-sha",
      replayedCandidatePoolsSha256: "pool-sha",
      checkedKeys: ["replayHash"],
      differences: [],
    } as const;

    const response = buildIngestResponse({
      artifactId: 7,
      parsedTradelines: [],
      tradelineIds: [],
      profileFieldsPopulated: [],
      passAExtraction: null,
      fullExtractionResult: { success: false, error: { message: "not run" } },
      parseResult: null,
      consumerInfoComparison: null,
      deterministicPipeline: {
        finalOutput: canonicalOutput,
        replayHash: "replay-hash",
      } as any,
      replayValidation,
    });

    expect(response.canonicalOutput).toBe(canonicalOutput);
    expect(response.replayHash).toBe("replay-hash");
    expect(response.replayValidation).toEqual(replayValidation);
  });
});
