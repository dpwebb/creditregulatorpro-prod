import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionPromotionPackReport,
  REQUIRED_PROMOTION_COMMANDS,
  validatePromotionPackReport,
} from "../../scripts/production-promotion-pack.mjs";
import { buildHumanRestoreDrillEvidenceAcceptanceReport } from "../../scripts/staging-backup-restore-checklist.mjs";

function dashboardWithSkips(skip = 2) {
  return {
    summary: {
      pass: 10,
      fail: 0,
      skip,
      simulated: 3,
      humanRequired: 2,
    },
    releaseEvidenceSemantics: {
      exactCommandsRequired: true,
      dashboardPassAloneSufficient: false,
      skipTreatedAsPass: false,
    },
  };
}

function buildPack() {
  return buildProductionPromotionPackReport({
    rootDir: process.cwd(),
    dashboardReport: dashboardWithSkips(),
    generatedAt: "2026-05-20T12:00:00.000Z",
    env: {},
  });
}

describe("production promotion evidence pack", () => {
  it("fails if a required blocker is missing", () => {
    const registry = JSON.parse(readFileSync(resolve("docs/production-scale/blocker-registry.json"), "utf8"));
    registry.blockers = registry.blockers.filter((blocker: { number: number }) => blocker.number !== 25);

    expect(() =>
      buildProductionPromotionPackReport({
        rootDir: process.cwd(),
        registry,
        dashboardReport: dashboardWithSkips(),
        env: {},
      }),
    ).toThrow(/Missing blocker number\(s\): 25|Expected 25 blockers/);
  });

  it("fails if simulated proof is mislabeled as production proof", () => {
    const report = buildPack();
    const simulated = report.generatedEvidenceFileReferences.find((file: { evidenceType: string | null }) =>
      /simulated/i.test(String(file.evidenceType ?? "")),
    );
    expect(simulated).toBeTruthy();
    simulated.productionProof = true;

    expect(validatePromotionPackReport(report)).toMatchObject({
      valid: false,
    });
    expect(validatePromotionPackReport(report).errors.join("\n")).toMatch(/SIMULATED evidence is mislabeled/i);
  });

  it("fails if dashboard SKIP is treated as PASS", () => {
    const report = buildPack();
    report.skippedChecks.treatsSkipAsPass = true;

    expect(validatePromotionPackReport(report)).toMatchObject({
      valid: false,
    });
    expect(validatePromotionPackReport(report).errors.join("\n")).toMatch(/Dashboard SKIP is treated as PASS/i);
  });

  it("detects stale audit commit references where practical", () => {
    const report = buildPack();

    expect(report.auditCurrentCommitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(report.currentCommitHash).toMatch(/^[a-f0-9]{40}$/);
    expect(report.staleReferences.auditCommitReferenceStale).toBe(report.auditCurrentCommitHash !== report.currentCommitHash);
  });

  it("includes all 25 blockers and exact command references", () => {
    const report = buildPack();

    expect(report.blockerClassifications).toHaveLength(25);
    expect(report.registry.actualBlockerCount).toBe(25);
    expect(report.currentBranch).toBeTruthy();
    expect(report.currentCommitHash).toMatch(/^[a-f0-9]{40}$/);
    for (const command of REQUIRED_PROMOTION_COMMANDS) {
      expect(report.commandList).toContain(command);
    }
    expect(report.commandList).toContain("pnpm run production-scale:evidence");
    expect(report.commandList).toContain("pnpm run restore:accept-human-evidence");
    expect(report.commandList).toContain("pnpm run packet-pdf:cache-miss-proof");
    expect(report.commandList).toContain("pnpm run production-worker:activation-plan");
  });

  it("does not claim production-at-scale readiness while unresolved or human-required blockers remain", () => {
    const report = buildPack();

    expect(report.humanRequiredProof.length).toBeGreaterThan(0);
    expect(report.unresolvedProductionBlockers.length).toBeGreaterThan(0);
    expect(report.readinessClassification.value).toBe("limited beta");
    expect(report.readinessClassification.canPromoteProductionAtScale).toBe(false);
    expect(report.safety.productionAtScaleClaimed).toBe(false);
  });

  it("keeps blocker 1 and 22 unresolved unless accepted human evidence exists", () => {
    const report = buildPack();
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);
    const blocker22 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 22);

    expect(report.humanRestoreDrillEvidenceAcceptance).toMatchObject({
      status: "not-submitted",
      accepted: false,
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
        retentionArchiveRestore: false,
      },
    });
    expect(blocker1?.classification).toBe("human proof required");
    expect(blocker22?.classification).toBe("human proof required");
    expect(report.humanRequiredProof.map((blocker: { number: number }) => blocker.number)).toEqual(
      expect.arrayContaining([1, 22]),
    );
  });

  it("classifies blocker 1 and 22 as fixed only with accepted human-observed evidence", () => {
    const humanRestoreEvidenceAcceptance = buildHumanRestoreDrillEvidenceAcceptanceReport({
      evidencePath: "tests/fixtures/human-restore-drill-evidence.valid.md",
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: dashboardWithSkips(),
      humanRestoreEvidenceAcceptance,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);
    const blocker22 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 22);

    expect(humanRestoreEvidenceAcceptance.accepted).toBe(true);
    expect(blocker1?.classification).toBe("fixed with human-observed evidence");
    expect(blocker22?.classification).toBe("fixed with human-observed evidence");
    expect(validatePromotionPackReport(report)).toEqual({ valid: true, errors: [] });
  });
});
