import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(join(process.cwd(), "scripts", "commit-push-staging.mjs"), "utf8");
const packageJson = () => JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

describe("staging commit-push script", () => {
  it("exposes fast default and full local gate package commands", () => {
    const scripts = packageJson().scripts;

    expect(scripts["commit-push"]).toBe("node scripts/commit-push-staging.mjs");
    expect(scripts["commit-push:quick"]).toBe("node scripts/commit-push-staging.mjs --local-gate fast");
    expect(scripts["commit-push:full"]).toBe("node scripts/commit-push-staging.mjs --local-gate full");
  });

  it("does not report completion until origin/staging and GitHub Actions are verified", () => {
    const script = source();

    expect(script).toContain("verifyRemoteBranchHead(pushedHead)");
    expect(script).toContain("verifyGithubActionsCompleted(pushedHead)");
    expect(script).toContain("commit-push completed after GitHub Actions verification.");
    expect(script).not.toContain("--skip-action-wait");
    expect(script).not.toContain("commit-push completed without GitHub Actions verification.");

    const completionIndex = script.indexOf("commit-push completed after GitHub Actions verification.");
    expect(script.indexOf("verifyRemoteBranchHead(pushedHead)")).toBeLessThan(completionIndex);
    expect(script.indexOf("verifyGithubActionsCompleted(pushedHead)")).toBeLessThan(completionIndex);
  });

  it("fails closed when GitHub Actions cannot be verified or report a failed conclusion", () => {
    const script = source();

    expect(script).toContain("GitHub Actions verification requires an authenticated gh CLI");
    expect(script).toContain("GitHub Actions failed for pushed commit");
    expect(script).toContain("timed out after");
    expect(script).toContain("waiting for any GitHub Actions run to appear");
  });

  it("defaults to a fast local gate before committing and keeps the full gate explicit", () => {
    const script = source();

    expect(script).toContain('let localGate = "fast";');
    expect(script).toContain("Running fast local quality gate (validate:fast)...");
    expect(script).toContain('runPnpmScript("validate:fast")');
    expect(script).toContain("Running changed-area local quality gate (validate:changed)...");
    expect(script).toContain('runPnpmScript("validate:changed")');
    expect(script).toContain("Running staging local quality gate (validate:staging)...");
    expect(script).toContain('runPnpmScript("validate:staging")');
    expect(script).toContain("Running full local quality gate (validate:release)...");
    expect(script).toContain('runPnpmScript("validate:release")');
    expect(script).toContain('arg === "--local-gate"');
    expect(script).toContain('arg === "--full-check"');

    const dryRunIndex = script.indexOf("if (dryRun) {");
    const gateIndex = script.indexOf("runLocalGate();");
    const commitIndex = script.indexOf('runGit(["commit", "-m", message]');
    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(dryRunIndex).toBeLessThan(gateIndex);
    expect(gateIndex).toBeLessThan(commitIndex);
  });

  it("keeps the no-local-check path explicit while still requiring GitHub verification", () => {
    const script = source();

    expect(script).toContain('arg === "--skip-checks"');
    expect(script).toContain('localGate = "none"');
    expect(script).toContain("Skipping local checks (--local-gate none). GitHub Actions verification remains required.");
    expect(script).toContain("verifyGithubActionsCompleted(pushedHead)");
  });

  it("keeps post-push local database refresh opt-in", () => {
    const script = source();

    expect(script).toContain("let refreshLocalAfterPush = false;");
    expect(script).toContain('arg === "--refresh-local-after-push"');
    expect(script).toContain('arg === "--skip-local-refresh"');
    expect(script).toContain('runPnpmScript("refresh:local-from-staging", ["--", "--confirm"])');

    const actionsIndex = script.indexOf("verifyGithubActionsCompleted(pushedHead)");
    const refreshIndex = script.indexOf("if (refreshLocalAfterPush) {");
    expect(actionsIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeLessThan(refreshIndex);
  });
});
