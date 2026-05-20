import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildProductionDeploymentParityEvidenceReport,
  validateProductionDeploymentParityEvidenceReport,
  validateProductionDeployWorkflowParity,
  validateRuntimeProbeSafety,
} from "../../scripts/production-deployment-parity-evidence.mjs";

const generatedAt = "2026-05-20T12:00:00.000Z";

function workflowSource() {
  return readFileSync(join(process.cwd(), ".github", "workflows", "deploy-production.yml"), "utf8");
}

function acceptedProductionSafeProbeEvidence(overrides = {}) {
  return {
    status: "passed",
    startedAt: generatedAt,
    completedAt: generatedAt,
    targetHost: "staging.creditregulatorpro.com",
    planOnly: true,
    runtimeProbePlan: [
      {
        name: "app shell",
        path: "/",
        method: "HEAD",
        acceptedStatuses: [200],
        readOnly: true,
        mutationExpected: false,
      },
      {
        name: "login route",
        path: "/login",
        method: "GET",
        acceptedStatuses: [200],
        readOnly: true,
        mutationExpected: false,
      },
      {
        name: "auth session endpoint invalid session",
        path: "/_api/auth/session",
        method: "GET",
        acceptedStatuses: [401, 403],
        readOnly: true,
        mutationExpected: false,
      },
    ],
    publicChecks: [],
    protectedUnauthenticatedChecks: [],
    protectedInvalidSessionChecks: [],
    staticRejectionContracts: [{ name: "retired public route remains reset", status: "passed" }],
    safety: {
      staticContractsPassed: true,
      productionDataMutated: false,
      productionFixturesCreated: false,
      productionWorkerActivated: false,
      liveExternalProvidersConnected: false,
    },
    ...overrides,
  };
}

function acceptedOwnerDenialEvidence(overrides = {}) {
  return {
    reportName: "staging-owner-denial-smoke",
    generatedAt,
    status: "passed",
    productionProof: false,
    stagingOrLocalProofOnly: true,
    syntheticFixturesOnly: true,
    productionDataMutated: false,
    productionFixturesCreated: false,
    liveExternalProvidersConnected: false,
    summary: {
      totalChecks: 30,
      passedChecks: 30,
      failedChecks: 0,
      ownerBDeniedOwnerARecords: true,
      adminOnlyRoutesDeniedForNonAdmins: true,
    },
    ...overrides,
  };
}

describe("production deployment parity evidence", () => {
  it("refuses mutating production runtime probe methods", () => {
    const safety = validateRuntimeProbeSafety([
      { name: "unsafe mutation", method: "POST", path: "/_api/admin/seed", readOnly: false },
    ]);

    expect(safety.ok).toBe(false);
    expect(safety.unsafe).toEqual([
      expect.objectContaining({ name: "unsafe mutation", method: "POST" }),
    ]);

    const report = buildProductionDeploymentParityEvidenceReport({
      rootDir: process.cwd(),
      generatedAt,
      productionSafeProbeEvidence: acceptedProductionSafeProbeEvidence({
        runtimeProbePlan: [
          { name: "unsafe mutation", method: "POST", path: "/_api/admin/seed", acceptedStatuses: [401] },
        ],
      }),
      stagingOwnerDenialEvidence: acceptedOwnerDenialEvidence(),
    });

    expect(report.productionSafeProbeEvidence.accepted).toBe(false);
    expect(report.validation.ok).toBe(false);
    expect(report.validation.errors.join("\n")).toMatch(/production-safe probe evidence/i);
  });

  it("proves the production workflow runtime probes are read-only and include invalid-session denial", () => {
    const validation = validateProductionDeployWorkflowParity(workflowSource());

    expect(validation.status).toBe("passed");
    expect(validation.runtimeProbeSafety.ok).toBe(true);
    expect(validation.runtimeProbeSafety.methods).toEqual(["GET", "HEAD"]);
    expect(validation.invalidSessionDenialChecked).toBe(true);
    expect(validation.publicHealthReadinessChecked).toBe(true);
  });

  it("records rollback SHA and post-rollback health requirements", () => {
    const report = buildProductionDeploymentParityEvidenceReport({
      rootDir: process.cwd(),
      generatedAt,
      productionSafeProbeEvidence: acceptedProductionSafeProbeEvidence(),
      stagingOwnerDenialEvidence: acceptedOwnerDenialEvidence(),
    });

    expect(report.rollbackEvidence).toMatchObject({
      status: "passed",
      rollbackShaInputRequired: true,
      selectedRollbackShaDeployedAndVerified: true,
      healthCheckAfterRollbackRequired: true,
    });
    expect(validateProductionDeploymentParityEvidenceReport(report, { generatedAt })).toMatchObject({
      accepted: true,
      current: true,
      errors: [],
    });
  });

  it("keeps retired/reset public routes contract-protected without runtime production POSTs", () => {
    const report = buildProductionDeploymentParityEvidenceReport({
      rootDir: process.cwd(),
      generatedAt,
      productionSafeProbeEvidence: acceptedProductionSafeProbeEvidence(),
      stagingOwnerDenialEvidence: acceptedOwnerDenialEvidence(),
    });

    expect(report.staticUnsafePostSurfaceProof.status).toBe("passed");
    expect(report.staticUnsafePostSurfaceProof.unsafePostSurfaceStaticProofCount).toBeGreaterThan(0);
    expect(report.retiredPublicRouteContractProof.status).toBe("passed");
    expect(report.retiredPublicRouteContractProof.staticContractCount).toBeGreaterThan(0);
    expect(report.safety.staticProofTreatedAsRuntimeProductionProof).toBe(false);
  });

  it("keeps production worker default-off and records no production mutation", () => {
    const report = buildProductionDeploymentParityEvidenceReport({
      rootDir: process.cwd(),
      generatedAt,
      productionSafeProbeEvidence: acceptedProductionSafeProbeEvidence(),
      stagingOwnerDenialEvidence: acceptedOwnerDenialEvidence(),
    });

    expect(report.workflowValidation.productionWorkerDefaultOff).toBe(true);
    expect(report.safety.productionWorkerActivatedByCodex).toBe(false);
    expect(report.safety.productionJobsProcessedByCodex).toBe(false);
    expect(report.safety.productionFixturesCreatedByCodex).toBe(false);
    expect(report.safety.productionDataMutatedByCodex).toBe(false);
  });

  it("does not accept deployment parity without rollback evidence", () => {
    const report = buildProductionDeploymentParityEvidenceReport({
      rootDir: process.cwd(),
      generatedAt,
      workflowText: workflowSource().replace("rollback_sha:", "rollback_sha_removed:"),
      productionSafeProbeEvidence: acceptedProductionSafeProbeEvidence(),
      stagingOwnerDenialEvidence: acceptedOwnerDenialEvidence(),
    });

    expect(report.rollbackEvidence.status).toBe("failed");
    expect(report.blockerCoverage.productionDeploymentParity).toBe(false);
    expect(report.validation.ok).toBe(false);
  });
});
