import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildIngestReplayPayload,
  evaluateIngestStageCompletion,
  mergeIngestStagePersistence,
  replayPayloadMatchesCanonicalState,
} from "../../helpers/ingestCorePipeline";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const canonicalOutput = {
  version: "deterministic-credit-report-pipeline-v1",
  consumerInfo: { fullName: "Synthetic Consumer" },
  reportMetadata: { bureauName: "TransUnion Canada" },
  tradelines: [{ creditorName: "MAPLE FINANCIAL VISA", accountNumber: "...1234" }],
  evidence: { coverage: { requiredCoveragePercent: 100 } },
};

function withStoredStage(data: unknown, stage: Parameters<typeof mergeIngestStagePersistence>[1]) {
  return mergeIngestStagePersistence(data, stage, "stored", {
    updatedAt: "2026-05-21T12:00:00.000Z",
  });
}

function completeCriticalStageData(overrides: Record<string, unknown> = {}) {
  let data: Record<string, unknown> = {
    canonicalOutput,
    replayHash: "synthetic-replay-hash",
    replayPayload: {
      replayHash: "synthetic-replay-hash",
      canonicalOutput,
      replayValidation: { ok: true, replayHash: "synthetic-replay-hash" },
    },
    ...overrides,
  };
  for (const stage of [
    "artifact_stored",
    "extraction_snapshot_stored",
    "canonical_mapping_stored",
    "evidence_index_stored",
    "compliance_scan_stored",
    "replay_payload_stored",
  ] as const) {
    data = withStoredStage(data, stage);
  }
  return data;
}

describe("ingest stage persistence guard", () => {
  it("blocks final completion when a critical stage is missing after a simulated pre-promotion failure", () => {
    const data = completeCriticalStageData();
    const missingReplayStage = {
      ...data,
      ingestStagePersistence: {
        ...(data.ingestStagePersistence as Record<string, unknown>),
        stages: {
          ...((data.ingestStagePersistence as any).stages),
          replay_payload_stored: undefined,
        },
      },
    };

    const completion = evaluateIngestStageCompletion(missingReplayStage);

    expect(completion.ok).toBe(false);
    expect(completion.missingStages).toContain("replay_payload_stored");
  });

  it("treats evidence index persistence failure as failed stage instead of false success", () => {
    let data = completeCriticalStageData();
    data = mergeIngestStagePersistence(data, "evidence_index_stored", "failed", {
      error: new Error("SIMULATED_EVIDENCE_INDEX_DB_FAILURE"),
      updatedAt: "2026-05-21T12:01:00.000Z",
    });

    const completion = evaluateIngestStageCompletion(data);

    expect(completion.ok).toBe(false);
    expect(completion.failedStages).toEqual(["evidence_index_stored"]);
  });

  it("requires replay payload to match the persisted canonical output", () => {
    const matching = completeCriticalStageData();
    const drifted = {
      ...matching,
      replayPayload: {
        replayHash: "synthetic-replay-hash",
        canonicalOutput: {
          ...canonicalOutput,
          tradelines: [{ creditorName: "DRIFTED CREDITOR", accountNumber: "...9999" }],
        },
      },
    };

    expect(replayPayloadMatchesCanonicalState(matching)).toBe(true);
    expect(replayPayloadMatchesCanonicalState(drifted)).toBe(false);
  });

  it("builds replay payloads directly from deterministic pipeline output", () => {
    const replayPayload = buildIngestReplayPayload({
      finalOutput: canonicalOutput,
      replayHash: "synthetic-replay-hash",
    } as any, { ok: true, replayHash: "synthetic-replay-hash" } as any);

    expect(replayPayload).toMatchObject({
      replayHash: "synthetic-replay-hash",
      canonicalOutput,
      replayValidation: { ok: true, replayHash: "synthetic-replay-hash" },
    });
  });

  it("keeps retry stage recording idempotent instead of duplicating truth", () => {
    let data = completeCriticalStageData();
    data = mergeIngestStagePersistence(data, "canonical_mapping_stored", "stored", {
      details: { retry: true },
      updatedAt: "2026-05-21T12:02:00.000Z",
    });
    const stages = (data.ingestStagePersistence as any).stages;

    expect(Object.keys(stages).filter((stage) => stage === "canonical_mapping_stored")).toHaveLength(1);
    expect(stages.canonical_mapping_stored.details).toEqual({ retry: true });
    expect(evaluateIngestStageCompletion(data).ok).toBe(true);
  });

  it("upserts pass extraction rows so ingest retries do not fail on existing pass records", () => {
    const ingestCore = source("helpers/ingestCorePipeline.tsx");
    const upsertSource = ingestCore.slice(
      ingestCore.indexOf("async function upsertCompletedPassExtraction"),
      ingestCore.indexOf("async function updateIngestStage"),
    );

    expect(upsertSource).toContain('.insertInto("passExtraction")');
    expect(upsertSource).toContain('.columns(["reportArtifactId", "pass"]).doUpdateSet');
    expect(upsertSource).toContain('status: "completed"');
    expect(upsertSource).toContain('errorMessage: null');
    expect(upsertSource).toContain('errorDetails: null');
  });

  it("keeps final report promotion atomic with stage verification", () => {
    const ingestCore = source("helpers/ingestCorePipeline.tsx");
    const promotionSource = ingestCore.slice(
      ingestCore.indexOf("async function promoteReportArtifactComplete"),
      ingestCore.indexOf("function artifactTimestamp"),
    );

    expect(promotionSource).toContain("db.transaction().execute");
    expect(promotionSource).toContain(".forUpdate()");
    expect(promotionSource).toContain("evaluateIngestStageCompletion");
    expect(promotionSource).toContain('processingStatus: "completed"');
    expect(promotionSource).toContain('"report_promoted_complete"');
  });

  it("fails compliance persistence as a critical stage instead of swallowing scan write errors", () => {
    const ingestCore = source("helpers/ingestCorePipeline.tsx");

    expect(ingestCore).toContain("const complianceScanErrors: string[] = [];");
    expect(ingestCore).toContain("COMPLIANCE_SCAN_PERSISTENCE_FAILED");
    expect(ingestCore).toContain('failCriticalIngestStage(\n        artifactId,\n        "compliance_scan_stored"');
  });
});
