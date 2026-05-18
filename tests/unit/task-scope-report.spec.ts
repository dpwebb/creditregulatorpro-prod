import { describe, expect, it } from "vitest";

import {
  buildTaskScopeReport,
  formatTaskScopeReport,
  inferTaskLane,
  parseGitStatusPorcelain,
} from "../../scripts/task-scope-report";

describe("task scope report", () => {
  it("parses staged, dirty, and untracked files from porcelain status", () => {
    const parsed = parseGitStatusPorcelain([
      "M  docs/future-build-plan.md",
      " M scripts/task-scope-report.ts",
      "?? tests/unit/task-scope-report.spec.ts",
    ].join("\n"));

    expect(parsed.stagedFiles).toEqual(["docs/future-build-plan.md"]);
    expect(parsed.dirtyFiles).toEqual([
      "scripts/task-scope-report.ts",
      "tests/unit/task-scope-report.spec.ts",
    ]);
    expect(parsed.untrackedFiles).toEqual(["tests/unit/task-scope-report.spec.ts"]);
  });

  it("infers task lanes from changed file paths", () => {
    expect(inferTaskLane([])).toBe("design-only");
    expect(inferTaskLane(["docs/future-build-plan.md"])).toBe("docs/readiness");
    expect(inferTaskLane(["scripts/staging-outcome-smoke.ts"])).toBe("smoke");
    expect(inferTaskLane(["endpoints/outcomes/get_GET.ts"])).toBe("implementation");
  });

  it("builds a warning against broad staging", () => {
    const report = buildTaskScopeReport({
      branch: "staging",
      status: " M package.json\n?? docs/internal/codex-prompt-templates.md\n",
    });

    expect(report.branch).toBe("staging");
    expect(report.dirtyFiles).toContain("package.json");
    expect(report.suggestedTaskLane).toBe("implementation");
    expect(report.addAllWarning).toMatch(/git add -A would stage every dirty or untracked file/i);
    expect(report.checklistReminder).toMatch(/stage exact files only/i);
  });

  it("formats the read-only report with required sections", () => {
    const output = formatTaskScopeReport(
      buildTaskScopeReport({
        branch: "staging",
        status: "M  docs/future-build-plan.md\n M package.json",
      }),
    );

    expect(output).toContain("Branch: staging");
    expect(output).toContain("Suggested task lane: implementation");
    expect(output).toContain("Staged files (1):");
    expect(output).toContain("Dirty files (1):");
    expect(output).toContain("Checklist reminder:");
    expect(output).toContain("WARNING:");
  });
});
