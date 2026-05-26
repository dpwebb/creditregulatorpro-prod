import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PLATFORM_CERTIFICATION_JSON_PATH,
  certifiedCommitAcceptedByGoLiveEvidencePolicy,
  renderControlledGoLivePromotionSummary,
  renderPromotionGuardSummary,
  validateControlledGoLivePromotion,
  validateLatestProductionPromotionPack,
  validateProductionHostKeyPinning,
  validateProductionNoWorkerPolicy,
  validatePromotionPackForProduction,
} from "../../scripts/production-promotion-guard.mjs";

const HEAD = "1234567890abcdef1234567890abcdef12345678";
const EVIDENCE_PARENT = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function certifyingPack(overrides: Record<string, unknown> = {}) {
  return {
    reportName: "production-promotion-evidence-pack",
    generatedAt: "2026-05-22T12:00:00.000Z",
    currentCommitHash: HEAD,
    currentHead: HEAD,
    targetSha: HEAD,
    certifying: true,
    CERTIFYING: true,
    canPromoteProductionAtScale: true,
    readinessClassification: {
      value: "production-at-scale",
      canPromoteProductionAtScale: true,
      reason: "Every blocker is fixed or waived with accepted evidence.",
    },
    promotionCertification: {
      CERTIFYING: true,
      missingRequiredChecks: [],
      staleChecks: [],
      nonAutomatedChecks: [],
      skippedChecks: [],
      failedChecks: [],
    },
    machineProofSummary: {
      CERTIFYING: true,
      allMachineProofsCertifying: true,
      missingRuntimeInputs: [],
      openBlockers: [],
      safetySummary: {
        humanInteractionRequired: false,
        humanObserved: false,
        manualApprovalRequired: false,
      },
      proofResults: [
        {
          key: "restore",
          certifying: true,
          humanDependent: false,
          humanInteractionRequired: false,
          humanObserved: false,
          manualApprovalRequired: false,
          simulatedOnly: false,
          validation: { stale: false },
        },
        {
          key: "migration",
          certifying: true,
          humanDependent: false,
          humanInteractionRequired: false,
          humanObserved: false,
          manualApprovalRequired: false,
          simulatedOnly: false,
          validation: { stale: false },
        },
      ],
    },
    machineProofs: {
      migration: {
        accepted: true,
        metadata: {
          temporaryAllowlistActive: false,
          unresolvedResidualCount: 0,
          expiredResidualCount: 0,
        },
      },
    },
    migrationGateEvidence: {
      temporaryAllowlistActive: false,
      status: "accepted-release-blocking",
    },
    blockerClassifications: [
      {
        number: 1,
        title: "Disaster recovery",
        severity: "P1",
        classification: "fixed with automated evidence",
      },
    ],
    unresolvedProductionBlockers: [],
    unresolvedScaleBlockers: [],
    staleReferences: {
      auditCommitReferenceStale: false,
    },
    ...overrides,
  };
}

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "crp-promotion-guard-"));
}

function platformCertification(overrides: Record<string, unknown> = {}) {
  return {
    reportName: "creditregulatorpro-level-5-platform-certification",
    currentCommit: HEAD,
    certificationStatus: "PASS",
    CERTIFYING: true,
    BLOCKED_BY_INPUTS: false,
    deploymentReadinessScore: 100,
    unresolvedBlockers: [],
    ...overrides,
  };
}

function writeControlledGoLiveFixture(root: string, certification = platformCertification()) {
  mkdirSync(join(root, "docs", "platform-certification"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(
    join(root, ...PLATFORM_CERTIFICATION_JSON_PATH.split("/")),
    `${JSON.stringify(certification, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, ".github", "workflows", "deploy-production.yml"),
    readFileSync(join(process.cwd(), ".github", "workflows", "deploy-production.yml"), "utf8"),
    "utf8",
  );
  writeFileSync(
    join(root, "docker-compose.production.yml"),
    readFileSync(join(process.cwd(), "docker-compose.production.yml"), "utf8"),
    "utf8",
  );
}

function hostKeyEnv() {
  return {
    PRODUCTION_SSH_HOST_KEY_SHA256: "SHA256:abcdefghijklmnopqrstuvwxyzABCDEF0123456789+/=",
    CRP_DISABLE_GITHUB_HOST_KEY_LOOKUP: "true",
  };
}

describe("production promotion guard", () => {
  it("blocks promotion when CERTIFYING is false", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        certifying: false,
        CERTIFYING: false,
        promotionCertification: {
          CERTIFYING: false,
          missingRequiredChecks: [],
          staleChecks: [],
          nonAutomatedChecks: [],
          skippedChecks: [],
          failedChecks: ["queueLiveness"],
        },
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["non-certifying-pack", "non-certifying-promotion-checks"]),
    );
  });

  it("blocks promotion when P1 blockers exist", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        blockerClassifications: [
          {
            number: 6,
            title: "Historical raw report byte remediation remains unresolved",
            severity: "P1",
            classification: "partial",
          },
        ],
        unresolvedProductionBlockers: [
          {
            number: 6,
            title: "Historical raw report byte remediation remains unresolved",
            severity: "P1",
            classification: "partial",
          },
        ],
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.openP0P1Blockers).toHaveLength(1);
    expect(result.reasons.map((reason) => reason.code)).toContain("open-p0-p1-blockers");
  });

  it("blocks promotion when the promotion pack file is missing", () => {
    const result = validateLatestProductionPromotionPack({
      rootDir: tempRoot(),
      packPath: "docs/production-scale/evidence/latest-production-promotion-pack.json",
      currentHead: HEAD,
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(["missing-pack"]);
  });

  it("allows promotion only when certifying true and no P0/P1 blockers exist in a safe fixture", () => {
    const result = validatePromotionPackForProduction(certifyingPack(), { currentHead: HEAD });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.openP0P1Blockers).toEqual([]);
  });

  it("allows a safe fixture when the evidence hash is accepted by evidence-only commit policy", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        currentCommitHash: EVIDENCE_PARENT,
        currentHead: EVIDENCE_PARENT,
        targetSha: EVIDENCE_PARENT,
      }),
      {
        currentHead: HEAD,
        acceptedEvidenceHeads: [EVIDENCE_PARENT],
      },
    );

    expect(result.allowed).toBe(true);
  });

  it("does not print secrets, raw report bytes, signed URLs, or PII in blocker output", () => {
    const signedUrl = "https://storage.example.test/report.pdf?X-Amz-Signature=abc123&X-Amz-Credential=secret";
    const result = validatePromotionPackForProduction(
      certifyingPack({
        CERTIFYING: false,
        certifying: false,
        canPromoteProductionAtScale: false,
        readinessClassification: {
          value: "limited beta",
          canPromoteProductionAtScale: false,
        },
        blockerClassifications: [
          {
            number: 9,
            title: `Jane Consumer jane@example.com sk-proj-secret123456 raw report bytes ${signedUrl}`,
            severity: "P1",
            classification: "human proof required",
          },
        ],
      }),
      { currentHead: HEAD },
    );
    const output = renderPromotionGuardSummary(result);

    expect(output).not.toContain("jane@example.com");
    expect(output).not.toContain("sk-proj-secret123456");
    expect(output).not.toContain("raw report bytes");
    expect(output).not.toContain("X-Amz-Signature");
    expect(output).not.toContain("X-Amz-Credential");
    expect(output).not.toContain(signedUrl);
  });

  it("blocks promotion when a certifying-looking pack still contains human proof dependencies", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        blockerClassifications: [
          {
            number: 1,
            title: "Disaster recovery",
            severity: "P1",
            classification: "fixed with human-observed evidence",
          },
        ],
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
      "human-proof-dependency",
      "open-p0-p1-blockers",
    ]));
  });

  it("blocks promotion when a machine proof is stale", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        machineProofSummary: {
          CERTIFYING: false,
          allMachineProofsCertifying: false,
          proofResults: [
            {
              key: "restore",
              certifying: false,
              humanDependent: false,
              simulatedOnly: false,
              validation: { stale: true },
            },
          ],
        },
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
      "non-certifying-machine-proof-summary",
      "stale-machine-proof",
    ]));
  });

  it("blocks promotion when a machine proof is simulated-only", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        machineProofSummary: {
          CERTIFYING: false,
          allMachineProofsCertifying: false,
          proofResults: [
            {
              key: "restore",
              certifying: false,
              humanDependent: false,
              simulatedOnly: true,
              validation: { stale: false },
            },
          ],
        },
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining([
      "non-certifying-machine-proof-summary",
      "simulated-machine-proof",
    ]));
  });

  it("blocks promotion when migration temporary allowlist residuals remain unresolved", () => {
    const result = validatePromotionPackForProduction(
      certifyingPack({
        machineProofs: {
          migration: {
            accepted: false,
            metadata: {
              temporaryAllowlistActive: true,
              unresolvedResidualCount: 1,
            },
          },
        },
        migrationGateEvidence: {
          temporaryAllowlistActive: true,
          status: "accepted-temporary-allowlist",
        },
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("unresolved-migration-allowlist");
  });

  it("wires the hard guard into package scripts, release validation, local promotion, and production CI preflight", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const validationTierScript = readFileSync("scripts/validation-tier.mjs", "utf8");
    const promoteProductionScript = readFileSync("scripts/promote-production.mjs", "utf8");
    const productionWorkflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");

    expect(packageJson.scripts["production-scale:promotion-guard"]).toBe("node scripts/production-promotion-guard.mjs");
    expect(validationTierScript).toContain("pnpm run production-scale:promotion-guard");
    expect(promoteProductionScript).toContain("pnpm run validate:release");
    expect(productionWorkflow).toContain("pnpm run validate:release");
  });

  it("loads a safe fixture pack from disk", () => {
    const root = tempRoot();
    const packPath = "docs/production-scale/evidence/latest-production-promotion-pack.json";
    const fullPath = join(root, ...packPath.split("/"));
    mkdirSync(join(root, "docs/production-scale/evidence"), { recursive: true });
    writeFileSync(fullPath, `${JSON.stringify(certifyingPack(), null, 2)}\n`, "utf8");

    const result = validateLatestProductionPromotionPack({ rootDir: root, packPath, currentHead: HEAD });

    expect(result.allowed).toBe(true);
  });

  it("allows controlled go-live when Level 5 certification matches the current target and no-worker policy is cleared", () => {
    const root = tempRoot();
    writeControlledGoLiveFixture(root);

    const result = validateControlledGoLivePromotion({
      rootDir: root,
      currentHead: HEAD,
      env: hostKeyEnv(),
    });

    expect(result.allowed).toBe(true);
    expect(result.certification).toMatchObject({
      certificationStatus: "PASS",
      deploymentReadinessScore: 100,
      blockers: 0,
      targetAccepted: true,
    });
    expect(result.hostKeyPinning.allowed).toBe(true);
    expect(result.workerPolicy).toMatchObject({
      allowed: true,
      policy: "no-worker-production-deploy",
    });
  });

  it("allows controlled go-live with Level 5 PASS_WITH_WARNINGS when all hard gates are still certifying", () => {
    const root = tempRoot();
    writeControlledGoLiveFixture(
      root,
      platformCertification({
        certificationStatus: "PASS_WITH_WARNINGS",
        warnOnlyFindings: [
          {
            severity: "WARN_ONLY",
            subsystem: "Infrastructure Readiness",
            reason: "Runtime audit passed with non-fatal warnings.",
          },
        ],
      }),
    );

    const result = validateControlledGoLivePromotion({
      rootDir: root,
      currentHead: HEAD,
      env: hostKeyEnv(),
    });

    expect(result.allowed).toBe(true);
    expect(result.certification).toMatchObject({
      certificationStatus: "PASS_WITH_WARNINGS",
      deploymentReadinessScore: 100,
      blockers: 0,
      targetAccepted: true,
    });
  });

  it("blocks controlled go-live when Level 5 certification is not certifying", () => {
    const root = tempRoot();
    writeControlledGoLiveFixture(
      root,
      platformCertification({
        certificationStatus: "INCOMPLETE",
        CERTIFYING: false,
        BLOCKED_BY_INPUTS: true,
      }),
    );

    const result = validateControlledGoLivePromotion({
      rootDir: root,
      currentHead: HEAD,
      env: hostKeyEnv(),
    });

    expect(result.allowed).toBe(false);
    expect(result.certification.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "platform-certification-not-pass",
        "platform-certification-blocked-inputs",
        "platform-certification-not-certifying",
      ]),
    );
  });

  it("blocks controlled go-live when host-key pinning input is missing", () => {
    const root = tempRoot();
    writeControlledGoLiveFixture(root);

    const result = validateProductionHostKeyPinning({
      rootDir: root,
      env: { CRP_DISABLE_GITHUB_HOST_KEY_LOOKUP: "true" },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("host-key-input-missing");
  });

  it("blocks controlled go-live when production worker would start by default", () => {
    const root = tempRoot();
    writeControlledGoLiveFixture(root);
    writeFileSync(
      join(root, "docker-compose.production.yml"),
      "services:\n  creditregulatorpro-ingest-worker:\n    restart: unless-stopped\n",
      "utf8",
    );

    const result = validateProductionNoWorkerPolicy({ rootDir: root });

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("worker-compose-service-present");
  });

  it("allows evidence-only descendants of a certified app-source commit", () => {
    const root = tempRoot();
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    mkdirSync(join(root, "docs", "platform-certification"), { recursive: true });
    writeFileSync(join(root, "app.ts"), "export const app = true;\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-m", "app"], { cwd: root, stdio: "ignore" });
    const appCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    writeFileSync(join(root, "docs", "platform-certification", "latest-platform-certification.json"), "{}\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-m", "evidence"], { cwd: root, stdio: "ignore" });
    const evidenceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    expect(certifiedCommitAcceptedByGoLiveEvidencePolicy(root, appCommit, evidenceCommit)).toBe(true);
  });

  it("blocks descendants that changed source after certification", () => {
    const root = tempRoot();
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    writeFileSync(join(root, "app.ts"), "export const app = true;\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-m", "app"], { cwd: root, stdio: "ignore" });
    const appCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    writeFileSync(join(root, "app.ts"), "export const app = false;\n", "utf8");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-m", "source"], { cwd: root, stdio: "ignore" });
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

    expect(certifiedCommitAcceptedByGoLiveEvidencePolicy(root, appCommit, sourceCommit)).toBe(false);
  });

  it("redacts controlled go-live blocker output", () => {
    const result = validateControlledGoLivePromotion({
      rootDir: tempRoot(),
      currentHead: "not-a-sha",
      env: { CRP_DISABLE_GITHUB_HOST_KEY_LOOKUP: "true" },
    });
    const output = renderControlledGoLivePromotionSummary(result);

    expect(output).toContain("Controlled production go-live guard blocked promotion.");
    expect(output).not.toContain("-----BEGIN");
    expect(output).not.toContain("sk-proj-");
  });
});
