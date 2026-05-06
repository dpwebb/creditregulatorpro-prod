import { execFileSync } from "node:child_process";

const DEFAULT_BRANCH = "staging";
const args = process.argv.slice(2);

let message = "";
let skipChecks = false;
let dryRun = false;
let refreshLocalAfterPush = true;

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
    console.log("Usage: node scripts/commit-push-staging.mjs [--message <text>] [--skip-checks] [--skip-local-refresh] [--dry-run]");
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
  process.exit(0);
}

console.log(`Committing ${stagedFiles.length} file(s)...`);
runGit(["commit", "-m", message], { stdio: "inherit" });

console.log(`Pushing to origin/${DEFAULT_BRANCH}...`);
runGit(["push", "origin", DEFAULT_BRANCH], { stdio: "inherit" });

if (refreshLocalAfterPush) {
  console.log("Refreshing localhost database from staging...");
  runPnpmScript("refresh:local-from-staging", ["--", "--confirm"]);
} else {
  console.log("Skipping localhost database refresh (--skip-local-refresh).");
}

console.log("commit-push completed.");
