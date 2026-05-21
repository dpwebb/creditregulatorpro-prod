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
    proofCategories: ["automated-local"],
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
  const classifications = new Map<number, string>([
    [1, "human proof required"],
    [2, "partial"],
    [3, "fixed with automated evidence"],
    [4, "fixed with automated evidence"],
    [5, "fixed with automated evidence"],
    [6, "human proof required"],
    [7, "fixed with automated evidence"],
    [8, "fixed with automated evidence"],
    [9, "simulated proof only"],
    [10, "waived with explicit reason"],
    [11, "fixed with automated evidence"],
    [12, "fixed with automated evidence"],
    [13, "fixed with automated evidence"],
    [14, "fixed with automated evidence"],
    [15, "partial"],
    [16, "fixed with automated evidence"],
    [17, "fixed with automated evidence"],
    [18, "waived with explicit reason"],
    [19, "partial"],
    [20, "fixed with staging evidence"],
    [21, "fixed with automated evidence"],
    [22, "human proof required"],
    [23, "partial"],
    [24, "partial"],
    [25, "fixed with automated evidence"],
  ]);
  const blockers = Array.from({ length: 25 }, (_, index) => {
    const number = index + 1;
    const classification = classifications.get(number) ?? "partial";
    return blocker(number, classification, {
      waiverReason:
        number === 10
          ? "Migration gate fixture waiver."
          : number === 18
            ? "Runtime-size warning-only waiver."
            : null,
      proofCategories: number === 20 ? ["automated-local", "staging", "read-only-production"] : ["automated-local"],
      humanProofRequired: [1, 6, 20, 22].includes(number),
      simulatedProofAcceptable: [1, 2, 3, 8, 9, 16, 17, 22].includes(number),
    });
  });
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
    unresolvedProductionBlockers: blockers.filter((item) => [1, 2, 6, 9, 22].includes(item.number)),
    unresolvedScaleBlockers: [],
    commandResultSummary: [
      "pnpm run production-scale:evidence",
      "pnpm run production-scale:promotion-pack",
      "pnpm run operator:dashboard",
      "pnpm run typecheck",
      "git diff --check",
      "pnpm run restore:evidence:current-check",
      "pnpm run ingest:worker:staging-evidence",
      "pnpm run production-worker:activation-evidence",
      "pnpm run production-deployment-parity:evidence",
      "pnpm run response-ops:readiness-evidence",
      "pnpm run migrations:gate",
      "pnpm run baseline:production-scale-measured -- --local",
      "pnpm run runtime-size:policy-acceptance",
      "pnpm run storage:raw-report-remediation-plan",
      "pnpm run storage:raw-report-remediation-acceptance",
    ].map((command) => ({
      command,
      availableInRepository: true,
      result: command.includes("typecheck") || command.includes("git diff")
        ? "reference-required"
        : "evidence-file-present",
      resultSource: "fixture",
      status: command.includes("restore:evidence") ? "simulated-only" : "passed",
      latestGeneratedAt: "2026-05-20T12:00:00.000Z",
      evidenceFiles: [],
    })),
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
      dashboardAvailable: true,
      checksSkipped: true,
      skipCount: 55,
      summary: {
        skip: 55,
        pass: 9,
      },
    },
    migrationGateEvidence: {
      formalWaiver: {
        reason: "Migration gate fixture waiver.",
        approvedByRole: "Release owner",
        expiresOn: "2026-08-20",
        acceptedAt: "2026-05-20T12:00:00.000Z",
      },
    },
    runtimeSizePolicyAcceptance: {
      formalWaiver: {
        reason: "Runtime-size warning-only waiver.",
        ownerRole: "Runtime owner",
        reviewDate: "2026-08-20",
        acceptedAt: "2026-05-20T12:00:00.000Z",
      },
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
  it("includes all 25 blockers and explicitly tracks the prior unresolved set", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.allBlockers).toHaveLength(25);
    expect(report.priorTrackedBlockers.map((item) => item.number)).toEqual([
      1, 2, 6, 8, 9, 10, 11, 20, 21, 22, 3, 16, 17, 18,
    ]);
    expect(validateLeftoverBlockerClosureAuditReport(report)).toEqual({ ok: true, errors: [] });
  });

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

  it("does not let staging-only evidence become production proof unless the registry allows staging closure", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.allBlockers.find((item) => item.number === 20)).toMatchObject({
      classification: "fixed with staging evidence",
      closureState: "closed-staging",
      stagingOnlyClosureAllowed: true,
    });
    expect(report.safety.stagingProofPromotedToProductionProof).toBe(false);

    const invalid = {
      ...report,
      allBlockers: report.allBlockers.map((item) =>
        item.number === 20 ? { ...item, stagingOnlyClosureAllowed: false } : item,
      ),
    };
    expect(validateLeftoverBlockerClosureAuditReport(invalid).errors.join("\n")).toMatch(/Staging-evidenced blocker 20/i);
  });

  it("keeps human-required blockers human-required", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });
    for (const number of [1, 6, 22]) {
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
    expect(report.validation.errors.join("\n")).toMatch(/Expected all 25 blockers|Waived blocker 10/i);
  });

  it("requires waiver owner and review date for waived blockers", () => {
    const pack = promotionPackFixture({
      migrationGateEvidence: {
        formalWaiver: {
          reason: "Missing owner and review date.",
        },
      },
    });
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: pack,
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.validation.ok).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/waiver governance owner/i);
    expect(report.validation.errors.join("\n")).toMatch(/waiver governance review date/i);
  });

  it("keeps dashboard SKIP count visible and not treated as PASS", () => {
    const report = buildLeftoverBlockerClosureAuditReport({
      promotionPack: promotionPackFixture(),
      generatedAt: "2026-05-20T12:00:00.000Z",
    });

    expect(report.dashboard).toMatchObject({
      skipCount: 55,
      skipTreatedAsPass: false,
      dashboardPassAloneIsReleaseEvidence: false,
    });
    expect(report.requiredCommandResults.map((entry) => entry.command)).toEqual([
      "pnpm run production-scale:evidence",
      "pnpm run production-scale:promotion-pack",
      "pnpm run operator:dashboard",
      "pnpm run typecheck",
      "git diff --check",
    ]);
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
