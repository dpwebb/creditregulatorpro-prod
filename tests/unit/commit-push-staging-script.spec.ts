import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = () => readFileSync(join(process.cwd(), "scripts", "commit-push-staging.mjs"), "utf8");

describe("staging commit-push script", () => {
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
});
