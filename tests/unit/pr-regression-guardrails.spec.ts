import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildPrGuardrailsEvidence,
  CRITICAL_PR_GUARDRAIL_COMMANDS,
  HEAVY_PRE_PROMOTION_COMMANDS,
  validatePrGuardrails,
} from "../../scripts/pr-guardrails-evidence.mjs";

const STATIC_WORKFLOW_TEST_TIMEOUT_MS = 60_000;

const workflowSource = (name: string) =>
  readFileSync(join(process.cwd(), ".github", "workflows", name), "utf8");

describe("PR regression guardrail workflow", () => {
  it("keeps the fast golden path and includes the compliance-critical PR guardrail commands", () => {
    const report = buildPrGuardrailsEvidence({ rootDir: process.cwd(), generatedAt: "2026-05-21T12:00:00.000Z" });
    const prWorkflow = report.workflows.find((workflow: { path: string }) =>
      workflow.path.endsWith("pr-regression-guardrails.yml"),
    );

    expect(prWorkflow?.name).toBe("PR regression guardrails");
    expect(prWorkflow?.jobs).toEqual(expect.arrayContaining(["golden-path", "compliance-critical"]));
    expect(prWorkflow?.commands).toEqual(
      expect.arrayContaining([
        "pnpm run test:golden-path",
        ...CRITICAL_PR_GUARDRAIL_COMMANDS,
      ]),
    );
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);

  it("keeps heavier checks scheduled or manually dispatchable and in the production promotion workflow", () => {
    const report = buildPrGuardrailsEvidence({ rootDir: process.cwd(), generatedAt: "2026-05-21T12:00:00.000Z" });
    const prWorkflow = report.workflows.find((workflow: { path: string }) =>
      workflow.path.endsWith("pr-regression-guardrails.yml"),
    );
    const productionWorkflow = report.workflows.find((workflow: { path: string }) =>
      workflow.path.endsWith("deploy-production.yml"),
    );

    expect(prWorkflow?.triggers).toMatchObject({
      workflowDispatch: true,
      schedule: true,
    });
    expect(prWorkflow?.jobs).toContain("pre-promotion-automated");
    expect(prWorkflow?.commands).toEqual(expect.arrayContaining(HEAVY_PRE_PROMOTION_COMMANDS));
    expect(productionWorkflow?.commands).toEqual(
      expect.arrayContaining([
        ...CRITICAL_PR_GUARDRAIL_COMMANDS,
        ...HEAVY_PRE_PROMOTION_COMMANDS,
      ]),
    );
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);

  it("does not require manual UI interaction for guardrail commands", () => {
    const report = buildPrGuardrailsEvidence({ rootDir: process.cwd(), generatedAt: "2026-05-21T12:00:00.000Z" });

    expect(report.noManualUiInteractionRequired).toBe(true);
    expect([
      report.fastGoldenPathCommand,
      ...report.criticalPrGuardrailCommands,
      ...report.heavyPrePromotionCommands,
    ]).not.toEqual(expect.arrayContaining([expect.stringMatching(/manual|playwright|test:e2e|smoke:[^\s]*ui/i)]));
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);

  it("parses workflow structure and shell run blocks cleanly", () => {
    const validation = validatePrGuardrails({
      prWorkflowText: workflowSource("pr-regression-guardrails.yml"),
      productionWorkflowText: workflowSource("deploy-production.yml"),
    });

    expect(validation.status).toBe("passed");
    expect(validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "PR workflow run blocks pass bash syntax", status: "passed" }),
        expect.objectContaining({ name: "production workflow run blocks pass bash syntax", status: "passed" }),
      ]),
    );
  }, STATIC_WORKFLOW_TEST_TIMEOUT_MS);
});
