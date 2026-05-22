import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildAlertingAcceptanceReport,
  buildAlertingExclusionValidationReport,
  buildResponseOpsReadinessEvidenceReport,
  scanResponseOpsEvidenceSensitiveContent,
  validateAlertingExclusionEvidence,
  validateLiveAlertProofEvidence,
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
    machinePolicyAuthorityId: "ALERTING_POLICY_CONFIG_1",
    machineValidatedAt: "2026-05-20T12:00:00.000Z",
    environment: "limited beta production operations",
    exclusionScope: "External alert provider delivery for response operations",
    namedBlockerScope: "L10-P1-005 observability and alerting proof",
    noExternalAlertProviderUsed: true,
    exclusionReason: "Automated dashboard and soak controls are the configured operating path for this limited beta release.",
    compensatingControls: [
      "Daily dashboard machine check",
      "Response soak check before promotion decisions",
      "Configured escalation for dead-letter, stale-running, and dashboard SKIP regressions",
    ],
    automatedMonitoringCadence: "Daily dashboard check and immediate check after bounded response operations.",
    automatedEscalationPath: "Escalate through the internal incident channel using sanitized counts only.",
    acceptedRiskStatement: "The release governance owner accepts the residual risk of no external alert provider for this limited beta window.",
    reviewOrExpiryDate: "2026-08-20",
    expiresOn: "2026-08-20",
    nextReviewDate: "2026-06-20",
    policyConfigId: "alerting-exclusion-policy-2026-05",
    policyEffectiveAt: "2026-05-20T12:00:00.000Z",
    nonInteractive: true,
    machineAttested: true,
    humanObserved: false,
    manualApprovalRequired: false,
    policyAllowsFormalExclusion: true,
    noPiiNoSecretsNoWebhookUrls: true,
    dryRunNotLiveProofStatement: true,
    exclusionDoesNotMeanProductionAtScalePassUnlessPolicyAllows:
      "This exclusion does not mean production-at-scale PASS unless policy allows that limited alerting-exclusion scope.",
    dashboardCommand: "pnpm run operator:dashboard",
    soakCommand: "pnpm run response:soak-check",
    alertsDryRunCommand: "pnpm run alerts:dry-run",
    alertsDryRunEvidencePath: "docs/production-scale/evidence/latest-alerts-dry-run.json",
    liveAlertsSent: false,
    productionDataMutatedByCodex: false,
    sanitizedEvidenceStatement: "This evidence is sanitized and contains no PII, secrets, raw data, signed URLs, or credential URLs.",
  };
}

function acceptedLiveAlertProof() {
  return {
    evidenceId: "ALERT-LIVE-UNIT-001",
    evidenceType: "MACHINE_ATTESTED_LIVE_ALERT_DELIVERY",
    environment: "production",
    alertChannelId: "ops-alert-channel-opaque",
    alertTypeTested: "critical_ingest_queue_backlog",
    observedAt: "2026-05-20T12:00:00.000Z",
    deliverySuccess: true,
    liveAlertDeliveryVerified: true,
    nonInteractive: true,
    machineAttested: true,
    humanObserved: false,
    manualApprovalRequired: false,
    sanitizedEvidence: true,
    noSecretsOrWebhookUrls: true,
    noPii: true,
    correlationId: "alert-correlation-001",
    retryOrFailureBehavior: "No retry required; delivery acknowledgement received on first attempt.",
    productionDataMutatedByCodex: false,
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
    expect(report.alerting.acceptance.accepted).toBe(false);
    expect(report.alerting.acceptance.dryRunOnlyRejectedAsProductionProof).toBe(true);
  });

  it("accepts only machine-attested sanitized formal alert exclusion evidence", () => {
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
    expect(report.alerting.acceptance.acceptancePath).toBe("formal-exclusion");
    expect(report.blockerCoverage.observabilityAlerting).toBe(true);
  });

  it("rejects no submitted formal exclusion as alerting acceptance", () => {
    const report = buildAlertingAcceptanceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });

    expect(report.accepted).toBe(false);
    expect(report.alertingStatus).toBe("dry-run-only");
    expect(report.validation.errors.join("\n")).toMatch(/No accepted live alert proof or policy-allowed formal alerting exclusion exists/);
  });

  it("rejects stale formal alerting exclusions", () => {
    const validation = validateAlertingExclusionEvidence(
      {
        ...acceptedAlertingExclusionEvidence(),
        expiresOn: "2026-05-01",
        nextReviewDate: "2026-05-01",
      },
      { generatedAt: "2026-05-20T12:00:00.000Z" },
    );

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/stale/i);
  });

  it("rejects formal exclusions without explicit policy allowance", () => {
    const validation = validateAlertingExclusionEvidence(
      {
        ...acceptedAlertingExclusionEvidence(),
        policyAllowsFormalExclusion: false,
      },
      { generatedAt: "2026-05-20T12:00:00.000Z" },
    );

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/policyAllowsFormalExclusion must be true/);
  });

  it("accepts a valid formal exclusion only under explicitly allowed policy", () => {
    const report = buildAlertingAcceptanceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:00:00.000Z",
      alertingExclusionValidation: buildAlertingExclusionValidationReport({
        generatedAt: "2026-05-20T12:00:00.000Z",
        alertingExclusionEvidence: acceptedAlertingExclusionEvidence(),
      }),
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });

    expect(report.accepted).toBe(true);
    expect(report.acceptancePath).toBe("formal-exclusion");
    expect(report.productionProof).toBe(false);
  });

  it("accepts valid sanitized live alert proof", () => {
    const validation = validateLiveAlertProofEvidence(acceptedLiveAlertProof(), {
      generatedAt: "2026-05-20T12:05:00.000Z",
    });
    const report = buildAlertingAcceptanceReport({
      rootDir: process.cwd(),
      generatedAt: "2026-05-20T12:05:00.000Z",
      liveAlertProofEvidence: acceptedLiveAlertProof(),
      alertsDryRunEvidence: dryRunAlertEvidence(),
    });

    expect(validation.accepted).toBe(true);
    expect(report.accepted).toBe(true);
    expect(report.acceptancePath).toBe("live-alert-proof");
    expect(report.liveAlertProofAccepted).toBe(true);
  });

  it("rejects placeholder alert exclusion fields", () => {
    const validation = validateAlertingExclusionEvidence({
      ...acceptedAlertingExclusionEvidence(),
      machinePolicyAuthorityId: "TODO",
      automatedMonitoringCadence: "TBD",
      automatedEscalationPath: "N/A",
    });

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/machinePolicyAuthorityId|automatedMonitoringCadence|automatedEscalationPath/);
  });

  it("rejects incomplete alert exclusion evidence missing review or expiry date", () => {
    const validation = validateAlertingExclusionEvidence({
      ...acceptedAlertingExclusionEvidence(),
      reviewOrExpiryDate: "",
    });

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/reviewOrExpiryDate/);
  });

  it("rejects manual acknowledgement fields", () => {
    const validation = validateAlertingExclusionEvidence(
      {
        ...acceptedAlertingExclusionEvidence(),
        operatorAcknowledgementSigned: true,
      },
      { generatedAt: "2026-05-20T12:00:00.000Z" },
    );

    expect(validation.accepted).toBe(false);
    expect(validation.errors.join("\n")).toMatch(/legacy manual proof/);
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
      automatedEscalationPath:
        "Escalate with person@unsafe.test, Bearer abcdefghijklmnopqrstuvwxyz123456, postgres://user:pass@db.example/prod, raw report text: full report, https://storage.example/object?X-Amz-Signature=abc",
    };
    const validation = validateAlertingExclusionEvidence(evidence);

    expect(validation.accepted).toBe(false);
    expect(validation.sensitiveFindings).toEqual(
      expect.arrayContaining(["database-url", "bearer-token", "raw-response-or-report-text", "signed-url", "obvious-email-pii"]),
    );
    expect(scanResponseOpsEvidenceSensitiveContent(JSON.stringify(evidence)).length).toBeGreaterThan(0);
  });

  it("rejects secret-like webhook URLs", () => {
    const validation = validateLiveAlertProofEvidence(
      {
        ...acceptedLiveAlertProof(),
        alertChannelId: "https://hooks.slack.com/services/T000/B000/SECRET",
      },
      { generatedAt: "2026-05-20T12:05:00.000Z" },
    );

    expect(validation.accepted).toBe(false);
    expect(validation.sensitiveFindings).toContain("webhook-url");
  });

  it("keeps dashboard SKIP, SIMULATED, and MACHINE_REQUIRED rows visible", () => {
    const dashboard = buildOperatorDashboard({ runGit: fakeGit, fileExists: () => true });
    const semantics = buildDashboardReleaseEvidenceSemantics(dashboard.categories);
    const rendered = renderDashboard(dashboard);

    expect(semantics.skippedChecksVisible).toBe(true);
    expect(semantics.passImpliesSkippedChecksPassed).toBe(false);
    expect(rendered).toContain("[SKIP]");
    expect(rendered).toContain("[SIMULATED] Response external alert dry-run boundary");
    expect(rendered).toContain("[MACHINE_REQUIRED] Response scheduler activation conditions");
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
    expect(report.backfillReadiness.status).toBe("machine-controlled-deferred");
    expect(report.purgeArchiveReadiness.status).toBe("machine-controlled-deferred");
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
