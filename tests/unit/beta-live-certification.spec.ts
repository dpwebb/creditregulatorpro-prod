import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  BETA_LIVE_CERTIFICATION_JSON_PATH,
  BETA_LIVE_CERTIFICATION_MD_PATH,
  BETA_LIVE_COMMANDS,
  betaLiveExitCode,
  buildBetaLiveCertificationReport,
  runBetaLiveCertification,
} from "../../scripts/beta-live-certification.mjs";

const tempRoots: string[] = [];

function tempRepoRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-beta-live-cert-"));
  tempRoots.push(root);
  return root;
}

function commandOutcomes(failedIds: string[] = []) {
  return BETA_LIVE_COMMANDS.map((command) => ({
    id: command.id,
    command: command.command,
    label: command.label,
    exitCode: failedIds.includes(command.id) ? 1 : 0,
    stdin: "ignore",
    stdoutCaptured: true,
    stderrCaptured: failedIds.includes(command.id),
  }));
}

function supporting(overrides: Record<string, unknown> = {}) {
  return {
    rawReportProof: { pass: true, artifact: "raw.json", supportingOnly: true },
    alertingProof: { pass: true, artifact: "alerting.json", supportingOnly: true },
    rollbackSimulation: { pass: true, artifact: "rollback.json", supportingOnly: true },
    certificationHarness: { pass: true, artifact: "certification.json", supportingOnly: true },
    legacyMachineProofs: { pass: true, artifact: "machine-summary.json", supportingOnly: true },
    legacyPromotionPack: { pass: true, artifact: "promotion-pack.json", supportingOnly: true },
    ...overrides,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("beta-live certification", () => {
  it("generates the authoritative report artifacts with a final decision", async () => {
    const root = tempRepoRoot();
    const { report, outputs } = await runBetaLiveCertification({
      rootDir: root,
      env: {},
      writeReports: true,
      runCommand: async (command) => ({
        id: command.id,
        command: command.command,
        label: command.label,
        exitCode: 0,
        stdin: "ignore",
        stdoutCaptured: false,
        stderrCaptured: false,
      }),
    });

    expect(outputs).toEqual({
      jsonPath: BETA_LIVE_CERTIFICATION_JSON_PATH,
      markdownPath: BETA_LIVE_CERTIFICATION_MD_PATH,
    });
    const json = JSON.parse(readFileSync(join(root, BETA_LIVE_CERTIFICATION_JSON_PATH), "utf8"));
    const markdown = readFileSync(join(root, BETA_LIVE_CERTIFICATION_MD_PATH), "utf8");

    expect(report.decision).toBe("SAFE_FOR_BETA_LIVE=true");
    expect(json).toMatchObject({
      reportName: "beta-live-certification",
      safeForBetaLive: true,
      decision: "SAFE_FOR_BETA_LIVE=true",
      humanInteractionRequired: false,
      productionMutationDuringCertification: false,
    });
    expect(markdown).toContain("SAFE_FOR_BETA_LIVE=true");
  });

  it("returns unsafe when a required core path command fails", () => {
    const report = buildBetaLiveCertificationReport({
      commandOutcomes: commandOutcomes(["goldenPath"]),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.safeForBetaLive).toBe(false);
    expect(report.decision).toBe("SAFE_FOR_BETA_LIVE=false");
    expect(report.coreUserPath.upload.pass).toBe(false);
    expect(report.blockers.map((blocker) => blocker.code)).toContain("coreUserPath.upload");
    expect(betaLiveExitCode(report)).toBe(1);
  });

  it("returns unsafe when a required safety gate fails", () => {
    const report = buildBetaLiveCertificationReport({
      commandOutcomes: commandOutcomes(["packetReadiness"]),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.safeForBetaLive).toBe(false);
    expect(report.safetyGates.parserCertainty.pass).toBe(false);
    expect(report.safetyGates.packetEligibility.pass).toBe(false);
    expect(report.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["safetyGates.parserCertainty", "safetyGates.packetEligibility"]),
    );
  });

  it("returns safe only when all core path and safety gates pass", () => {
    const report = buildBetaLiveCertificationReport({
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(Object.values(report.coreUserPath).every((check) => check.pass)).toBe(true);
    expect(Object.values(report.safetyGates).every((check) => check.pass)).toBe(true);
    expect(report.safeForBetaLive).toBe(true);
    expect(report.decision).toBe("SAFE_FOR_BETA_LIVE=true");
    expect(betaLiveExitCode(report)).toBe(0);
  });

  it("treats legacy proof artifacts as supporting evidence instead of competing decisions", () => {
    const report = buildBetaLiveCertificationReport({
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting({
        legacyPromotionPack: {
          pass: false,
          artifact: "docs/production-scale/evidence/latest-production-promotion-pack.json",
          status: "not-certifying",
          supportingOnly: true,
        },
      }),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.safeForBetaLive).toBe(true);
    expect(report.legacyProofsAreSupportingEvidenceOnly).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "supportingEvidence.legacyPromotionPack",
          severity: "supporting-only",
        }),
      ]),
    );
  });

  it("does not require human input and records no production mutation for safe certification", () => {
    const report = buildBetaLiveCertificationReport({
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.humanInteractionRequired).toBe(false);
    expect(report.productionMutationDuringCertification).toBe(false);
    expect(report.safetyGates.noProductionMutationInSimulation.pass).toBe(true);
    expect(report.commandOutcomes.every((outcome) => outcome.stdin === "ignore")).toBe(true);
  });

  it("fails closed and runs no commands in a production-like environment", async () => {
    const root = tempRepoRoot();
    const { report } = await runBetaLiveCertification({
      rootDir: root,
      env: { CRP_ENV: "production" },
      writeReports: false,
      runCommand: async () => {
        throw new Error("runCommand must not be called in a production-like environment");
      },
    });

    expect(report.safeForBetaLive).toBe(false);
    expect(report.commandOutcomes).toEqual([]);
    expect(report.safetyGates.noProductionMutationInSimulation.pass).toBe(false);
    expect(report.productionMutationDuringCertification).toBe(false);
    expect(betaLiveExitCode(report)).toBe(1);
  });
});
