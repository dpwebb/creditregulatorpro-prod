import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ALERTING_MACHINE_PROOF_EVIDENCE_TYPE,
  ALERTING_MACHINE_PROOF_EXCLUSION_CHECKS,
  ALERTING_MACHINE_PROOF_LIVE_CHECKS,
  buildAlertingMachineProofReport,
  validateAlertingMachineProofEvidence,
} from "../../scripts/alerting-machine-proof.mjs";
import { buildProductionPromotionPackReport } from "../../scripts/production-promotion-pack.mjs";

const HEAD = "b".repeat(40);
const GENERATED_AT = "2026-05-22T12:00:00.000Z";
const NOW = "2026-05-22T13:00:00.000Z";
const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-alerting-proof-"));
  tempRoots.push(root);
  return root;
}

function baseLiveAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    simulatedOnly: false,
    dryRunOnly: false,
    environment: "production",
    status: "pass",
    certifying: true,
    acceptedCheckSet: "live-alert-delivery",
    alertingProofPath: "live-alert",
    alertType: "synthetic-response-ops-alert",
    channelSanitizedId: "alert-channel-hash",
    correlationId: "alert-correlation-hash",
    deliveryTimestamp: GENERATED_AT,
    deliveryVerified: true,
    responseOpsReady: true,
    schedulerStatus: "disabled-verified",
    checks: ALERTING_MACHINE_PROOF_LIVE_CHECKS.map((name) => ({ name, status: "pass" })),
    ...overrides,
  };
}

function baseFormalExclusionAttestation(overrides: Record<string, unknown> = {}) {
  return {
    nonInteractive: true,
    machineAttested: true,
    generatedManually: false,
    simulatedOnly: false,
    dryRunOnly: false,
    environment: "production",
    status: "pass",
    certifying: true,
    acceptedCheckSet: "certifying-formal-exclusion",
    alertingProofPath: "certifying-formal-exclusion",
    policyAllowsCertificationUnderExclusion: true,
    responseOpsReady: true,
    schedulerStatus: "disabled-verified",
    exclusionExpiresAt: "2026-08-20",
    nextReviewDate: "2026-06-20",
    exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows:
      "This exclusion does not mean production-at-scale PASS unless policy allows the limited alerting scope.",
    checks: ALERTING_MACHINE_PROOF_EXCLUSION_CHECKS.map((name) => ({ name, status: "pass" })),
    ...overrides,
  };
}

function writeAttestation(root: string, name: string, attestation: Record<string, unknown>) {
  const evidenceDir = join(root, "docs", "production-scale", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const relativePath = `docs/production-scale/evidence/${name}.json`;
  writeFileSync(join(root, relativePath), `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return relativePath;
}

function buildReportFromAttestation(attestation: Record<string, unknown>) {
  const root = tempRoot();
  const attestationPath = writeAttestation(root, "alerting-attestation", attestation);
  return buildAlertingMachineProofReport({
    rootDir: root,
    generatedAt: GENERATED_AT,
    env: { CRP_MACHINE_EVIDENCE_COMMIT_HASH: HEAD },
    argv: ["--attestation", attestationPath],
  });
}

function dashboardWithSkips() {
  return {
    summary: {
      pass: 10,
      fail: 0,
      skip: 2,
      simulated: 3,
      machineRequired: 2,
    },
    releaseEvidenceSemantics: {
      exactCommandsRequired: true,
      dashboardPassAloneSufficient: false,
      skipTreatedAsPass: false,
    },
  };
}

function currentGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("alerting machine proof", () => {
  it("rejects dry-run-only alert proof", () => {
    const report = buildReportFromAttestation(baseLiveAttestation({ dryRunOnly: true }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures.map((failure: { message: string }) => failure.message).join("\n")).toMatch(/dry-run-only/i);
  });

  it("fails when delivery verification is missing", () => {
    const report = buildReportFromAttestation(baseLiveAttestation({
      deliveryVerified: false,
      checks: ALERTING_MACHINE_PROOF_LIVE_CHECKS
        .filter((name) => name !== "alert-delivery-verified")
        .map((name) => ({ name, status: "pass" })),
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(validateAlertingMachineProofEvidence(report, { now: NOW }).errors.join("\n")).toMatch(/delivery verification/i);
  });

  it("rejects stale automated policy exclusions", () => {
    const report = buildReportFromAttestation(baseFormalExclusionAttestation({
      exclusionExpiresAt: "2026-05-01",
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(validateAlertingMachineProofEvidence(report, { now: NOW }).errors.join("\n")).toMatch(/stale|expiration/i);
  });

  it("fails when response operations readiness is missing", () => {
    const report = buildReportFromAttestation(baseLiveAttestation({
      responseOpsReady: false,
      checks: ALERTING_MACHINE_PROOF_LIVE_CHECKS
        .filter((name) => name !== "response-ops-readiness-verified")
        .map((name) => ({ name, status: "pass" })),
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(validateAlertingMachineProofEvidence(report, { now: NOW }).errors.join("\n")).toMatch(/response operations readiness/i);
  });

  it("rejects secret-like webhook values and does not echo them into evidence", () => {
    const report = buildReportFromAttestation(baseLiveAttestation({
      metadata: {
        webhookUrl: "https://hooks.example.test/services/proof?token=supersecretvalue",
      },
    }));

    expect(report.CERTIFYING).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({ code: "alerting-machine-proof-sensitive-value" }),
    ]);
    expect(JSON.stringify(report)).not.toMatch(/supersecretvalue/);
  });

  it("accepts a valid sanitized live synthetic alert proof", () => {
    const report = buildReportFromAttestation(baseLiveAttestation());
    const validation = validateAlertingMachineProofEvidence(report, { now: NOW });

    expect(report.evidenceType).toBe(ALERTING_MACHINE_PROOF_EVIDENCE_TYPE);
    expect(report.CERTIFYING).toBe(true);
    expect(report.deliveryVerified).toBe(true);
    expect(report.responseOpsReady).toBe(true);
    expect(validation.ok).toBe(true);
  });

  it("accepts automated policy exclusion only when repo policy explicitly permits it", () => {
    const rejected = buildReportFromAttestation(baseFormalExclusionAttestation({
      policyAllowsCertificationUnderExclusion: false,
    }));
    const accepted = buildReportFromAttestation(baseFormalExclusionAttestation());

    expect(rejected.CERTIFYING).toBe(false);
    expect(validateAlertingMachineProofEvidence(rejected, { now: NOW }).errors.join("\n")).toMatch(/policy allowing/i);
    expect(accepted.CERTIFYING).toBe(true);
    expect(validateAlertingMachineProofEvidence(accepted, { now: NOW }).ok).toBe(true);
  });

  it("keeps promotion blocker open until alerting proof certifies", () => {
    const head = currentGitHead();
    const invalidProof = buildReportFromAttestation(baseLiveAttestation({ dryRunOnly: true }));
    const validProof = buildReportFromAttestation(baseLiveAttestation());

    const invalidReport = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      alertingMachineProofEvidence: invalidProof,
      generatedAt: GENERATED_AT,
      env: {},
      targetSha: head,
    });
    const validReport = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      alertingMachineProofEvidence: validProof,
      generatedAt: GENERATED_AT,
      env: {},
      targetSha: head,
    });

    expect(invalidReport.machineProofs.alerting.accepted).toBe(false);
    expect(invalidReport.blockerClassifications.find((blocker: { number: number }) => blocker.number === 9)?.classification)
      .toBe("machine proof required");
    expect(validReport.machineProofs.alerting.accepted).toBe(true);
    expect(validReport.blockerClassifications.find((blocker: { number: number }) => blocker.number === 9)?.classification)
      .toBe("fixed with automated evidence");
  });
});
