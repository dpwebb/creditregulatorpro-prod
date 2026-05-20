import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildLeftoverBlockerClosureAuditReport,
  validateLeftoverBlockerClosureAuditReport,
  writeLeftoverBlockerClosureAuditOutputs,
} from "../../scripts/leftover-blocker-closure-audit.mjs";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-leftover-audit-"));
  tempRoots.push(root);
  return root;
}

function blocker(number: number, classification: string, extras: Record<string, unknown> = {}) {
  return {
    number,
    title: `Blocker ${number}`,
    severity: "Medium",
    area: `Area ${number}`,
    currentStatus: classification === "human proof required" ? "requires-human-proof" : "partial",
    classification,
    proofTypeRequired: `Proof required for blocker ${number}.`,
    allowedProofCommands: [`pnpm run fixture:${number}`],
    relatedEvidenceOutputPaths: [`docs/production-scale/evidence/fixture-${number}.json`],
    recommendedNextAction: `Fix blocker ${number}.`,
    humanProofRequired: classification === "human proof required",
    simulatedProofAcceptable: classification === "simulated proof only",
    waiverReason: null,
    ...extras,
  };
}

function promotionPackFixture(overrides: Record<string, unknown> = {}) {
  const blockers = [
    blocker(1, "human proof required"),
    blocker(2, "partial"),
    blocker(3, "fixed with automated evidence"),
    blocker(6, "human proof required"),
    blocker(9, "simulated proof only"),
    blocker(10, "waived with explicit reason", {
      waiverReason: "Fixture waiver reason.",
    }),
    blocker(18, "waived with explicit reason", {
      waiverReason: "Runtime-size warning-only waiver.",
    }),
    blocker(20, "human proof required"),
  ];
  return {
    reportName: "production-promotion-evidence-pack",
    generatedAt: "2026-05-20T12:00:00.000Z",
    currentBranch: "staging",
    currentCommitHash: "a".repeat(40),
    readinessClassification: {
      value: "limited beta",
      canPromoteProductionAtScale: false,
    },
    blockerClassifications: blockers,
    unresolvedProductionBlockers: blockers.filter((item) => [1, 2, 6, 9, 20].includes(item.number)),
    unresolvedScaleBlockers: [],
    generatedEvidenceFileReferences: [
      {
        path: "docs/production-scale/evidence/latest-alerts-dry-run.json",
        exists: true,
        evidenceType: "SIMULATED",
        productionProof: false,
      },
      {
        path: "docs/production-scale/evidence/human-restore-drill-evidence.md",
        exists: false,
      },
    ],
    safety: {
      simulatedProofIsProductionProof: false,
    },
    skippedChecks: {
      treatsSkipAsPass: false,
      dashboardPassAloneIsReleaseEvidence: false,
    },
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("leftover blocker closure audit", () => {
  it("lists every unresolved blocker with exact missing proof and commands", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const unresolvedNumbers = report.allBlockers
      .filter((item) => !item.classification.startsWith("fixed with") && item.classification !== "waived with explicit reason")
      .map((item) => item.number);

    expect(report.remainingBlockers.map((item) => item.number)).toEqual(unresolvedNumbers);
    for (const item of report.remainingBlockers) {
      expect(item.missingEvidence.length).toBeGreaterThan(0);
      expect(item.exactRequiredCommands.length).toBeGreaterThan(0);
    }
    expect(validateLeftoverBlockerClosureAuditReport(report)).toEqual({ ok: true, errors: [] });
  });

  it("does not let simulated-only proof close production blockers", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const blocker9 = report.allBlockers.find((item) => item.number === 9);

    expect(blocker9).toMatchObject({
      classification: "simulated proof only",
      closureState: "simulated-only",
      operatorActionRequired: true,
    });
    expect(report.safety.simulatedProofPromotedToProductionProof).toBe(false);
  });

  it("keeps human-required blockers human-required", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    for (const number of [1, 6, 20]) {
      expect(report.allBlockers.find((item) => item.number === number)).toMatchObject({
        closureState: "human-required",
        operatorActionRequired: true,
        codexCanSafelyClose: false,
      });
    }
  });

  it("requires explicit waiver reasons for waived blockers", () => {
    const pack = promotionPackFixture({
      blockerClassifications: [
        blocker(10, "waived with explicit reason", {
          waiverReason: "",
        }),
      ],
      unresolvedProductionBlockers: [],
      unresolvedScaleBlockers: [],
      readinessClassification: {
        value: "production-at-scale",
        canPromoteProductionAtScale: true,
      },
    });
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: pack,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.validation.ok).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/Waived blocker 10/i);
  });

  it("readiness classification follows blocker state", () => {
    const limitedBeta = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    expect(limitedBeta.remainingBlockers.length).toBeGreaterThan(0);
    expect(limitedBeta.readinessClassification.value).toBe("limited beta");

    const invalid = {
      ...limitedBeta,
      readinessClassification: {
        value: "production-at-scale",
        canPromoteProductionAtScale: true,
      },
    };
    expect(validateLeftoverBlockerClosureAuditReport(invalid).ok).toBe(false);
    expect(validateLeftoverBlockerClosureAuditReport(invalid).errors.join("\n")).toMatch(/production-at-scale/i);
  });

  it("writes the final audit evidence files", () => {
    const rootDir = makeTempRoot();
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const outputs = writeLeftoverBlockerClosureAuditOutputs(report, { rootDir });

    expect(outputs.markdownPath).toBe("docs/production-scale/evidence/latest-leftover-blocker-closure-audit.md");
    expect(outputs.jsonPath).toBe("docs/production-scale/evidence/latest-leftover-blocker-closure-audit.json");
  });
});
