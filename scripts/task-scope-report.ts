import { execFileSync } from "node:child_process";

export type TaskLane = "design-only" | "implementation" | "smoke" | "docs/readiness";

export type ParsedGitStatus = {
  stagedFiles: string[];
  dirtyFiles: string[];
  untrackedFiles: string[];
};

export type TaskScopeReport = ParsedGitStatus & {
  branch: string;
  suggestedTaskLane: TaskLane;
  checklistReminder: string;
  addAllWarning: string;
};

function runGit(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

export function parseGitStatusPorcelain(status: string): ParsedGitStatus {
  const stagedFiles = new Set<string>();
  const dirtyFiles = new Set<string>();
  const untrackedFiles = new Set<string>();

  for (const rawLine of status.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const indexStatus = line.slice(0, 1);
    const worktreeStatus = line.slice(1, 2);
    const filePath = normalizePath(line.slice(3));
    if (!filePath) continue;

    if (indexStatus === "?" && worktreeStatus === "?") {
      untrackedFiles.add(filePath);
      dirtyFiles.add(filePath);
      continue;
    }

    if (indexStatus !== " " && indexStatus !== "?") stagedFiles.add(filePath);
    if (worktreeStatus !== " ") dirtyFiles.add(filePath);
  }

  return {
    stagedFiles: Array.from(stagedFiles).sort(),
    dirtyFiles: Array.from(dirtyFiles).sort(),
    untrackedFiles: Array.from(untrackedFiles).sort(),
  };
}

export function inferTaskLane(files: string[]): TaskLane {
  if (files.length === 0) return "design-only";

  const normalized = files.map(normalizePath);
  const onlyDocs = normalized.every((file) => file.startsWith("docs/") || file === "AGENTS.md");
  if (onlyDocs) return "docs/readiness";

  const hasSmoke = normalized.some((file) =>
    /(^scripts\/staging-.*smoke|smoke-script\.spec\.ts$|ui-smoke-script\.spec\.ts$|fixture-setup-script\.spec\.ts$)/.test(file),
  );
  if (hasSmoke) return "smoke";

  return "implementation";
}

export function buildTaskScopeReport(input: {
  branch: string;
  status: string;
}): TaskScopeReport {
  const parsed = parseGitStatusPorcelain(input.status);
  const allFiles = Array.from(new Set([...parsed.stagedFiles, ...parsed.dirtyFiles, ...parsed.untrackedFiles]));
  const suggestedTaskLane = inferTaskLane(allFiles);
  const dirtyCount = allFiles.length;

  return {
    branch: input.branch || "(detached)",
    ...parsed,
    suggestedTaskLane,
    checklistReminder:
      "Start with git status --short, identify the task lane, run the matching validation bundle, and stage exact files only.",
    addAllWarning:
      dirtyCount > 0
        ? "WARNING: git add -A would stage every dirty or untracked file; use explicit git add <path> commands only."
        : "WARNING: git add -A remains disallowed by policy; use explicit staging when changes exist.",
  };
}

export function formatTaskScopeReport(report: TaskScopeReport): string {
  const lines = [
    `Branch: ${report.branch}`,
    `Suggested task lane: ${report.suggestedTaskLane}`,
    `Staged files (${report.stagedFiles.length}):`,
    ...report.stagedFiles.map((file) => `  - ${file}`),
    `Dirty files (${report.dirtyFiles.length}):`,
    ...report.dirtyFiles.map((file) => `  - ${file}`),
    `Untracked files (${report.untrackedFiles.length}):`,
    ...report.untrackedFiles.map((file) => `  - ${file}`),
    `Checklist reminder: ${report.checklistReminder}`,
    report.addAllWarning,
  ];

  return lines.join("\n");
}

export function readCurrentTaskScopeReport(): TaskScopeReport {
  return buildTaskScopeReport({
    branch: runGit(["branch", "--show-current"]).trim(),
    status: runGit(["status", "--porcelain"]),
  });
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href;

if (isDirectRun) {
  console.log(formatTaskScopeReport(readCurrentTaskScopeReport()));
}
