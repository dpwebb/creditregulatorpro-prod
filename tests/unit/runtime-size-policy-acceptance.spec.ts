import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildRuntimeSizePolicyAcceptanceReport,
  parseRuntimeSizePolicyAcceptanceArgs,
  writeRuntimeSizePolicyAcceptanceOutputs,
} from "../../scripts/runtime-size-policy-acceptance.mjs";

const tempRoots: string[] = [];

function makeTempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-runtime-size-policy-acceptance-"));
  tempRoots.push(root);
  return root;
}

function writeJson(rootDir: string, relativePath: string, value: unknown) {
  const target = path.join(rootDir, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function basePolicy(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    policyName: "fixture-runtime-size-policy",
    policyMode: "warning-only",
    evidenceMode: "reporting-only",
    formalWaiver: {
      accepted: true,
      reason: "Fixture warning-only waiver.",
      approvedByRole: "Release owner",
      acceptedAt: "2026-05-20T12:00:00.000Z",
      expiresOn: "2026-08-20",
      acceptedRiskStatement: "Fixture warning-only runtime-size risk is accepted for test governance only.",
    },
    thresholds: [
      {
        id: "fixture-js-raw",
        area: "frontend-js",
        label: "Fixture JS raw",
        metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
        warnBytes: 10,
        failBytes: 20,
        failOnExceed: false,
        remediation: {
          ownerRole: "Frontend owner",
          targetDate: "2026-08-20",
          plan: "Review fixture JS size separately.",
        },
      },
      {
        id: "fixture-docker",
        area: "docker-runtime",
        label: "Fixture Docker OCR inventory",
        metric: { kind: "dockerOcrRuntimePackageInventory" },
        failOnExceed: false,
        waiver: {
          accepted: true,
          reason: "Docker fixture package byte size is not measurable from source-only reporting.",
          ownerRole: "PDF/OCR owner",
          reviewDate: "2026-08-20",
          acceptedRiskStatement: "Fixture Docker byte-size risk is accepted because source-only package names are inventoried.",
        },
      },
    ],
    ...overrides,
  };
}

function baseRuntimeEvidence(overrides: Record<string, unknown> = {}) {
  const generatedAt = new Date().toISOString();
  return {
    report: "runtime-size-and-dependency-report",
    generatedAt,
    commit: "a".repeat(40),
    workingTreeClean: true,
    safety: {
      reportingOnly: true,
      nonBlocking: true,
      changesDependencyVersions: false,
      changesBuildChunking: false,
      changesPdfOcrBehavior: false,
      buildFailsOnThresholds: false,
    },
    buildAssets: {
      distPresent: true,
      assetCount: 1,
      largestJsAsset: {
        path: "dist/_assets/app.js",
        rawBytes: 120,
        gzipBytes: 40,
      },
      largestCssAsset: null,
    },
    thresholdEvaluation: {
      policyName: "fixture-runtime-size-policy",
      policyMode: "warning-only",
      evidenceMode: "reporting-only",
      overallStatus: "WARN",
      hasBlockingFailures: false,
      statusCounts: {
        WARN: 1,
        WAIVED: 1,
      },
      evaluations: [
        {
          id: "fixture-js-raw",
          area: "frontend-js",
          label: "Fixture JS raw",
          status: "WARN",
          measuredBytes: 120,
          measuredValueAvailable: true,
          source: "dist/_assets/app.js",
          warnBytes: 10,
          failBytes: 20,
          failOnExceed: false,
          waiverReason: null,
          reason: "Metric exceeds the configured failBytes value, but this policy is warning-only for this threshold.",
        },
        {
          id: "fixture-docker",
          area: "docker-runtime",
          label: "Fixture Docker OCR inventory",
          status: "WAIVED",
          measuredBytes: null,
          measuredValueAvailable: true,
          source: "Dockerfile",
          warnBytes: null,
          failBytes: null,
          failOnExceed: false,
          waiverReason: "Docker fixture package byte size is not measurable from source-only reporting.",
          reason: "Docker fixture package byte size is not measurable from source-only reporting.",
        },
      ],
    },
    ...overrides,
  };
}

function writePolicyAndEvidence(rootDir: string, policy: unknown, evidence: unknown) {
  writeJson(rootDir, "docs/production-scale/runtime-size-threshold-policy.json", policy);
  writeJson(rootDir, "docs/production-scale/evidence/latest-runtime-size.json", evidence);
}

function fixturePackageJson(overrides: Record<string, unknown> = {}) {
  return {
    dependencies: {
      react: "19.2.1",
      "pdf-parse": "1.1.4",
    },
    devDependencies: {
      vitest: "4.1.5",
    },
    optionalDependencies: {},
    peerDependencies: {},
    ...overrides,
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime-size policy acceptance", () => {
  it("parses the acceptance command options", () => {
    expect(parseRuntimeSizePolicyAcceptanceArgs([])).toMatchObject({
      policyPath: "docs/production-scale/runtime-size-threshold-policy.json",
      evidencePath: "docs/production-scale/evidence/latest-runtime-size.json",
      maxEvidenceAgeHours: 24,
      json: false,
    });
    expect(parseRuntimeSizePolicyAcceptanceArgs([
      "--json",
      "--release-evidence",
      "--policy",
      "policy.json",
      "--evidence",
      "evidence.json",
      "--max-age-hours",
      "48",
      "--dependency-baseline-ref",
      "abc123",
    ])).toMatchObject({
      json: true,
      releaseEvidenceMode: true,
      policyPath: "policy.json",
      evidencePath: "evidence.json",
      maxEvidenceAgeHours: 48,
      dependencyBaselineRef: "abc123",
    });
    expect(() => parseRuntimeSizePolicyAcceptanceArgs(["--unknown"])).toThrow(/Unknown option/i);
  });

  it("fails warning-only mode when warnings lack waiver or remediation governance", () => {
    const rootDir = makeTempRoot();
    const policy = basePolicy({
      formalWaiver: {
        accepted: false,
      },
      thresholds: [
        {
          id: "fixture-js-raw",
          area: "frontend-js",
          label: "Fixture JS raw",
          metric: { kind: "largestBuildAsset", assetType: "js", field: "rawBytes" },
          warnBytes: 10,
          failBytes: 20,
          failOnExceed: false,
        },
      ],
    });
    writePolicyAndEvidence(rootDir, policy, {
      ...baseRuntimeEvidence(),
      thresholdEvaluation: {
        ...baseRuntimeEvidence().thresholdEvaluation,
        statusCounts: { WARN: 1 },
        evaluations: [baseRuntimeEvidence().thresholdEvaluation.evaluations[0]],
      },
    });

    const report = buildRuntimeSizePolicyAcceptanceReport({ rootDir });

    expect(report.accepted).toBe(false);
    expect(report.status).toBe("failed");
    expect(report.validation.errors.join("\n")).toMatch(/WARN row fixture-js-raw|formal waiver/i);
  });

  it("accepts warning-only mode as a waiver, not a fixed hard gate", () => {
    const rootDir = makeTempRoot();
    writePolicyAndEvidence(rootDir, basePolicy(), baseRuntimeEvidence());

    const report = buildRuntimeSizePolicyAcceptanceReport({ rootDir });
    const outputs = writeRuntimeSizePolicyAcceptanceOutputs(report, { rootDir });

    expect(report).toMatchObject({
      accepted: true,
      status: "accepted-warning-only-waiver",
      acceptanceKind: "warning-only-waiver",
      policyMode: "warning-only",
      blockerCoverage: {
        runtimeSizeGovernance: true,
        acceptedHardGate: false,
        acceptedWarningOnlyWaiver: true,
      },
      safety: {
        dependencyVersionsChanged: false,
        buildChunkingChanged: false,
        pdfOcrBehaviorChanged: false,
      },
    });
    expect(existsSync(path.join(rootDir, outputs.markdownPath))).toBe(true);
    expect(existsSync(path.join(rootDir, outputs.jsonPath))).toBe(true);
  });

  it("fails release evidence mode when no explicit dependency baseline is provided", () => {
    const rootDir = makeTempRoot();
    writePolicyAndEvidence(rootDir, basePolicy(), baseRuntimeEvidence());
    writeJson(rootDir, "package.json", fixturePackageJson());

    const report = buildRuntimeSizePolicyAcceptanceReport({
      rootDir,
      releaseEvidenceMode: true,
    });

    expect(report.accepted).toBe(false);
    expect(report.dependencyVersionChangeStatus).toMatchObject({
      determinable: false,
      releaseEvidenceMode: true,
      baselineSource: {
        type: "missing-explicit-baseline",
      },
    });
    expect(report.validation.errors.join("\n")).toMatch(/RUNTIME_SIZE_BASELINE_REF|RUNTIME_SIZE_DEPENDENCY_BASELINE_PATH/i);
  });

  it("accepts release evidence mode when dependencies match an explicit package snapshot baseline", () => {
    const rootDir = makeTempRoot();
    const packageJson = fixturePackageJson();
    writePolicyAndEvidence(rootDir, basePolicy(), baseRuntimeEvidence());
    writeJson(rootDir, "package.json", packageJson);
    writeJson(rootDir, "docs/production-scale/evidence/runtime-size-dependency-baseline-package.json", packageJson);

    const report = buildRuntimeSizePolicyAcceptanceReport({
      rootDir,
      releaseEvidenceMode: true,
      dependencyBaselinePackageJsonPath: "docs/production-scale/evidence/runtime-size-dependency-baseline-package.json",
    });

    expect(report.accepted).toBe(true);
    expect(report.dependencyVersionChangeStatus).toMatchObject({
      determinable: true,
      changed: false,
      releaseEvidenceMode: true,
      baselineSource: {
        type: "package-json-file",
        value: "docs/production-scale/evidence/runtime-size-dependency-baseline-package.json",
      },
      added: [],
      removed: [],
      changedVersions: [],
    });
  });

  it("reports added, removed, and changed dependency versions against the explicit baseline", () => {
    const rootDir = makeTempRoot();
    writePolicyAndEvidence(rootDir, basePolicy(), baseRuntimeEvidence());
    writeJson(rootDir, "package.json", fixturePackageJson({
      dependencies: {
        react: "19.2.2",
        zod: "3.25.76",
      },
      devDependencies: {},
      optionalDependencies: {
        sharp: "0.33.0",
      },
      peerDependencies: {},
    }));
    writeJson(rootDir, "dependency-baseline-package.json", fixturePackageJson({
      dependencies: {
        react: "19.2.1",
        "pdf-parse": "1.1.4",
      },
      devDependencies: {
        vitest: "4.1.5",
      },
      optionalDependencies: {},
      peerDependencies: {},
    }));

    const report = buildRuntimeSizePolicyAcceptanceReport({
      rootDir,
      releaseEvidenceMode: true,
      dependencyBaselinePackageJsonPath: "dependency-baseline-package.json",
    });

    expect(report.accepted).toBe(false);
    expect(report.dependencyVersionChangeStatus.added).toEqual(expect.arrayContaining([
      { field: "dependencies", name: "zod", currentVersion: "3.25.76" },
      { field: "optionalDependencies", name: "sharp", currentVersion: "0.33.0" },
    ]));
    expect(report.dependencyVersionChangeStatus.removed).toEqual(expect.arrayContaining([
      { field: "dependencies", name: "pdf-parse", baselineVersion: "1.1.4" },
      { field: "devDependencies", name: "vitest", baselineVersion: "4.1.5" },
    ]));
    expect(report.dependencyVersionChangeStatus.changedVersions).toEqual([
      {
        field: "dependencies",
        name: "react",
        baselineVersion: "19.2.1",
        currentVersion: "19.2.2",
      },
    ]);
    expect(report.validation.errors.join("\n")).toMatch(/Dependency version declarations changed relative to the explicit runtime-size baseline/i);
  });

  it("fails hard-gate mode when thresholds are exceeded", () => {
    const rootDir = makeTempRoot();
    const policy = basePolicy({
      policyMode: "hard-gate",
      formalWaiver: undefined,
      thresholds: [
        {
          ...basePolicy().thresholds[0],
          failOnExceed: true,
        },
      ],
    });
    const evidence = baseRuntimeEvidence({
      safety: {
        ...baseRuntimeEvidence().safety,
        buildFailsOnThresholds: true,
      },
      thresholdEvaluation: {
        ...baseRuntimeEvidence().thresholdEvaluation,
        policyMode: "hard-gate",
        overallStatus: "FAIL",
        hasBlockingFailures: true,
        statusCounts: { FAIL: 1 },
        evaluations: [
          {
            ...baseRuntimeEvidence().thresholdEvaluation.evaluations[0],
            status: "FAIL",
            failOnExceed: true,
          },
        ],
      },
    });
    writePolicyAndEvidence(rootDir, policy, evidence);

    const report = buildRuntimeSizePolicyAcceptanceReport({ rootDir });

    expect(report.accepted).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/Release-blocking runtime-size policy cannot be accepted/i);
  });

  it("fails release-blocking mode when thresholds are exceeded", () => {
    const rootDir = makeTempRoot();
    const policy = basePolicy({
      policyMode: "release-blocking",
      formalWaiver: undefined,
      thresholds: [
        {
          ...basePolicy().thresholds[0],
          failOnExceed: true,
        },
      ],
    });
    const evidence = baseRuntimeEvidence({
      safety: {
        ...baseRuntimeEvidence().safety,
        buildFailsOnThresholds: true,
      },
      thresholdEvaluation: {
        ...baseRuntimeEvidence().thresholdEvaluation,
        policyMode: "release-blocking",
        overallStatus: "FAIL",
        hasBlockingFailures: true,
        statusCounts: { FAIL: 1 },
        evaluations: [
          {
            ...baseRuntimeEvidence().thresholdEvaluation.evaluations[0],
            status: "FAIL",
            failOnExceed: true,
          },
        ],
      },
    });
    writePolicyAndEvidence(rootDir, policy, evidence);

    const report = buildRuntimeSizePolicyAcceptanceReport({ rootDir });

    expect(report.accepted).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/Release-blocking runtime-size policy cannot be accepted/i);
  });

  it("fails waived rows without owner, review date, and accepted-risk statement", () => {
    const rootDir = makeTempRoot();
    const policy = basePolicy({
      thresholds: [
        basePolicy().thresholds[0],
        {
          ...basePolicy().thresholds[1],
          waiver: {
            accepted: true,
            reason: "Incomplete fixture waiver.",
          },
        },
      ],
    });
    writePolicyAndEvidence(rootDir, policy, baseRuntimeEvidence());

    const report = buildRuntimeSizePolicyAcceptanceReport({ rootDir });

    expect(report.accepted).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/WAIVED row fixture-docker must include reason, owner, review\/expiry date, and accepted-risk statement/i);
  });

  it("requires waiver reason, owner, and review date in waived mode", () => {
    const rootDir = makeTempRoot();
    const policy = basePolicy({
      policyMode: "waived",
      formalWaiver: {
        accepted: true,
        reason: "Fixture top-level waiver.",
      },
    });
    const evidence = baseRuntimeEvidence({
      thresholdEvaluation: {
        ...baseRuntimeEvidence().thresholdEvaluation,
        policyMode: "waived",
      },
    });
    writePolicyAndEvidence(rootDir, policy, evidence);

    const report = buildRuntimeSizePolicyAcceptanceReport({ rootDir });

    expect(report.accepted).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/waived runtime-size policy requires accepted formal waiver evidence/i);
  });

  it("does not change dependency versions", () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.dependencies).toMatchObject({
      "pdf-parse": "1.1.4",
      "pdfjs-dist": "4.2.67",
      pdfmake: "0.2.21",
    });
    expect(packageJson.scripts["runtime-size:policy-acceptance"]).toBe("node scripts/runtime-size-policy-acceptance.mjs");
  });
});
