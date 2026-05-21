import { execFileSync } from "node:child_process";

const DEFAULT_BRANCH = "staging";
const DEFAULT_ACTION_TIMEOUT_SECONDS = 1800;
const DEFAULT_ACTION_POLL_SECONDS = 15;
const args = process.argv.slice(2);

let message = "";
let skipChecks = false;
let dryRun = false;
let refreshLocalAfterPush = true;
let actionTimeoutSeconds = DEFAULT_ACTION_TIMEOUT_SECONDS;
let actionPollSeconds = DEFAULT_ACTION_POLL_SECONDS;

function fail(reason) {
  console.error(`ERROR: ${reason}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const output = execFileSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function runGit(commandArgs, options = {}) {
  return run("git", commandArgs, options);
}

function quoteCmdArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${flagName} requires a positive integer`);
  }
  return parsed;
}

function parseGithubRepoFromOrigin(originUrl) {
  const match = String(originUrl ?? "").match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (!match) {
    fail(`could not resolve GitHub owner/repo from origin URL '${originUrl}'`);
  }
  return `${match[1]}/${match[2]}`;
}

function verifyRemoteBranchHead(expectedSha) {
  const remoteLine = runGit(["ls-remote", "origin", `refs/heads/${DEFAULT_BRANCH}`]);
  const remoteSha = remoteLine.split(/\s+/)[0] ?? "";
  if (remoteSha !== expectedSha) {
    fail(`origin/${DEFAULT_BRANCH} is ${remoteSha || "missing"}, expected pushed HEAD ${expectedSha}`);
  }
  console.log(`Verified origin/${DEFAULT_BRANCH} is at ${expectedSha}.`);
}

function assertGhAuthenticated() {
  try {
    run("gh", ["auth", "status", "--hostname", "github.com"]);
  } catch {
    fail("GitHub Actions verification requires an authenticated gh CLI. Push completion cannot be certified.");
  }
}

function listGithubRunsForCommit(repo, commitSha) {
  const raw = run("gh", [
    "run",
    "list",
    "--repo",
    repo,
    "--branch",
    DEFAULT_BRANCH,
    "--commit",
    commitSha,
    "--limit",
    "20",
    "--json",
    "databaseId,status,conclusion,name,workflowName,url,headSha",
  ]);
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`could not parse GitHub Actions run list: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function runLabel(runRecord) {
  return `${runRecord.workflowName || runRecord.name || runRecord.databaseId} (${runRecord.status}${
    runRecord.conclusion ? `/${runRecord.conclusion}` : ""
  })`;
}

function verifyGithubActionsCompleted(commitSha) {
  const repo = parseGithubRepoFromOrigin(runGit(["config", "--get", "remote.origin.url"]));
  assertGhAuthenticated();

  const deadlineMs = Date.now() + actionTimeoutSeconds * 1000;
  let firstRunSeen = false;

  console.log(`Waiting for GitHub Actions for ${repo}@${commitSha}...`);
  while (Date.now() <= deadlineMs) {
    const runs = listGithubRunsForCommit(repo, commitSha);
    if (runs.length === 0) {
      console.log("No GitHub Actions runs visible for pushed commit yet.");
      sleepSeconds(actionPollSeconds);
      continue;
    }

    firstRunSeen = true;
    const failedRuns = runs.filter((runRecord) =>
      runRecord.status === "completed" &&
      !["success", "skipped", "neutral"].includes(String(runRecord.conclusion ?? "").toLowerCase())
    );
    if (failedRuns.length > 0) {
      fail(`GitHub Actions failed for pushed commit: ${failedRuns.map(runLabel).join(", ")}`);
    }

    const pendingRuns = runs.filter((runRecord) => runRecord.status !== "completed");
    if (pendingRuns.length === 0) {
      console.log(`GitHub Actions completed for pushed commit: ${runs.map(runLabel).join(", ")}.`);
      return;
    }

    console.log(`GitHub Actions still running: ${pendingRuns.map(runLabel).join(", ")}.`);
    sleepSeconds(actionPollSeconds);
  }

  fail(
    firstRunSeen
      ? `timed out after ${actionTimeoutSeconds}s waiting for GitHub Actions to complete for ${commitSha}`
      : `timed out after ${actionTimeoutSeconds}s waiting for any GitHub Actions run to appear for ${commitSha}`,
  );
}

function runPnpmScript(scriptName, scriptArgs = []) {
  if (process.platform === "win32") {
    const commandLine = ["pnpm", "run", scriptName, ...scriptArgs]
      .map(quoteCmdArg)
      .join(" ");
    run("cmd.exe", ["/d", "/s", "/c", commandLine], { stdio: "inherit" });
    return;
  }
  run("pnpm", ["run", scriptName, ...scriptArgs], { stdio: "inherit" });
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (arg === "--skip-checks") {
    skipChecks = true;
    continue;
  }

  if (arg === "--dry-run") {
    dryRun = true;
    continue;
  }

  if (arg === "--skip-local-refresh") {
    refreshLocalAfterPush = false;
    continue;
  }

  if (arg === "--action-timeout-seconds") {
    actionTimeoutSeconds = parsePositiveInteger(args[i + 1], arg);
    i += 1;
    continue;
  }

  if (arg.startsWith("--action-timeout-seconds=")) {
    actionTimeoutSeconds = parsePositiveInteger(arg.slice("--action-timeout-seconds=".length), "--action-timeout-seconds");
    continue;
  }

  if (arg === "--action-poll-seconds") {
    actionPollSeconds = parsePositiveInteger(args[i + 1], arg);
    i += 1;
    continue;
  }

  if (arg.startsWith("--action-poll-seconds=")) {
    actionPollSeconds = parsePositiveInteger(arg.slice("--action-poll-seconds=".length), "--action-poll-seconds");
    continue;
  }

  if (arg === "--message" || arg === "-m") {
    message = args[i + 1] ?? "";
    if (!message) {
      fail("missing value for --message");
    }
    i += 1;
    continue;
  }

  if (arg.startsWith("--message=")) {
    message = arg.slice("--message=".length);
    if (!message) {
      fail("missing value for --message");
    }
    continue;
  }

  if (arg === "--help" || arg === "-h") {
    console.log([
      "Usage: node scripts/commit-push-staging.mjs [--message <text>] [--skip-checks] [--skip-local-refresh] [--dry-run]",
      "",
      "By default the script verifies origin/staging and waits for GitHub Actions to complete for the pushed commit before printing commit-push completed.",
    ].join("\n"));
    process.exit(0);
  }

  fail(`unknown option '${arg}'`);
}

try {
  runGit(["rev-parse", "--is-inside-work-tree"]);
} catch {
  fail("current directory is not a git repository");
}

const currentBranch = runGit(["branch", "--show-current"]);
if (currentBranch !== DEFAULT_BRANCH) {
  fail(`expected branch '${DEFAULT_BRANCH}', found '${currentBranch || "detached HEAD"}'`);
}

const status = runGit(["status", "--porcelain"]);
if (!status) {
  console.log("No local changes detected. Nothing to commit or push.");
  process.exit(0);
}

if (!skipChecks) {
  console.log("Running typecheck...");
  runPnpmScript("typecheck");
  console.log("Running build check...");
  runPnpmScript("check");
} else {
  console.log("Skipping checks (--skip-checks).");
}

runGit(["add", "-A"], { stdio: "inherit" });

const stagedFilesRaw = runGit(["diff", "--cached", "--name-only"]);
if (!stagedFilesRaw) {
  fail("no staged changes found after git add");
}

const stagedFiles = stagedFilesRaw
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!message) {
  const isoStamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  message = `staging sync ${isoStamp} (${stagedFiles.length} files)`;
}

if (dryRun) {
  console.log("Dry run:");
  console.log(`- Commit message: ${message}`);
  console.log(`- Files staged: ${stagedFiles.length}`);
  console.log("- Push target: origin/staging");
  console.log(`- Refresh localhost from staging after push: ${refreshLocalAfterPush ? "yes" : "no"}`);
  console.log("- Wait for GitHub Actions: yes");
  process.exit(0);
}

console.log(`Committing ${stagedFiles.length} file(s)...`);
runGit(["commit", "-m", message], { stdio: "inherit" });

console.log(`Pushing to origin/${DEFAULT_BRANCH}...`);
runGit(["push", "origin", DEFAULT_BRANCH], { stdio: "inherit" });

const pushedHead = runGit(["rev-parse", "HEAD"]);
verifyRemoteBranchHead(pushedHead);
verifyGithubActionsCompleted(pushedHead);

if (refreshLocalAfterPush) {
  console.log("Refreshing localhost database from staging...");
  runPnpmScript("refresh:local-from-staging", ["--", "--confirm"]);
} else {
  console.log("Skipping localhost database refresh (--skip-local-refresh).");
}

console.log("commit-push completed after GitHub Actions verification.");
