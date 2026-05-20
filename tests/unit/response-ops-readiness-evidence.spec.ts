import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAlertingExclusionValidationReport,
  buildResponseOpsReadinessEvidenceReport,
  scanResponseOpsEvidenceSensitiveContent,
  validateAlertingExclusionEvidence,
} from "../../scripts/response-ops-readiness-evidence.mjs";
import {
  buildDashboardReleaseEvidenceSemantics,
  buildOperatorDashboard,
  renderDashboard,
} from "../../scripts/operator-regression-dashboard";

function dryRunAlertEvidence() {
  return {
    path: "docs/production-scale/evidence/latest-alerts-dry-run.json",
    exists: true,
    status: "present",
    evidenceType: "SIMULATED",
    deliveryMode: "DRY RUN",
    liveProof: false,
    liveExternalAlertsSent: 0,
    liveExternalProviderCallsMade: 0,
  };
}

function acceptedAlertingExclusionEvidence() {
  return {
    evidenceType: "FORMAL_ALERTING_EXCLUSION",
    operatorNameOrRole: "Compliance operations lead",
    acknowledgedAt: "2026-05-20T12:00:00.000Z",
    environment: "limited beta production operations",
    exclusionScope: "External alert provider delivery for response operations",
    noExternalAlertProviderUsed: true,
    exclusionReason: "Human monitoring is the approved operating path for this limited beta release.",
    humanMonitoringCadence: "Daily dashboard review and immediate review after supervised response operations.",
    manualEscalationPath: "Escalate through the internal incident channel using sanitized counts only.",
    acceptedRiskStatement: "The release governance owner accepts the residual risk of no external alert provider for this limited beta window.",
    reviewOrExpiryDate: "2026-08-20",
    dryRunNotLiveProofAcknowledgement: true,
    dashboardCommand: "pnpm run operator:dashboard",
    soakCommand: "pnpm run response:soak-check",
    alertsDryRunCommand: "pnpm run alerts:dry-run",
    alertsDryRunEvidencePath: "docs/production-scale/evidence/latest-alerts-dry-run.json",
    operatorAcknowledgementSigned: true,
    liveAlertsSent: false,
    productionDataMutatedByCodex: false,
    sanitizedEvidenceStatement: "This evidence is sanitized and contains no PII, secrets, raw data, signed URLs, or credential URLs.",
  };
}

function fakeGit(args: string[]) {
  const key = args.join(" ");
  if (key === "status --short") return "";
  if (key === "branch --show-current") return "staging";
  if (key === "rev-parse HEAD") return "b52ca35406e5a4c51c39efc515897a6a082da616";
  if (key === "log -1 --pretty=%s") return "Response ops readiness";
  return "";
}

describe("response ops readiness evidence", () => {
  it("shows dry-run-only alerts as not live proof", () => {
    const report = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });

    expect(report.alerting.status).toBe("dry-run-only");
    expect(report.alerting.dryRunEvidence).toMatchObject({
      evidenceType: "SIMULATED",
      deliveryMode: "DRY RUN",
      liveProof: false,
    });
    expect(report.alerting.dryRunOnlyIsLiveProof).toBe(false);
    expect(report.blockerCoverage.observabilityAlerting).toBe(false);
    expect(report.safety.liveAlertsSentByCodex).toBe(false);
  });

  it("accepts only signed sanitized formal alert exclusion evidence", () => {
    const validation = buildAlertingExclusionValidationReport({
      generatedAt: "2026-05-20T12:00:00.000Z",
      alertingExclusionEvidence: acceptedAlertingExclusionEvidence(),
    });
    const report = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      alertingExclusionValidation: validation,
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });

    expect(validation.accepted).toBe(true);
    expect(report.alerting.status).toBe("formally-excluded");
    expect(report.blockerCoverage.observabilityAlerting).toBe(true);
  });

  it("rejects placeholder alert exclusion fields", () => {
    const validation = validateAlertingExclusionEvidence({
      ...acceptedAlertingExclusionEvidence(),
      operatorNameOrRole: "TODO",
      humanMonitoringCadence: "TBD",
      manualEscalationPath: "N/A",
    });

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/operatorNameOrRole|humanMonitoringCadence|manualEscalationPath/);
  });

  it("rejects incomplete alert exclusion evidence missing review or expiry date", () => {
    const validation = validateAlertingExclusionEvidence({
      ...acceptedAlertingExclusionEvidence(),
      reviewOrExpiryDate: "",
    });

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/reviewOrExpiryDate/);
  });

  it("rejects alert exclusion evidence claiming dry-run equals live proof", () => {
    const validation = validateAlertingExclusionEvidence({
      ...acceptedAlertingExclusionEvidence(),
      dryRunEqualsLiveAlertProof: true,
    });

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/Dry-run evidence cannot be claimed as live alert delivery proof/);
  });

  it("rejects PII, secrets, raw report data, signed URLs, and database URLs in exclusion evidence", () => {
    const evidence = {
      ...acceptedAlertingExclusionEvidence(),
      manualEscalationPath:
        "Escalate with person@unsafe.test, Bearer abcdefghijklmnopqrstuvwxyz123456, postgres://user:pass@db.example/prod, raw report text: full report, https://storage.example/object?X-Amz-Signature=abc",
    };
    const validation = validateAlertingExclusionEvidence(evidence);

    expect(validation.accepted).toBe(false);
    expect(validation.sensitiveFindings).toEqual(
      expect.arrayContaining(["database-url", "bearer-token", "raw-response-or-report-text", "signed-url", "obvious-email-pii"]),
    );
    expect(scanResponseOpsEvidenceSensitiveContent(JSON.stringify(evidence)).length).toBeGreaterThan(0);
  });

  it("keeps dashboard SKIP, SIMULATED, and HUMAN_REQUIRED rows visible", () => {
    const dashboard = buildOperatorDashboard({ runGit: fakeGit, fileExists: () => true });
    const semantics = buildDashboardReleaseEvidenceSemantics(dashboard.categories);
    const rendered = renderDashboard(dashboard);

    expect(semantics.skippedChecksVisible).toBe(true);
    expect(semantics.passImpliesSkippedChecksPassed).toBe(false);
    expect(rendered).toContain("[SKIP]");
    expect(rendered).toContain("[SIMULATED] Response external alert dry-run boundary");
    expect(rendered).toContain("[HUMAN_REQUIRED] Response scheduler activation conditions");
  });

  it("records response queue semantics as unchanged and non-mutating", () => {
    const report = buildResponseOpsReadinessEvidenceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
      alertsDryRunEvidence: dryRunAlertEvidence(),
      dashboardEvidence: {
        available: true,
        command: "pnpm run operator:dashboard -- --json",
        exitCode: 0,
        skipCount: 55,
        checksSkipped: true,
        treatsSkipAsPass: false,
        summary: { skip: 55 },
        releaseEvidenceSemantics: {
          skippedChecksVisible: true,
          passImpliesSkippedChecksPassed: false,
          dashboardPassAloneIsReleaseEvidence: false,
        },
      },
    });

    expect(report.blockerCoverage.responseOperationsMaturity).toBe(true);
    expect(report.liveScheduler.status).toBe("disabled");
    expect(report.backfillReadiness.status).toBe("operator-controlled-deferred");
    expect(report.purgeArchiveReadiness.status).toBe("operator-controlled-deferred");
    expect(report.responseSoak.status).toBe("command-available");
    expect(report.dashboard).toMatchObject({
      status: "available",
      skipCount: 55,
      skippedChecksVisible: true,
      treatsSkipAsPass: false,
    });
    expect(report.safety.responseQueueSemanticsChanged).toBe(false);
    expect(report.safety.productionDataMutated).toBe(false);
    expect(report.safety.productionRecordsPurgedOrArchived).toBe(false);
    expect(report.requiredStatements).toContain("Response queue semantics were not changed.");
  });

  it("exposes the package commands", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

    expect(packageJson.scripts["alerts:exclusion:validate"]).toBe(
      "node scripts/response-ops-readiness-evidence.mjs --validate-alert-exclusion",
    );
    expect(packageJson.scripts["response-ops:readiness-evidence"]).toBe("node scripts/response-ops-readiness-evidence.mjs");
    expect(packageJson.scripts["response:ops-readiness-evidence"]).toBe("node scripts/response-ops-readiness-evidence.mjs");
  });
});
