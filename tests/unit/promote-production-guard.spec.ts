import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  renderPromotionGuardSummary,
  validateLatestProductionPromotionPack,
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

  it("wires the hard guard into package scripts, local promotion, and production CI preflight", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const promoteProductionScript = readFileSync("scripts/promote-production.mjs", "utf8");
    const productionWorkflow = readFileSync(".github/workflows/deploy-production.yml", "utf8");

    expect(packageJson.scripts["production-scale:promotion-guard"]).toBe("node scripts/production-promotion-guard.mjs");
    expect(promoteProductionScript).toContain("scripts/production-promotion-guard.mjs");
    expect(productionWorkflow).toContain("pnpm run production-scale:promotion-guard");
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
});
