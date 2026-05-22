import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMachineEvidence } from "../../scripts/lib/productionEvidenceSchema.mjs";
import {
  buildProductionMachineProofSummary,
  defaultMachineProofAreas,
} from "../../scripts/production-machine-proof-orchestrator.mjs";

const HEAD = "1234567890abcdef1234567890abcdef12345678";
const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const NOW = "2026-05-22T13:00:00.000Z";
const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-machine-proof-orchestrator-"));
  tempRoots.push(root);
  return root;
}

function writeJson(root: string, relativePath: string, value: unknown) {
  const fullPath = join(root, ...relativePath.split("/"));
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function commandResult(command: string, overrides: Record<string, unknown> = {}) {
  return {
    command,
    exitCode: 0,
    startedAt: GENERATED_AT,
    completedAt: GENERATED_AT,
    durationMs: 0,
    stdin: "ignore",
    stdoutCaptured: false,
    stderrCaptured: false,
    sensitiveOutputFindingCount: 0,
    sensitiveOutputFindingCodes: [],
    ...overrides,
  };
}

function validMachineProof(area: ReturnType<typeof defaultMachineProofAreas>[number], overrides = {}) {
  if (area.kind !== "machine-proof") throw new Error("validMachineProof requires a machine proof area.");
  const checks = area.config.requiredChecks ?? area.config.acceptedCheckSets?.[0]?.checks ?? [];
  return buildMachineEvidence({
    evidenceType: area.config.evidenceType,
    blockerId: area.blockerId,
    generatedAt: GENERATED_AT,
    commitHash: HEAD,
    branch: "staging",
    generatorScript: area.config.generatorScript,
    command: area.config.command,
    productionMutation: area.config.productionMutation ?? "none",
    status: "pass",
    certifying: true,
    checks: checks.map((name: string) => ({ name, status: "pass", summary: "Fixture check passed." })),
    sanitizedArtifacts: [{ path: area.config.jsonPath }],
    ...overrides,
  });
}

function certifyingPromotionPack(overrides: Record<string, unknown> = {}) {
  return {
    reportName: "production-promotion-evidence-pack",
    generatedAt: GENERATED_AT,
    currentCommitHash: HEAD,
    currentHead: HEAD,
    targetSha: HEAD,
    certifying: true,
    CERTIFYING: true,
    canPromoteProductionAtScale: true,
    readinessClassification: {
      value: "production-at-scale",
      canPromoteProductionAtScale: true,
      reason: "Every blocker is fixed with accepted automated machine evidence.",
    },
    promotionCertification: {
      CERTIFYING: true,
      missingRequiredChecks: [],
      staleChecks: [],
      nonAutomatedChecks: [],
      skippedChecks: [],
      failedChecks: [],
    },
    blockerClassifications: [
      {
        number: 1,
        title: "Disaster recovery proof",
        severity: "P1",
        classification: "fixed with automated evidence",
      },
    ],
    unresolvedProductionBlockers: [],
    unresolvedScaleBlockers: [],
    staleReferences: {
      auditCommitReferenceStale: false,
    },
    missingMachineRuntimeInputs: [],
    humanInteractionRequired: false,
    humanRequiredProof: [],
    ...overrides,
  };
}

function writeAllValidEvidence(root: string) {
  for (const area of defaultMachineProofAreas()) {
    if (area.kind === "machine-proof") {
      writeJson(root, area.config.jsonPath, validMachineProof(area));
    } else {
      writeJson(root, area.evidencePath, certifyingPromotionPack());
    }
  }
}

async function buildSummary(root: string, overrides: Record<string, unknown> = {}) {
  const calls: Array<{ command: string; options: Record<string, unknown> }> = [];
  const runCommand = async (command: string, options: Record<string, unknown>) => {
    calls.push({ command, options });
    return commandResult(command);
  };
  const summary = await buildProductionMachineProofSummary({
    rootDir: root,
    generatedAt: GENERATED_AT,
    now: NOW,
    commitHash: HEAD,
    currentHead: HEAD,
    branch: "staging",
    runCommand,
    ...overrides,
  });
  return { summary, calls };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("production machine proof orchestrator", () => {
  it("sets allMachineProofsCertifying:true only when every proof validates", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);

    const { summary } = await buildSummary(root);

    expect(summary.allMachineProofsCertifying).toBe(true);
    expect(summary.proofResults.every((result: { certifying: boolean }) => result.certifying)).toBe(true);
    expect(summary.openBlockers).toEqual([]);
    expect(summary.missingRuntimeInputs).toEqual([]);
  });

  it("sets allMachineProofsCertifying:false when any proof is missing", async () => {
    const root = tempRoot();
    const areas = defaultMachineProofAreas();
    for (const area of areas) {
      if (area.kind === "machine-proof" && area.key !== "restore") {
        writeJson(root, area.config.jsonPath, validMachineProof(area));
      } else if (area.kind === "promotion-guard") {
        writeJson(root, area.evidencePath, certifyingPromotionPack());
      }
    }

    const { summary } = await buildSummary(root);

    expect(summary.allMachineProofsCertifying).toBe(false);
    expect(summary.openBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blockerId: "L10-P1-002",
        missingRuntimeInputs: ["CRP_RESTORE_MACHINE_ATTESTATION_JSON"],
      }),
    ]));
  });

  it("sets allMachineProofsCertifying:false when any proof is stale", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);
    const restore = defaultMachineProofAreas().find((area) => area.key === "restore");
    writeJson(root, restore?.config.jsonPath ?? "", validMachineProof(restore as never, {
      generatedAt: "2026-05-20T12:00:00.000Z",
      freshnessWindowHours: 1,
    }));

    const { summary } = await buildSummary(root);
    const restoreResult = summary.proofResults.find((result: { key: string }) => result.key === "restore");

    expect(summary.allMachineProofsCertifying).toBe(false);
    expect(restoreResult.validation.stale).toBe(true);
  });

  it("sets allMachineProofsCertifying:false when any proof is human-dependent", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);
    const restore = defaultMachineProofAreas().find((area) => area.key === "restore");
    writeJson(root, restore?.config.jsonPath ?? "", validMachineProof(restore as never, {
      humanObserved: true,
      manualApprovalRequired: true,
    }));

    const { summary } = await buildSummary(root);
    const restoreResult = summary.proofResults.find((result: { key: string }) => result.key === "restore");

    expect(summary.allMachineProofsCertifying).toBe(false);
    expect(restoreResult.humanDependent).toBe(true);
    expect(summary.safetySummary.humanObserved).toBe(true);
    expect(summary.safetySummary.manualApprovalRequired).toBe(true);
  });

  it("sets allMachineProofsCertifying:false when any proof is simulated-only", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);
    const restore = defaultMachineProofAreas().find((area) => area.key === "restore");
    writeJson(root, restore?.config.jsonPath ?? "", validMachineProof(restore as never, {
      simulatedOnly: true,
    }));

    const { summary } = await buildSummary(root);
    const restoreResult = summary.proofResults.find((result: { key: string }) => result.key === "restore");

    expect(summary.allMachineProofsCertifying).toBe(false);
    expect(restoreResult.simulatedOnly).toBe(true);
  });

  it("sets allMachineProofsCertifying:false when proof evidence contains sensitive values", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);
    const restore = defaultMachineProofAreas().find((area) => area.key === "restore");
    const proof = {
      ...validMachineProof(restore as never),
      metadata: {
        leaked: "postgres://user:secret@example.test:5432/prod",
      },
    };
    writeJson(root, restore?.config.jsonPath ?? "", proof);

    const { summary } = await buildSummary(root);
    const restoreResult = summary.proofResults.find((result: { key: string }) => result.key === "restore");

    expect(summary.allMachineProofsCertifying).toBe(false);
    expect(restoreResult.validation.sensitiveFindingCount).toBeGreaterThan(0);
    expect(summary.safetySummary.noSecretsPiiRawBytesOrSignedUrlsPrinted).toBe(false);
    expect(JSON.stringify(summary)).not.toContain("postgres://user:secret@example.test:5432/prod");
  });

  it("preserves missingRuntimeInputs from failed proof evidence", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);
    const worker = defaultMachineProofAreas().find((area) => area.key === "productionWorker");
    writeJson(root, worker?.config.jsonPath ?? "", validMachineProof(worker as never, {
      status: "fail",
      certifying: false,
      missingRuntimeInputs: ["CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON"],
      failures: [{ code: "missing-input", message: "Worker attestation missing." }],
    }));

    const { summary } = await buildSummary(root);

    expect(summary.allMachineProofsCertifying).toBe(false);
    expect(summary.missingRuntimeInputs).toEqual(
      expect.arrayContaining(["CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON"]),
    );
    expect(summary.openBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blockerId: "L10-P1-003",
        missingRuntimeInputs: ["CRP_PRODUCTION_WORKER_MACHINE_ATTESTATION_JSON"],
      }),
    ]));
  });

  it("does not prompt or read stdin while running proof commands", async () => {
    const root = tempRoot();
    writeAllValidEvidence(root);

    const { summary, calls } = await buildSummary(root);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.options.stdin === "ignore")).toBe(true);
    expect(summary.safetySummary.prompted).toBe(false);
    expect(summary.safetySummary.stdinRead).toBe(false);
  });
});
