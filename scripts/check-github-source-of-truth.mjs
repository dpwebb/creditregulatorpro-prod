import { execFileSync } from "node:child_process";

function runGit(args, options = {}) {
  const output = execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });

  return typeof output === "string" ? output.trim() : "";
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function extractStatusPath(statusLine) {
  const statusPayload = statusLine.slice(3).trim();
  const renameSeparator = " -> ";
  const candidatePath = statusPayload.includes(renameSeparator)
    ? statusPayload.split(renameSeparator).at(-1)
    : statusPayload;
  return candidatePath.replace(/^"|"$/g, "");
}

function isOperationalArtifactStatus(statusLine) {
  const normalizedPath = extractStatusPath(statusLine).replace(/\\/g, "/");
  return normalizedPath === ".local" || normalizedPath.startsWith(".local/");
}

try {
  runGit(["rev-parse", "--is-inside-work-tree"]);
} catch {
  fail("current directory is not a git repository");
}

const branch = runGit(["branch", "--show-current"]);
if (!branch) {
  fail("repository is in detached HEAD state");
}

let upstream = "";
try {
  upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
} catch {
  fail(`branch '${branch}' has no upstream configured`);
}

const remote = upstream.split("/")[0];

console.log(`Branch: ${branch}`);
console.log(`Upstream: ${upstream}`);
console.log(`Fetching latest state from ${remote}...`);
runGit(["fetch", "--prune", remote], { stdio: "inherit" });

const status = runGit(["status", "--porcelain", "--untracked-files=all"]);
const statusLines = status ? status.split(/\r?\n/).filter(Boolean) : [];
const blockingStatusLines = statusLines.filter((line) => !isOperationalArtifactStatus(line));
if (blockingStatusLines.length > 0) {
  console.log(blockingStatusLines.join("\n"));
  fail("working tree has uncommitted changes");
}

const localHead = runGit(["rev-parse", "HEAD"]);
const upstreamHead = runGit(["rev-parse", upstream]);
const mergeBase = runGit(["merge-base", "HEAD", upstream]);

if (localHead === upstreamHead) {
  console.log(`OK: local HEAD matches ${upstream}`);
  process.exit(0);
}

if (localHead === mergeBase) {
  fail(`local branch is behind ${upstream}; pull the GitHub state before deploying`);
}

if (upstreamHead === mergeBase) {
  fail(`local branch is ahead of ${upstream}; push commits to GitHub before deploying`);
}

fail(`local branch has diverged from ${upstream}; reconcile with GitHub before deploying`);
