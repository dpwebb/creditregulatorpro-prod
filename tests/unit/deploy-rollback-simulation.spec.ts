import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEPLOY_ROLLBACK_SIMULATION_JSON_PATH,
  DEPLOY_ROLLBACK_SIMULATION_MD_PATH,
  bashSyntaxCheckWorkflowRunBlocks,
  buildDeployRollbackSimulationReport,
  simulateDeployRollbackScenario,
  validateDeployRollbackWorkflowSafety,
  writeDeployRollbackSimulationEvidence,
} from "../../scripts/deploy-rollback-simulation.mjs";

const STATIC_WORKFLOW_TEST_TIMEOUT_MS = 60_000;

function workflowSource(name: "staging" | "production") {
  return readFileSync(join(process.cwd(), ".github", "workflows", `deploy-${name}.yml`), "utf8");
}

function tempRepoWithWorkflows() {
  const root = mkdtempSync(join(tmpdir(), "crp-deploy-rollback-"));
  const workflowRoot = join(root, ".github", "workflows");
  mkdirSync(workflowRoot, { recursive: true });
  return root;
}

describe("deploy rollback simulation", () => {
  it("keeps the new target when simulated target health passes", () => {
    const result = simulateDeployRollbackScenario({
      name: "target-health-pass",
      targetSha: "a".repeat(40),
      previousSha: "b".repeat(40),
      targetHealthPasses: true,
      rollbackApplyPasses: true,
      rollbackHealthPasses: true,
    });

    expect(result.finalSha).toBe(result.targetSha);
    expect(result.healthResult).toBe("passed");
    expect(result.rollbackAttempted).toBe(false);
    expect(result.CERTIFYING).toBe(false);
  });

  it("restores the previous target when simulated target health fails and rollback passes", () => {
    const result = simulateDeployRollbackScenario({
      name: "target-health-fail-rollback-pass",
      targetSha: "c".repeat(40),
      previousSha: "d".repeat(40),
      targetHealthPasses: false,
      rollbackApplyPasses: true,
      rollbackHealthPasses: true,
    });

    expect(result.finalSha).toBe(result.previousSha);
    expect(result.healthResult).toBe("failed");
    expect(result.rollbackAttempted).toBe(true);
    expect(result.rollbackSucceeded).toBe(true);
    expect(result.rollbackHealthResult).toBe("passed");
  });

  it("records CERTIFYING:false when simulated rollback fails", () => {
    const result = simulateDeployRollbackScenario({
      name: "target-health-fail-rollback-fail",
      targetSha: "e".repeat(40),
      previousSha: "f".repeat(40),
      targetHealthPasses: false,
      rollbackApplyPasses: false,
      rollbackHealthPasses: false,
    });

    expect(result.finalSha).toBe(result.targetSha);
    expect(result.rollbackAttempted).toBe(true);
    expect(result.rollbackSucceeded).toBe(false);
    expect(result.CERTIFYING).toBe(false);
    expect(result.accepted).toBe(false);
  });

  it("requires staging and production workflows to contain rollback handlers and evidence output", () => {
    const validation = validateDeployRollbackWorkflowSafety({
      stagingWorkflowText: workflowSource("staging"),
      productionWorkflowText: workflowSource("production"),
    });

    expect(validation.status).toBe("passed");
    expect(validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "staging has automatic rollback failure handler", passed: true }),
        expect.objectContaining({ name: "production has automatic rollback failure handler", passed: true }),
        expect.objectContaining({ name: "machine-readable rollback evidence is emitted", passed: true }),
        expect.objectContaining({ name: "rollback evidence writers avoid nested heredocs", passed: true }),
        expect.objectContaining({ name: "workflows preserve previous image IDs for restore fallback", passed: true }),
      ]),
    );
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);

  it("fails workflow validation if the rollback failure handler is removed", () => {
    const staging = workflowSource("staging").replace("restore_previous_staging_deploy()", "removed_staging_rollback()");
    const production = workflowSource("production").replace("restore_previous_production_deploy()", "removed_production_rollback()");
    const validation = validateDeployRollbackWorkflowSafety({
      stagingWorkflowText: staging,
      productionWorkflowText: production,
    });

    expect(validation.status).toBe("failed");
    expect(validation.failedChecks.map((check) => check.name).join("\n")).toMatch(/automatic rollback failure handler/i);
  });

  it("passes bash syntax for extracted workflow shell blocks", () => {
    expect(bashSyntaxCheckWorkflowRunBlocks(workflowSource("staging")).status).toBe("passed");
    expect(bashSyntaxCheckWorkflowRunBlocks(workflowSource("production")).status).toBe("passed");
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);

  it("writes evidence files with both pass and fail scenarios", () => {
    const root = tempRepoWithWorkflows();
    try {
      mkdirSync(join(root, ".github", "workflows"), { recursive: true });
      writeFileSync(join(root, ".github", "workflows", "deploy-staging.yml"), workflowSource("staging"));
      writeFileSync(join(root, ".github", "workflows", "deploy-production.yml"), workflowSource("production"));

      const report = buildDeployRollbackSimulationReport({
        rootDir: root,
        generatedAt: "2026-05-21T12:00:00.000Z",
      });
      writeDeployRollbackSimulationEvidence(report, { rootDir: root });

      const jsonPath = join(root, ...DEPLOY_ROLLBACK_SIMULATION_JSON_PATH.split("/"));
      const mdPath = join(root, ...DEPLOY_ROLLBACK_SIMULATION_MD_PATH.split("/"));
      const written = JSON.parse(readFileSync(jsonPath, "utf8"));

      expect(existsSync(jsonPath)).toBe(true);
      expect(existsSync(mdPath)).toBe(true);
      expect(written.status).toBe("passed");
      expect(written.CERTIFYING).toBe(true);
      expect(written.scenarios.find((scenario: { name: string }) => scenario.name === "target-health-fail-rollback-fail")?.CERTIFYING).toBe(false);
      expect(written.scenarios.some((scenario: { healthResult: string }) => scenario.healthResult === "passed")).toBe(true);
      expect(written.scenarios.some((scenario: { healthResult: string }) => scenario.healthResult === "failed")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);
});
