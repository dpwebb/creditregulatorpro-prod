import { execFileSync } from "node:child_process";

const DEFAULT_PRODUCTION_REPO = "https://github.com/dpwebb/creditregulatorpro-prod.git";
const DEFAULT_SOURCE_BRANCH = "staging";
const DEFAULT_PRODUCTION_BRANCH = "main";

const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const allowNonFastForward = args.has("--allow-non-fast-forward");
const skipStagingGate = args.has("--skip-staging-gate");

const productionRepo = process.env.PRODUCTION_REPO_URL || DEFAULT_PRODUCTION_REPO;
const sourceBranch = process.env.SOURCE_BRANCH || DEFAULT_SOURCE_BRANCH;
const productionBranch = process.env.PRODUCTION_BRANCH || DEFAULT_PRODUCTION_BRANCH;
const tempRef = `refs/tmp/production-promotion/${productionBranch}`;

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

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function cleanupTempRef() {
  try {
    runGit(["update-ref", "-d", tempRef]);
  } catch {
    // Best effort cleanup only.
  }
}

try {
  runGit(["rev-parse", "--is-inside-work-tree"]);
} catch {
  fail("current directory is not a git repository");
}

const branch = runGit(["branch", "--show-current"]);
if (branch !== sourceBranch) {
  fail(`promotions must run from '${sourceBranch}', but current branch is '${branch || "detached HEAD"}'`);
}

let upstream = "";
try {
  upstream = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
} catch {
  fail(`branch '${branch}' has no upstream configured`);
}

console.log(`Source branch: ${branch}`);
console.log(`Source upstream: ${upstream}`);
console.log(`Production repo: ${productionRepo}`);
console.log(`Production branch: ${productionBranch}`);
console.log("");

console.log("Fetching source upstream...");
const upstreamRemote = upstream.split("/")[0];
runGit(["fetch", "--prune", upstreamRemote], { stdio: "inherit" });

const status = runGit(["status", "--porcelain"]);
if (status) {
  console.log(status);
  fail("working tree has uncommitted changes");
}

const localHead = runGit(["rev-parse", "HEAD"]);
const upstreamHead = runGit(["rev-parse", upstream]);
if (localHead !== upstreamHead) {
  fail(`local HEAD ${localHead} does not match ${upstream} ${upstreamHead}`);
}

if (!skipStagingGate) {
  console.log("Running staging validation gate...");
  run(process.execPath, ["scripts/check-staging-gate.mjs"], { stdio: "inherit" });
} else {
  console.log("Skipping staging validation gate (--skip-staging-gate).");
}

console.log("Running build check...");
if (process.platform === "win32") {
  run("cmd.exe", ["/d", "/s", "/c", "pnpm run check"], { stdio: "inherit" });
} else {
  run("pnpm", ["run", "check"], { stdio: "inherit" });
}

console.log("Fetching production branch for comparison...");
cleanupTempRef();
runGit(["fetch", "--no-tags", productionRepo, `refs/heads/${productionBranch}:${tempRef}`], { stdio: "inherit" });

const productionHead = runGit(["rev-parse", tempRef]);
let isFastForward = false;
try {
  runGit(["merge-base", "--is-ancestor", productionHead, localHead], { stdio: "ignore" });
  isFastForward = true;
} catch {
  isFastForward = false;
}

console.log("");
console.log(`Approved staging commit: ${localHead}`);
console.log(`Current production commit: ${productionHead}`);
console.log(`Fast-forward promotion: ${isFastForward ? "yes" : "no"}`);

if (!isFastForward && !allowNonFastForward) {
  cleanupTempRef();
  fail(
    "production branch is not an ancestor of this staging commit. " +
      "Review the history first, then rerun with --allow-non-fast-forward if replacing production with staging is intended.",
  );
}

const pushArgs = [
  "push",
  `--force-with-lease=refs/heads/${productionBranch}:${productionHead}`,
  productionRepo,
  `HEAD:refs/heads/${productionBranch}`,
];

console.log("");
if (!confirm) {
  console.log("Dry run only. No production branch was changed.");
  console.log("To promote this exact commit, rerun with:");
  console.log(
    `pnpm run promote:production -- --confirm${isFastForward ? "" : " --allow-non-fast-forward"}`,
  );
  cleanupTempRef();
  process.exit(0);
}

console.log("Pushing approved staging commit to production...");
runGit(pushArgs, { stdio: "inherit" });
cleanupTempRef();

console.log("");
console.log(`Promotion complete: ${localHead} -> ${productionRepo} ${productionBranch}`);
