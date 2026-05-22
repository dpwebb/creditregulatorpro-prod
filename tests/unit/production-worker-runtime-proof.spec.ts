import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionWorkerRuntimeProofReport,
  DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH,
  PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH,
  redactProductionWorkerRuntimeText,
  renderProductionWorkerRuntimeProofMarkdown,
  validateProductionWorkerRuntimeCliSafety,
  validateProductionWorkerRuntimeProofEvidence,
} from "../../scripts/production-worker-runtime-proof.mjs";
import { buildProductionPromotionPackReport } from "../../scripts/production-promotion-pack.mjs";

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-worker-runtime-proof-"));
  mkdirSync(path.join(root, "docs", "production-scale", "evidence"), { recursive: true });
  writeFileSync(
    path.join(root, "docs", "production-scale", "evidence", "sanitized-worker-runtime-observation.md"),
    "# Sanitized worker runtime observation\n\nCounts only. No report data.\n",
    "utf8",
  );
  writeFileSync(path.join(root, "docker-compose.production.yml"), "services:\n  creditregulatorpro-ingest-worker:\n    restart: unless-stopped\n    command: while true; do pnpm run ingest:worker --apply; done\n", "utf8");
  writeFileSync(path.join(root, "docker-compose.yml"), "services:\n  creditregulatorpro-staging-ingest-worker:\n    restart: unless-stopped\n", "utf8");
  return root;
}

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    evidenceType: "PRODUCTION_WORKER_RUNTIME_PROOF",
    evidenceId: "PROD-WORKER-20260522-001",
    environment: "production",
    mode: "apply",
    dryRunOnly: false,
    operatorId: "OPS1",
    timestamp: "2026-05-22T12:00:00.000Z",
    workerId: "production-bounded-ingest-worker",
    source: "authenticated_ingest_process",
    maxJobs: 1,
    queueDepth: {
      before: {
        total: 1,
        queued: 1,
        running: 0,
        failed: 0,
        deadLettered: 0,
        staleRunning: 0,
      },
      after: {
        total: 0,
        queued: 0,
        running: 0,
        failed: 0,
        deadLettered: 0,
        staleRunning: 0,
      },
    },
    processedCount: 1,
    failedCount: 0,
    deadLetterCount: 0,
    staleCount: 0,
    workerExitCode: 0,
    productionGuard: {
      crpEnvProduction: true,
      applyGuardAcknowledged: true,
      oneShot: true,
      maxJobsMatched: true,
      operatorTokenPresent: true,
      sourceMatched: true,
      concurrencyOne: true,
      workerIdPresent: true,
    },
    workerLivenessCheck: {
      observed: true,
      status: "passed - worker exited after bounded run",
    },
    rollbackStopVerification: {
      verified: true,
      evidenceSummary: "bounded worker stopped and rollback/stop procedure verified",
    },
    operatorAcknowledgement: {
      signed: true,
      evidenceSummary: "operator attested sanitized runtime proof",
    },
    attestations: {
      noRawReportBytesPrinted: true,
      noPiiPrinted: true,
      noSecretsPrinted: true,
      noSignedUrlsPrinted: true,
      sanitizedForAudit: true,
    },
    evidenceAttachments: [
      "docs/production-scale/evidence/sanitized-worker-runtime-observation.md",
    ],
    ...overrides,
  };
}

function writeEvidence(root: string, evidence: Record<string, unknown>) {
  const absolute = path.join(root, ...DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH.split("/"));
  writeFileSync(absolute, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH;
}

describe("production worker runtime proof", () => {
  it("does not accept dry-run-only production evidence as production proof", () => {
    const root = makeRoot();
    const report = validateProductionWorkerRuntimeProofEvidence(
      validEvidence({ mode: "dry-run", dryRunOnly: true }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(false);
    expect(report.productionProof).toBe(false);
    expect(report.errors.join("\n")).toMatch(/Dry-run-only production worker evidence cannot be accepted/i);
  });

  it("fails when queue-depth before or after is missing", () => {
    const root = makeRoot();
    const base = validEvidence() as any;
    const report = validateProductionWorkerRuntimeProofEvidence(
      validEvidence({ queueDepth: { before: base.queueDepth.before } }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(false);
    expect(report.errors).toContain("queueDepth.after queue depth is required.");
  });

  it("fails when worker stop or rollback verification is missing", () => {
    const root = makeRoot();
    const report = validateProductionWorkerRuntimeProofEvidence(
      validEvidence({ rollbackStopVerification: { verified: false, evidenceSummary: "" } }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        "rollbackStopVerification.verified must be true.",
        "rollbackStopVerification.evidenceSummary is required.",
      ]),
    );
  });

  it("accepts a valid sanitized production runtime fixture", () => {
    const root = makeRoot();
    const evidencePath = writeEvidence(root, validEvidence());
    const report = buildProductionWorkerRuntimeProofReport({
      rootDir: root,
      evidencePath,
      generatedAt: "2026-05-22T12:05:00.000Z",
    });

    expect(report.status).toBe("accepted-production");
    expect(report.accepted).toBe(true);
    expect(report.productionProof).toBe(true);
    expect(report.stagingProof).toBe(false);
    expect(report.blockerCoverage).toEqual({
      productionIngestRuntime: true,
      productionWorkflowParityAndRollback: true,
    });
  });

  it("accepts staging worker evidence as staging proof only", () => {
    const root = makeRoot();
    const report = validateProductionWorkerRuntimeProofEvidence(
      validEvidence({
        environment: "staging",
        productionGuard: undefined,
      }),
      { rootDir: root, generatedAt: "2026-05-22T12:05:00.000Z" },
    );

    expect(report.accepted).toBe(true);
    expect(report.stagingProof).toBe(true);
    expect(report.productionProof).toBe(false);
    expect(report.blockerCoverage.productionIngestRuntime).toBe(false);
  });

  it("rejects and redacts sensitive values", () => {
    const root = makeRoot();
    const evidencePath = writeEvidence(
      root,
      validEvidence({
        operatorAcknowledgement: {
          signed: true,
          evidenceSummary: "operator saw consumer@example.org and password=super-secret-value",
        },
        workerLivenessCheck: {
          observed: true,
          status: "passed - postgres://user:password@example.invalid/db",
        },
      }),
    );
    const report = buildProductionWorkerRuntimeProofReport({
      rootDir: root,
      evidencePath,
      generatedAt: "2026-05-22T12:05:00.000Z",
    });
    const rendered = `${JSON.stringify(report)}\n${renderProductionWorkerRuntimeProofMarkdown(report)}`;

    expect(report.accepted).toBe(false);
    expect(report.validation.sensitiveFindings).toEqual(
      expect.arrayContaining(["database-url", "password-assignment", "obvious-email-pii"]),
    );
    expect(rendered).not.toContain("postgres://user:password@example.invalid/db");
    expect(rendered).not.toContain("consumer@example.org");
    expect(rendered).not.toContain("password=super-secret-value");
    expect(redactProductionWorkerRuntimeText("postgres://user:password@example.invalid/db")).toBe("[REDACTED_DATABASE_URL]");
  });

  it("blocks apply-mode report generation unless production guard env is present", () => {
    expect(validateProductionWorkerRuntimeCliSafety({ mode: "apply", maxJobs: 1, env: {} }).ok).toBe(false);
    expect(
      validateProductionWorkerRuntimeCliSafety({
        mode: "apply",
        maxJobs: 1,
        env: {
          CRP_ENV: "production",
          CRP_PRODUCTION_INGEST_WORKER_APPLY: "explicit-bounded-production-ingest-worker-apply",
          CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT: "true",
          CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS: "1",
          CRP_PRODUCTION_INGEST_WORKER_OPERATOR: "OPS1",
        },
      }).ok,
    ).toBe(true);
  });

  it("promotion pack keeps blocker 2 open until accepted production runtime proof exists", () => {
    const report = buildProductionPromotionPackReport({
      rootDir: process.cwd(),
      dashboardReport: {
        summary: { pass: 10, fail: 0, skip: 2, simulated: 3, humanRequired: 2 },
        releaseEvidenceSemantics: {
          exactCommandsRequired: true,
          dashboardPassAloneSufficient: false,
          skipTreatedAsPass: false,
        },
      },
      productionWorkerRuntimeProof: {
        reportName: "production-worker-runtime-proof",
        generatedAt: "2026-05-22T12:05:00.000Z",
        status: "dry-run-only",
        accepted: false,
        productionProof: false,
        stagingProof: false,
        currentOperationalProof: false,
        mode: "dry-run",
        dryRunOnly: true,
        evidencePath: DEFAULT_PRODUCTION_WORKER_RUNTIME_PROOF_SUBMISSION_JSON_PATH,
        validation: {
          ok: false,
          errors: ["dry-run only"],
          sensitiveFindings: [],
        },
        blockerCoverage: {
          productionIngestRuntime: false,
          productionWorkflowParityAndRollback: false,
        },
        safety: {
          productionJobsProcessedByCodex: false,
          productionDataMutatedByCodex: false,
          runsProductionApplyByDefault: false,
          acceptsDryRunAsProductionProof: false,
          acceptsDefaultOffActivationAsProductionProof: false,
        },
      },
      generatedAt: "2026-05-22T12:05:00.000Z",
      env: {},
    });
    const blocker2 = report.blockerClassifications.find((blocker: { number: number }) => blocker.number === 2);

    expect(blocker2?.classification).toBe("partial");
    expect(report.productionWorkerRuntimeProof).toMatchObject({
      accepted: false,
      productionProof: false,
      blockerCoverage: {
        productionIngestRuntime: false,
      },
    });
  });

  it("exposes runtime proof artifact paths", () => {
    expect(PRODUCTION_WORKER_RUNTIME_PROOF_JSON_PATH).toContain("latest-production-worker-runtime-proof.json");
    expect(PRODUCTION_WORKER_RUNTIME_PROOF_MD_PATH).toContain("latest-production-worker-runtime-proof.md");
    expect(PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_JSON_PATH).toContain("production-worker-runtime-proof-template.json");
    expect(PRODUCTION_WORKER_RUNTIME_PROOF_TEMPLATE_MD_PATH).toContain("production-worker-runtime-proof-template.md");
  });
});
