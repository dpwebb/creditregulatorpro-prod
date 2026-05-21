import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bashSyntaxCheckWorkflowRunBlocks,
  buildRollbackShaGovernanceReport,
  extractWorkflowRunBlocks,
} from "../../scripts/deploy-rollback-sha-governance.mjs";

function workflowSource(name: "staging" | "production") {
  return readFileSync(join(process.cwd(), ".github", "workflows", `deploy-${name}.yml`), "utf8");
}

function reportWith(overrides: Partial<Record<"staging" | "production", string>> = {}) {
  return buildRollbackShaGovernanceReport({
    rootDir: process.cwd(),
    generatedAt: "2026-05-21T12:00:00.000Z",
    workflowTexts: {
      staging: overrides.staging ?? workflowSource("staging"),
      production: overrides.production ?? workflowSource("production"),
    },
  });
}

describe("rollback SHA governance workflow validation", () => {
  it("requires workflows to check out TARGET_SHA before validation", () => {
    const report = reportWith();

    expect(report.status).toBe("passed");
    expect(report.summary.resolveTargetBeforeValidation).toBe(true);
    expect(report.summary.validationCheckoutEqualsTarget).toBe(true);
    expect(report.workflows).toHaveLength(2);
  });

  it("fails static validation when rollback SHA validation is not strict 40-hex", () => {
    const staging = workflowSource("staging").replace(
      "grep -Eq '^[0-9a-fA-F]{40}$'",
      "grep -Eq '^[0-9a-fA-F]{7,40}$'",
    );
    const report = reportWith({ staging });

    expect(report.status).toBe("failed");
    expect(report.validation.errors.join("\n")).toMatch(/rollback_sha is strict 40-hex/i);
  });

  it("requires evidence target SHA checks to compare against the deploy target SHA", () => {
    const production = workflowSource("production").replace(
      'if [ "$evidence_target_sha" != "$TARGET_SHA" ]; then',
      'if [ "$evidence_target_sha" = "$TARGET_SHA" ]; then',
    );
    const report = reportWith({ production });

    expect(report.status).toBe("failed");
    expect(report.validation.errors.join("\n")).toMatch(/deploy evidence target SHA/i);
  });

  it("requires staging and production remote checkouts to verify HEAD equals TARGET_SHA", () => {
    const report = reportWith();

    expect(report.summary.remoteCheckoutEqualsTarget).toBe(true);
    for (const workflow of report.workflows) {
      expect(workflow.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "remote checkout verifies HEAD equals TARGET_SHA",
            passed: true,
          }),
        ]),
      );
    }
  });

  it("requires production compose to be passed explicitly rather than copied over the checkout", () => {
    const report = reportWith();
    const production = report.workflows.find((workflow) => workflow.workflow === "production");

    expect(report.summary.explicitProductionComposeFile).toBe(true);
    expect(production?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "production compose file is passed explicitly",
          passed: true,
        }),
      ]),
    );

    const copiedCompose = workflowSource("production").replace(
      "docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker",
      "cp docker-compose.production.yml docker-compose.yml\n            docker compose up -d --build creditregulatorpro creditregulatorpro-ingest-worker",
    );
    expect(reportWith({ production: copiedCompose }).status).toBe("failed");
  });

  it("extracts shell blocks and validates them with bash -n", () => {
    const staging = workflowSource("staging");
    const production = workflowSource("production");

    expect(extractWorkflowRunBlocks(staging).length).toBeGreaterThan(0);
    expect(extractWorkflowRunBlocks(production).length).toBeGreaterThan(0);
    expect(bashSyntaxCheckWorkflowRunBlocks(staging).status).toBe("passed");
    expect(bashSyntaxCheckWorkflowRunBlocks(production).status).toBe("passed");
    expect(reportWith().summary.shellBlocksBashSyntaxPassed).toBe(true);
  });
});
