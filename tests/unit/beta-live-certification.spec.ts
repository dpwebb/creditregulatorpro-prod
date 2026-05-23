import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  validateBetaLiveCertificationReportSchema,
} from "../../scripts/beta-live-certification.mjs";

const HEAD = "1234567890abcdef1234567890abcdef12345678";
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
  it("is exposed as the single beta-live certification package command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["beta-live:certify"]).toBe("node scripts/beta-live-certification.mjs");
  });

  it("generates the authoritative report artifacts with a final decision", async () => {
    const root = tempRepoRoot();
    const { report, outputs } = await runBetaLiveCertification({
      rootDir: root,
      env: {},
      generatedAt: "2026-05-23T12:00:00.000Z",
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
      commandPlan: BETA_LIVE_COMMANDS,
    });

    expect(outputs).toEqual({
      jsonPath: BETA_LIVE_CERTIFICATION_JSON_PATH,
      markdownPath: BETA_LIVE_CERTIFICATION_MD_PATH,
    });
    const json = JSON.parse(readFileSync(join(root, BETA_LIVE_CERTIFICATION_JSON_PATH), "utf8"));
    const markdown = readFileSync(join(root, BETA_LIVE_CERTIFICATION_MD_PATH), "utf8");

    expect(existsSync(join(root, BETA_LIVE_CERTIFICATION_JSON_PATH))).toBe(true);
    expect(existsSync(join(root, BETA_LIVE_CERTIFICATION_MD_PATH))).toBe(true);
    expect(report.decision).toBe("SAFE_FOR_BETA_LIVE=false");
    expect(json).toMatchObject({
      reportName: "beta-live-certification",
      safeForBetaLive: false,
      decision: "SAFE_FOR_BETA_LIVE=false",
      humanInteractionRequired: false,
      productionMutationDuringCertification: false,
    });
    expect(json.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "schema.commit",
        }),
      ]),
    );
    expect(markdown).toContain("SAFE_FOR_BETA_LIVE=false");
    expect(markdown.trim().endsWith("SAFE_FOR_BETA_LIVE=false")).toBe(true);
  });

  it("produces the required stable JSON schema when checks pass", () => {
    const report = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(validateBetaLiveCertificationReportSchema(report)).toEqual({ valid: true, errors: [] });
    expect(report).toMatchObject({
      generatedAt: expect.any(String),
      commit: HEAD,
      safeForBetaLive: true,
      decision: "SAFE_FOR_BETA_LIVE=true",
      humanInteractionRequired: false,
      productionMutationDuringCertification: false,
      coreUserPath: expect.any(Object),
      safetyGates: expect.any(Object),
      supportingEvidence: expect.any(Object),
      blockers: [],
      warnings: [],
    });
  });

  it("returns unsafe when a required core path command fails", () => {
    const report = buildBetaLiveCertificationReport({
      commit: HEAD,
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
      commit: HEAD,
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

  it("returns unsafe when a required check is missing or skipped", () => {
    const missing = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes().filter((outcome) => outcome.id !== "goldenPath"),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });
    const skipped = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes().map((outcome) =>
        outcome.id === "packetLifecycleApi"
          ? { ...outcome, result: "skipped", exitCode: 0 }
          : outcome,
      ),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(missing.safeForBetaLive).toBe(false);
    expect(missing.coreUserPath.upload.pass).toBe(false);
    expect(skipped.safeForBetaLive).toBe(false);
    expect(skipped.safetyGates.packetEligibility.pass).toBe(false);
  });

  it("returns safe only when all core path and safety gates pass", () => {
    const report = buildBetaLiveCertificationReport({
      commit: HEAD,
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
      commit: HEAD,
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

  it("does not let legacy proof pass override a failed beta-live safety gate", () => {
    const report = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes(["packetReadiness"]),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.supportingEvidence.legacyMachineProofs.pass).toBe(true);
    expect(report.safeForBetaLive).toBe(false);
    expect(report.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(["safetyGates.parserCertainty", "safetyGates.packetEligibility"]),
    );
  });

  it("keeps failed legacy proof artifacts supporting-only unless explicitly required", () => {
    const supportingFailure = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting({
        rawReportProof: {
          pass: false,
          artifact: "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json",
          status: "not-certifying",
          supportingOnly: true,
          requiredForFinalDecision: false,
        },
      }),
      productionEnvironment: { productionLike: false, reason: "" },
    });
    const requiredFailure = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting({
        rawReportProof: {
          pass: false,
          artifact: "docs/production-scale/evidence/latest-storage-raw-report-machine-proof.json",
          status: "not-certifying",
          supportingOnly: true,
          requiredForFinalDecision: true,
        },
      }),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(supportingFailure.safeForBetaLive).toBe(true);
    expect(supportingFailure.warnings.map((warning) => warning.code)).toContain("supportingEvidence.rawReportProof");
    expect(requiredFailure.safeForBetaLive).toBe(false);
    expect(requiredFailure.blockers.map((blocker) => blocker.code)).toContain("supportingEvidence.rawReportProof");
  });

  it("does not require human input and records no production mutation for safe certification", () => {
    const report = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.humanInteractionRequired).toBe(false);
    expect(report.productionMutationDuringCertification).toBe(false);
    expect(report.safetyGates.noProductionMutationInSimulation.pass).toBe(true);
    expect(report.commandOutcomes.every((outcome) => outcome.stdin === "ignore")).toBe(true);
  });

  it("fails closed when a command reports human interaction or production mutation", () => {
    const humanInteraction = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes().map((outcome) =>
        outcome.id === "goldenPath" ? { ...outcome, stdin: "pipe" } : outcome,
      ),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });
    const mutation = buildBetaLiveCertificationReport({
      commit: HEAD,
      commandOutcomes: commandOutcomes().map((outcome) =>
        outcome.id === "goldenPath" ? { ...outcome, productionMutationDuringCertification: true } : outcome,
      ),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(humanInteraction.safeForBetaLive).toBe(false);
    expect(humanInteraction.humanInteractionRequired).toBe(true);
    expect(humanInteraction.blockers.map((blocker) => blocker.code)).toContain("humanInteractionRequired");
    expect(mutation.safeForBetaLive).toBe(false);
    expect(mutation.productionMutationDuringCertification).toBe(true);
    expect(mutation.safetyGates.noProductionMutationInSimulation.pass).toBe(false);
    expect(mutation.blockers.map((blocker) => blocker.code)).toContain("productionMutationDuringCertification");
  });

  it("fails closed when git commit cannot be detected", () => {
    const report = buildBetaLiveCertificationReport({
      commit: "unknown",
      commandOutcomes: commandOutcomes(),
      supportingEvidence: supporting(),
      productionEnvironment: { productionLike: false, reason: "" },
    });

    expect(report.safeForBetaLive).toBe(false);
    expect(report.decision).toBe("SAFE_FOR_BETA_LIVE=false");
    expect(report.blockers.map((blocker) => blocker.code)).toContain("schema.commit");
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
