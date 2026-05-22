import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRestoreEvidenceAcceptanceReport,
  DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH,
  renderRestoreEvidenceAcceptanceMarkdown,
  RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH,
  RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH,
  RESTORE_EVIDENCE_TEMPLATE_JSON_PATH,
  RESTORE_EVIDENCE_TEMPLATE_MD_PATH,
  validateRestoreEvidenceSubmission,
} from "../../scripts/restore-evidence-acceptance.mjs";
import { buildProductionPromotionPackReport } from "../../scripts/production-promotion-pack.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-restore-acceptance-"));
  mkdirSync(join(root, "docs/production-scale/evidence"), { recursive: true });
  writeFileSync(
    join(root, "docs/production-scale/evidence/sanitized-restore-observation.md"),
    "# Sanitized restore observation\n\nMetadata-only test attachment. No sensitive values.\n",
    "utf8",
  );
  return root;
}

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    evidenceId: "DR-20260522-001",
    environment: "production",
    restoreType: "archive restore",
    humanObserved: false,
    manualApprovalRequired: false,
    restoreCompleted: true,
    operatorId: "OPS1",
    timestamp: "2026-05-22T12:00:00.000Z",
    sourceBackupIdentifier: "sanitized-prod-backup-20260522",
    targetRestoreEnvironment: "sanitized production restore target",
    measuredRpo: {
      targetMinutes: 15,
      actualMinutes: 5,
      status: "passed",
    },
    measuredRto: {
      targetMinutes: 30,
      actualMinutes: 12,
      status: "passed",
    },
    postRestoreChecks: {
      authSession: {
        status: "passed",
        evidenceSummary: "auth/session lifecycle verified with sanitized metadata only",
      },
      packetPdfRetrieval: {
        status: "passed",
        evidenceSummary: "packet PDF retrieval verified without raw PDF bytes",
      },
      responseQueue: {
        status: "passed",
        evidenceSummary: "response queue and dead-letter visibility verified",
      },
      cleanupLifecycle: {
        status: "passed",
        evidenceSummary: "cleanup and lifecycle checks completed",
      },
      rollbackStopVerification: {
        status: "passed",
        evidenceSummary: "rollback or stop verification completed",
      },
    },
    attestations: {
      noRawReportBytesPrinted: true,
      noPiiPrinted: true,
      noSecretsPrinted: true,
      sanitizedForAudit: true,
    },
    evidenceAttachments: [
      "docs/production-scale/evidence/sanitized-restore-observation.md",
    ],
    ...overrides,
  };
}

function writeEvidence(root: string, evidence: Record<string, unknown>) {
  const evidencePath = DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH;
  writeFileSync(join(root, ...evidencePath.split("/")), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidencePath;
}

describe("restore evidence acceptance", () => {
  it("rejects simulated-only restore evidence", () => {
    const root = makeRoot();
    const report = validateRestoreEvidenceSubmission(
      validEvidence({
        evidenceType: "SIMULATED",
        simulatedOnly: true,
      }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(false);
    expect(report.productionProof).toBe(false);
    expect(report.errors.join("\n")).toMatch(/Simulated-only restore evidence cannot be accepted/i);
  });

  it("rejects checklist-only restore evidence for production", () => {
    const root = makeRoot();
    const report = validateRestoreEvidenceSubmission(
      validEvidence({
        checklistOnly: true,
        restoreCompleted: false,
      }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(false);
    expect(report.productionProof).toBe(false);
    expect(report.errors.join("\n")).toMatch(/Checklist-only restore evidence cannot be accepted/i);
    expect(report.errors.join("\n")).toMatch(/restoreCompleted must be true/i);
  });

  it("accepts a valid sanitized production fixture and records blocker coverage", () => {
    const root = makeRoot();
    const evidencePath = writeEvidence(root, validEvidence());
    const report = buildRestoreEvidenceAcceptanceReport({
      rootDir: root,
      evidencePath,
      generatedAt: "2026-05-22T12:05:00.000Z",
    });

    expect(report.status).toBe("accepted-production");
    expect(report.accepted).toBe(true);
    expect(report.productionProof).toBe(true);
    expect(report.stagingProof).toBe(false);
    expect(report.blockerCoverage).toEqual({
      disasterRecoveryRestoreDrill: true,
      retentionArchiveRestore: true,
    });
    expect(report.validation).toMatchObject({
      ok: true,
      errors: [],
      sensitiveFindings: [],
      evidenceKind: "sanitized-legacy",
    });
  });

  it("accepts staging evidence but does not count it as production proof", () => {
    const root = makeRoot();
    const report = validateRestoreEvidenceSubmission(
      validEvidence({
        environment: "staging",
      }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(true);
    expect(report.stagingProof).toBe(true);
    expect(report.productionProof).toBe(false);
    expect(report.blockerCoverage.disasterRecoveryRestoreDrill).toBe(false);
  });

  it("rejects and redacts secret-like values", () => {
    const root = makeRoot();
    const evidencePath = writeEvidence(
      root,
      validEvidence({
        sourceBackupIdentifier: "postgres://user:password@example.invalid:5432/app",
        postRestoreChecks: {
          ...validEvidence().postRestoreChecks,
          authSession: {
            status: "passed",
            evidenceSummary: "operator observed consumer@example.org and password=super-secret-value",
          },
        },
      }),
    );
    const report = buildRestoreEvidenceAcceptanceReport({
      rootDir: root,
      evidencePath,
      generatedAt: "2026-05-22T12:05:00.000Z",
    });
    const rendered = `${JSON.stringify(report)}\n${renderRestoreEvidenceAcceptanceMarkdown(report)}`;

    expect(report.accepted).toBe(false);
    expect(report.validation.sensitiveFindings).toEqual(
      expect.arrayContaining(["database-url", "database-url-with-credentials", "obvious-email-pii"]),
    );
    expect(rendered).not.toContain("postgres://user:password@example.invalid:5432/app");
    expect(rendered).not.toContain("consumer@example.org");
    expect(rendered).not.toContain("password=super-secret-value");
    expect(rendered).toContain("[REDACTED_DATABASE_URL]");
    expect(rendered).toContain("[REDACTED_EMAIL]");
  });

  it("fails when measured RPO/RTO are missing", () => {
    const root = makeRoot();
    const report = validateRestoreEvidenceSubmission(
      validEvidence({
        measuredRpo: null,
        measuredRto: undefined,
      }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        "measuredRpo must include targetMinutes, actualMinutes, and status.",
        "measuredRto must include targetMinutes, actualMinutes, and status.",
      ]),
    );
  });

  it("fails when packet PDF proof is missing", () => {
    const root = makeRoot();
    const evidence = validEvidence();
    delete (evidence.postRestoreChecks as Record<string, unknown>).packetPdfRetrieval;
    const report = validateRestoreEvidenceSubmission(evidence, {
      rootDir: root,
      generatedAt: "2026-05-22T12:05:00.000Z",
    });

    expect(report.accepted).toBe(false);
    expect(report.errors).toContain("postRestoreChecks.packetPdfRetrieval is required.");
  });

  it("keeps promotion-pack disaster recovery blocker machine-required until accepted machine proof exists", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: {
        summary: { pass: 10, fail: 0, skip: 2, simulated: 3, machineRequired: 2 },
        releaseEvidenceSemantics: {
          exactCommandsRequired: true,
          dashboardPassAloneSufficient: false,
          skipTreatedAsPass: false,
        },
      },
      restoreEvidenceAcceptance: {
        reportName: "restore-evidence-acceptance",
        generatedAt: "2026-05-22T12:05:00.000Z",
        status: "not-submitted",
        accepted: false,
        productionProof: false,
        stagingProof: false,
        currentOperationalProof: false,
        evidencePath: DEFAULT_RESTORE_EVIDENCE_SUBMISSION_JSON_PATH,
        validation: { ok: false, errors: ["not submitted"], sensitiveFindings: [], evidenceKind: "none" },
        blockerCoverage: {
          disasterRecoveryRestoreDrill: false,
          retentionArchiveRestore: false,
        },
        safety: {
          runsDump: false,
          runsRestore: false,
          modifiesProduction: false,
          acceptsSimulatedEvidenceAsProductionProof: false,
        },
      },
      generatedAt: "2026-05-22T12:05:00.000Z",
      env: {},
    });
    const blocker1 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 1);

    expect(blocker1?.classification).toBe("simulated proof only");
    expect(report.restoreEvidenceAcceptance).toMatchObject({
      accepted: false,
      productionProof: false,
      blockerCoverage: {
        disasterRecoveryRestoreDrill: false,
      },
    });
  });

  it("exposes template and acceptance artifact paths", () => {
    expect(resolve(RESTORE_EVIDENCE_TEMPLATE_JSON_PATH)).toContain("restore-evidence-template.json");
    expect(resolve(RESTORE_EVIDENCE_TEMPLATE_MD_PATH)).toContain("restore-evidence-template.md");
    expect(resolve(RESTORE_EVIDENCE_ACCEPTANCE_JSON_PATH)).toContain("latest-restore-acceptance.json");
    expect(resolve(RESTORE_EVIDENCE_ACCEPTANCE_MD_PATH)).toContain("latest-restore-acceptance.md");
  });
});
