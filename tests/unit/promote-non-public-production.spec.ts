import { describe, expect, it } from "vitest";

import {
  NON_PUBLIC_PROMOTION_CONFIRM_COMMAND,
  isAdminCredentialOrClickThroughDeferral,
  parseNonPublicPromotionArgs,
  validateNonPublicCertificationEvidence,
  validateWorkingTreeAllowsNonPublicPromotion,
} from "../../scripts/promote-non-public-production.mjs";

const HEAD = "1234567890abcdef1234567890abcdef12345678";
const OTHER_HEAD = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";

function cleanSafety(overrides: Record<string, unknown> = {}) {
  return {
    productionDataMutated: false,
    productionConfigurationModified: false,
    infrastructureModifiedAutomatically: false,
    schemasModified: false,
    destructiveCleanupRun: false,
    secretsPrinted: false,
    ...overrides,
  };
}

function deferredAdminBlocker(overrides: Record<string, unknown> = {}) {
  return {
    severity: "DEFERRED_LIVE_PRODUCTION_BLOCKER",
    subsystem: "Admin Certification",
    gateId: "adminClickThrough",
    gateLabel: "Admin click-through certification",
    reason: "Admin click-through certification is blocked because E2E admin credentials are not configured.",
    deferrableForNonPublicDeployment: true,
    deferredUntilCertificationMode: "LIVE_PRODUCTION",
    requiredBeforeLiveProduction: true,
    ...overrides,
  };
}

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    reportName: "creditregulatorpro-level-5-platform-certification",
    currentCommit: HEAD,
    certificationMode: "NON_PUBLIC_PRODUCTION_TEST",
    certificationStatus: "INCOMPLETE",
    CERTIFYING: false,
    BLOCKED_BY_INPUTS: true,
    liveProductionCertified: false,
    nonPublicDeploymentAcceptable: true,
    commandCounts: { failed: 0 },
    hardUnresolvedBlockers: [],
    unresolvedBlockers: [deferredAdminBlocker({ severity: "BLOCKED_BY_INPUTS" })],
    deferredLiveProductionBlockers: [deferredAdminBlocker()],
    safety: cleanSafety(),
    infrastructureReadinessStatus: "PASS",
    parserConfidenceCertification: "PASS",
    packetLifecycleStatus: "PASS",
    storageLifecycleStatus: "PASS",
    reproducibilityStatus: "PASS",
    rollbackReadinessStatus: "PASS",
    adminCertificationStatus: "INCOMPLETE",
    ...overrides,
  };
}

describe("non-public production promotion evidence", () => {
  it("accepts same-commit valid non-public evidence with only deferred admin credential proof", () => {
    const result = validateNonPublicCertificationEvidence(validEvidence(), { currentHead: HEAD });

    expect(result.allowed).toBe(true);
    expect(result.certificationMode).toBe("NON_PUBLIC_PRODUCTION_TEST");
    expect(result.nonPublicDeploymentAcceptable).toBe(true);
    expect(result.liveProductionCertified).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("rejects stale evidence", () => {
    const result = validateNonPublicCertificationEvidence(validEvidence({ currentCommit: OTHER_HEAD }), {
      currentHead: HEAD,
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("stale-platform-certification");
  });

  it("rejects hard blockers", () => {
    const result = validateNonPublicCertificationEvidence(
      validEvidence({
        hardUnresolvedBlockers: [
          {
            subsystem: "Packet Lifecycle Workflow",
            reason: "Packet lifecycle failure.",
          },
        ],
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("hard-unresolved-blockers");
  });

  it("rejects dirty safety flags", () => {
    const result = validateNonPublicCertificationEvidence(
      validEvidence({
        safety: cleanSafety({ productionDataMutated: true }),
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("dirty-safety-flag");
  });

  it("rejects non-deferrable deferred blockers", () => {
    const result = validateNonPublicCertificationEvidence(
      validEvidence({
        unresolvedBlockers: [],
        deferredLiveProductionBlockers: [
          deferredAdminBlocker({
            deferrableForNonPublicDeployment: false,
          }),
        ],
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain("non-deferrable-live-blocker");
  });

  it("rejects LIVE_PRODUCTION mode", () => {
    const result = validateNonPublicCertificationEvidence(
      validEvidence({
        certificationMode: "LIVE_PRODUCTION",
      }),
      { currentHead: HEAD },
    );

    expect(result.allowed).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["non-public-certification-mode-required", "live-production-mode-not-allowed"]),
    );
  });

  it("requires the explicit confirm flag", () => {
    expect(parseNonPublicPromotionArgs([])).toMatchObject({ confirm: false });
    expect(parseNonPublicPromotionArgs(["--confirm"])).toMatchObject({ confirm: true });
    expect(NON_PUBLIC_PROMOTION_CONFIRM_COMMAND).toBe("pnpm run promote:non-public-production -- --confirm");
  });

  it("allows only platform certification evidence to be dirty", () => {
    const clean = validateWorkingTreeAllowsNonPublicPromotion(
      [
        " M docs/platform-certification/latest-platform-certification.json",
        " M docs/platform-certification/latest-platform-certification.md",
      ].join("\n"),
    );
    const dirtySource = validateWorkingTreeAllowsNonPublicPromotion(" M scripts/platform-certification.mjs");

    expect(clean.allowed).toBe(true);
    expect(dirtySource.allowed).toBe(false);
    expect(dirtySource.reasons.map((reason) => reason.code)).toContain("working-tree-dirty");
  });

  it("recognizes only explicit admin credential/click-through deferrals", () => {
    expect(isAdminCredentialOrClickThroughDeferral(deferredAdminBlocker())).toBe(true);
    expect(isAdminCredentialOrClickThroughDeferral(
      deferredAdminBlocker({
        reason: "Packet lifecycle failure.",
        subsystem: "Packet Lifecycle Workflow",
      }),
    )).toBe(false);
  });
});
