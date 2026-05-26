import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  adminClickThroughAvailable,
  buildValidationPlan,
  classifyChangedFiles,
} from "../../scripts/validation-tier.mjs";

const packageJson = () => JSON.parse(readFileSync("package.json", "utf8"));
const commands = (plan: ReturnType<typeof buildValidationPlan>) => plan.commands.map((entry) => entry.command ?? entry.note);

describe("tiered validation workflow", () => {
  it("exposes named validation tiers and keeps check as the release alias", () => {
    const scripts = packageJson().scripts;

    expect(scripts["validate:fast"]).toBe("node scripts/validation-tier.mjs fast");
    expect(scripts["validate:changed"]).toBe("node scripts/validation-tier.mjs changed");
    expect(scripts["validate:staging"]).toBe("node scripts/validation-tier.mjs staging");
    expect(scripts["validate:release"]).toBe("node scripts/validation-tier.mjs release");
    expect(scripts["certify:admin"]).toBe("node scripts/validation-tier.mjs admin --require-admin");
    expect(scripts.check).toBe("pnpm run validate:release");
  });

  it("keeps ordinary local validation fast for non-critical UI files", () => {
    const plan = buildValidationPlan({
      tier: "fast",
      changedFiles: ["components/Button.tsx"],
    });

    expect(plan.fullRegression).toBe(false);
    expect(commands(plan)).toContain("pnpm run typecheck");
    expect(commands(plan)).not.toContain("pnpm run test:golden-path");
    expect(commands(plan)).not.toContain("pnpm run test:unit:check");
  });

  it("requires full staging regression for parser, packet, auth, migration, and admin critical changes", () => {
    for (const file of [
      "helpers/deterministicCreditReportParser.ts",
      "helpers/disputePacketTemplate.ts",
      "helpers/accountFindingVisibility.ts",
      "migrations/0001-example.sql",
      "helpers/adminSidebarRoutes.ts",
    ]) {
      const classification = classifyChangedFiles([file]);
      expect(classification.fullRegressionRequired, file).toBe(true);
    }

    const plan = buildValidationPlan({
      tier: "staging",
      changedFiles: ["helpers/deterministicCreditReportParser.ts"],
    });

    expect(plan.fullRegression).toBe(true);
    expect(commands(plan)).toEqual(expect.arrayContaining([
      "pnpm lint",
      "pnpm run build",
      "pnpm run test:golden-path",
      "pnpm run test:unit:check",
      "pnpm run test:deterministic-ingestion-report",
      "pnpm run test:credit-regression",
    ]));
  });

  it("runs release baseline and safety gates once through the release tier", () => {
    const plan = buildValidationPlan({
      tier: "release",
      changedFiles: ["docs/validation-tiers.md"],
    });
    const commandList = commands(plan).filter((command): command is string => typeof command === "string");

    expect(commandList).toEqual(expect.arrayContaining([
      "pnpm lint",
      "pnpm run typecheck",
      "pnpm run build",
      "pnpm run test:golden-path",
      "pnpm run test:unit:check",
      "pnpm run migrations:gate",
      "pnpm run smoke:auth-workflow",
      "pnpm run smoke:auth-workflow:packet",
      "pnpm run production-scale:promotion-guard",
    ]));
    expect(commandList.length).toBe(new Set(commandList).size);
    expect(commandList).not.toContain("pnpm run test:api");
    expect(commandList).not.toContain("pnpm run test:contracts");
    expect(commandList).not.toContain("pnpm run test:evidence-ledger");
  });

  it("accepts the npm argument separator used by CI workflow commands", () => {
    const output = execFileSync(
      process.execPath,
      [
        "scripts/validation-tier.mjs",
        "staging",
        "--",
        "--dry-run",
        "--changed-file=docs/validation-tiers.md",
      ],
      { encoding: "utf8" },
    );

    expect(output).toContain("[validation] COMPLETE: staging validation passed.");
  });

  it("adds admin click-through only when release changes touch admin-critical surfaces", () => {
    const docsPlan = buildValidationPlan({ tier: "release", changedFiles: ["docs/validation-tiers.md"] });
    const adminPlan = buildValidationPlan({ tier: "release", changedFiles: ["pages/admin-security.tsx"] });

    expect(docsPlan.adminRequired).toBe(false);
    expect(commands(docsPlan)).not.toContain(
      "pnpm exec playwright test tests/e2e/admin-sidebar-routes.spec.ts tests/e2e/admin-security-functions.spec.ts",
    );
    expect(adminPlan.adminRequired).toBe(true);
    expect(commands(adminPlan)).toContain(
      "pnpm exec playwright test tests/e2e/admin-sidebar-routes.spec.ts tests/e2e/admin-security-functions.spec.ts",
    );
  });

  it("fails closed for required remote admin click-through when no admin credentials are available", () => {
    expect(adminClickThroughAvailable({
      E2E_BASE_URL: "https://staging.creditregulatorpro.com",
    })).toBe(false);
    expect(adminClickThroughAvailable({
      E2E_BASE_URL: "https://staging.creditregulatorpro.com",
      E2E_ADMIN_EMAIL: "admin@example.test",
      E2E_ADMIN_PASSWORD: "password",
    })).toBe(true);
    expect(adminClickThroughAvailable({})).toBe(true);
  });
});
