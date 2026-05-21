import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  REQUIRED_CERTIFICATION_GATES,
  buildProductionScaleCertificationReport,
  writeProductionScaleCertificationOutputs,
} from "../../scripts/production-scale-certification.mjs";

const HEAD = "a".repeat(40);
const RUN_STARTED_AT = "2026-05-21T12:00:00.000Z";
const RUN_COMPLETED_AT = "2026-05-21T12:00:05.000Z";

const tempRoots: string[] = [];

function tempRepoRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-production-scale-cert-"));
  tempRoots.push(root);
  return root;
}

function writeEvidence(root: string, relativePath: string, overrides = {}) {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        reportName: "mock-production-scale-evidence",
        generatedAt: "2026-05-21T12:00:02.000Z",
        currentHead: HEAD,
        status: "passed",
        ...overrides,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function gate(id: string, command = `mock:${id}`, evidencePath?: string) {
  return {
    id,
    label: id,
    command,
    evidencePath,
  };
}

function freshnessGate() {
  return {
    id: "evidenceFreshness",
    label: "Evidence freshness check",
    command: "internal evidence freshness check",
    internal: true,
  };
}

function runCommandWithFailures(failedGateIds: string[] = []) {
  return async (command: string, options: { gate: { id: string } }) => ({
    command,
    exitCode: failedGateIds.includes(options.gate.id) ? 1 : 0,
    startedAt: "2026-05-21T12:00:01.000Z",
    completedAt: "2026-05-21T12:00:02.000Z",
    durationMs: 1000,
    stdout: "",
    stderr: "",
  });
}

async function buildMockReport(options: {
  repoRoot: string;
  gates: ReturnType<typeof gate>[];
  requiredGateIds?: string[];
  failedGateIds?: string[];
}) {
  return buildProductionScaleCertificationReport({
    repoRoot: options.repoRoot,
    gates: [...options.gates, freshnessGate()],
    requiredGateIds: options.requiredGateIds ?? [...options.gates.map((entry) => entry.id), "evidenceFreshness"],
    runCommand: runCommandWithFailures(options.failedGateIds),
    currentHead: HEAD,
    currentBranch: "staging",
    targetSha: HEAD,
    runStartedAt: RUN_STARTED_AT,
    completedAt: RUN_COMPLETED_AT,
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("production-scale certification report", () => {
  it("includes authenticated upload-to-results as a required certification gate", () => {
    expect(REQUIRED_CERTIFICATION_GATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "authenticatedUploadResults",
          command: "pnpm run smoke:auth-workflow",
        }),
        expect.objectContaining({
          id: "authenticatedPacketPdf",
          command: "pnpm run smoke:auth-workflow:packet",
        }),
      ]),
    );
  });

  it("marks CERTIFYING:false when a required gate is missing", async () => {
    const root = tempRepoRoot();
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts")],
      requiredGateIds: ["contracts", "api", "evidenceFreshness"],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.skippedGates).toContain("api");
    expect(report.gateStatus.api).toBe("skipped");
  });

  it("marks CERTIFYING:false when a gate command fails", async () => {
    const root = tempRepoRoot();
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts"), gate("api")],
      failedGateIds: ["api"],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.failedGates).toContain("api");
    expect(report.gateStatus.api).toBe("failed");
  });

  it("marks CERTIFYING:false when evidence is stale", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/mock-stale-evidence.json";
    writeEvidence(root, evidencePath, {
      generatedAt: "2026-05-21T11:00:00.000Z",
      currentHead: HEAD,
    });

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("packetPdfCacheMiss", "mock:packet", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(false);
    expect(report.staleGates).toContain("packetPdfCacheMiss");
    expect(report.gateStatus.evidenceFreshness).toBe("failed");
  });

  it("marks CERTIFYING:true when every mocked gate and evidence check passes", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/mock-fresh-evidence.json";
    writeEvidence(root, evidencePath);

    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts"), gate("packetPdfCacheMiss", "mock:packet", evidencePath)],
    });

    expect(report.CERTIFYING).toBe(true);
    expect(report.failedGates).toEqual([]);
    expect(report.staleGates).toEqual([]);
    expect(report.skippedGates).toEqual([]);
  });

  it("writes parseable stable JSON evidence", async () => {
    const root = tempRepoRoot();
    const evidencePath = "docs/production-scale/evidence/mock-fresh-evidence.json";
    writeEvidence(root, evidencePath);
    const report = await buildMockReport({
      repoRoot: root,
      gates: [gate("contracts"), gate("packetPdfCacheMiss", "mock:packet", evidencePath)],
    });

    const outputs = await writeProductionScaleCertificationOutputs(report, root);
    const parsed = JSON.parse(readFileSync(outputs.jsonPath, "utf8"));

    expect(parsed.reportName).toBe("production-scale-certification");
    expect(parsed.currentHead).toBe(HEAD);
    expect(parsed.targetSha).toBe(HEAD);
    expect(parsed.commandList).toEqual(["mock:contracts", "mock:packet", "internal evidence freshness check"]);
    expect(parsed.gateStatus).toEqual({
      contracts: "passed",
      packetPdfCacheMiss: "passed",
      evidenceFreshness: "passed",
    });
    expect(parsed.CERTIFYING).toBe(true);
  });
});
