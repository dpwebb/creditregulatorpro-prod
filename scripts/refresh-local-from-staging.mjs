import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import postgres from "postgres";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SOURCE_URL_ENV_CANDIDATES = [
  "STAGING_DATABASE_URL",
  "CRP_STAGING_DATABASE_URL",
  "STAGING_FLOOT_DATABASE_URL",
  "REMOTE_STAGING_DATABASE_URL",
];
const DEFAULT_REMOTE_APP_DIR = "/opt/creditregulatorpro-staging/app";
const DEFAULT_REMOTE_APP_CONTAINER = "creditregulatorpro-staging";
const DEFAULT_DOCKER_IMAGE = "postgres:17";
const DEFAULT_OUTPUT_DIR = ".local/staging-db-refresh";
const VOLATILE_TABLES = [
  "sessions",
  "oauth_accounts",
  "oauth_states",
  "password_reset_tokens",
  "email_verification_tokens",
  "login_attempts",
  "rate_limit_entry",
];

const args = process.argv.slice(2);
const options = {
  confirm: false,
  dryRun: false,
  keepDump: false,
  skipLocalAdmin: false,
  skipVolatileCleanup: false,
  sourceUrlEnv: "",
  dumpFile: "",
  source: "auto",
  remoteAppDir: DEFAULT_REMOTE_APP_DIR,
  remoteAppContainer: process.env.STAGING_APP_CONTAINER || DEFAULT_REMOTE_APP_CONTAINER,
  outputDir: DEFAULT_OUTPUT_DIR,
  toolMode: "auto",
  dockerImage: DEFAULT_DOCKER_IMAGE,
};

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`Usage:
  pnpm run refresh:local-from-staging -- --confirm

Options:
  --confirm                    Required before replacing local DB contents.
  --dry-run                    Show the selected source/target/tooling without dumping or restoring.
  --source auto|direct|ssh|dump Source mode. Default: auto.
  --source-url-env NAME        Env var containing direct staging DB URL.
  --dump-file PATH             Restore an existing pg_dump custom-format file.
  --remote-app-dir PATH        Staging app path for SSH mode. Default: ${DEFAULT_REMOTE_APP_DIR}
  --remote-app-container NAME  Staging app container for SSH mode. Default: ${DEFAULT_REMOTE_APP_CONTAINER}
  --output-dir PATH            Local temp dump/key directory. Default: ${DEFAULT_OUTPUT_DIR}
  --tool-mode auto|native|docker
  --docker-image IMAGE         Postgres client image for Docker mode. Default: ${DEFAULT_DOCKER_IMAGE}
  --keep-dump                  Keep the dump file after restore. It can contain sensitive data.
  --skip-local-admin           Do not reseed the local admin after restore.
  --skip-volatile-cleanup      Keep copied sessions/tokens/oauth rows.
  --help                       Show this help.

Source resolution:
  Direct mode reads one of ${SOURCE_URL_ENV_CANDIDATES.join(", ")} unless --source-url-env is set.
  SSH mode uses STAGING_HOST, STAGING_USER, STAGING_SSH_PRIVATE_KEY, and optional STAGING_SSH_PORT.
`);
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--") {
    continue;
  }
  if (arg === "--confirm") {
    options.confirm = true;
    continue;
  }
  if (arg === "--dry-run") {
    options.dryRun = true;
    continue;
  }
  if (arg === "--keep-dump") {
    options.keepDump = true;
    continue;
  }
  if (arg === "--skip-local-admin") {
    options.skipLocalAdmin = true;
    continue;
  }
  if (arg === "--skip-volatile-cleanup") {
    options.skipVolatileCleanup = true;
    continue;
  }
  if (arg === "--source" || arg === "--source-url-env" || arg === "--dump-file" || arg === "--remote-app-dir" || arg === "--remote-app-container" || arg === "--output-dir" || arg === "--tool-mode" || arg === "--docker-image") {
    const value = args[i + 1];
    if (!value) fail(`missing value for ${arg}`);
    i += 1;
    if (arg === "--source") options.source = value;
    if (arg === "--source-url-env") options.sourceUrlEnv = value;
    if (arg === "--dump-file") options.dumpFile = value;
    if (arg === "--remote-app-dir") options.remoteAppDir = value;
    if (arg === "--remote-app-container") options.remoteAppContainer = value;
    if (arg === "--output-dir") options.outputDir = value;
    if (arg === "--tool-mode") options.toolMode = value;
    if (arg === "--docker-image") options.dockerImage = value;
    continue;
  }
  if (arg.startsWith("--source=")) {
    options.source = arg.slice("--source=".length);
    continue;
  }
  if (arg.startsWith("--source-url-env=")) {
    options.sourceUrlEnv = arg.slice("--source-url-env=".length);
    continue;
  }
  if (arg.startsWith("--dump-file=")) {
    options.dumpFile = arg.slice("--dump-file=".length);
    continue;
  }
  if (arg.startsWith("--remote-app-dir=")) {
    options.remoteAppDir = arg.slice("--remote-app-dir=".length);
    continue;
  }
  if (arg.startsWith("--remote-app-container=")) {
    options.remoteAppContainer = arg.slice("--remote-app-container=".length);
    continue;
  }
  if (arg.startsWith("--output-dir=")) {
    options.outputDir = arg.slice("--output-dir=".length);
    continue;
  }
  if (arg.startsWith("--tool-mode=")) {
    options.toolMode = arg.slice("--tool-mode=".length);
    continue;
  }
  if (arg.startsWith("--docker-image=")) {
    options.dockerImage = arg.slice("--docker-image=".length);
    continue;
  }
  if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  }
  fail(`unknown option '${arg}'`);
}

if (!["auto", "direct", "ssh", "dump"].includes(options.source)) {
  fail("--source must be auto, direct, ssh, or dump");
}
if (!["auto", "native", "docker"].includes(options.toolMode)) {
  fail("--tool-mode must be auto, native, or docker");
}

function parseDotEnv(contents) {
  const env = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value.replace(/\\n/g, "\n");
  }
  return env;
}

function readEnvJson() {
  const envJsonPath = path.resolve("env.json");
  if (!fs.existsSync(envJsonPath)) {
    fail("env.json not found. Local refresh requires this repo's local dev config.");
  }
  return JSON.parse(fs.readFileSync(envJsonPath, "utf8"));
}

function loadExternalEnv(envJson) {
  const fromProcess = { ...process.env };
  const globalPath = envJson.GLOBAL_SECRETS_PATH;
  const globalEnv =
    globalPath && fs.existsSync(globalPath)
      ? parseDotEnv(fs.readFileSync(globalPath, "utf8"))
      : {};
  return { ...fromProcess, ...globalEnv, ...envJson };
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalDatabaseUrl(envJson, env) {
  const baseUrl = env.DATABASE_URL || env.FLOOT_DATABASE_URL || envJson.FLOOT_DATABASE_URL;
  if (!baseUrl || !isValidUrl(baseUrl)) {
    fail("No valid local base DATABASE_URL/FLOOT_DATABASE_URL could be resolved.");
  }

  const url = new URL(baseUrl);
  if (envJson.LOCAL_DATABASE_NAME || env.LOCAL_DATABASE_NAME) {
    url.pathname = `/${envJson.LOCAL_DATABASE_NAME || env.LOCAL_DATABASE_NAME}`;
  }
  return url.toString();
}

function assertLocalTarget(urlString, envJson) {
  if (envJson.CRP_LOCAL_DEV !== "true" && process.env.CRP_LOCAL_DEV !== "true") {
    fail("Refusing to refresh local DB unless CRP_LOCAL_DEV=true in env.json or the process env.");
  }

  const url = new URL(urlString);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    fail(`Refusing to restore into non-local database host: ${url.hostname}`);
  }

  const expectedDb = envJson.LOCAL_DATABASE_NAME || process.env.LOCAL_DATABASE_NAME;
  const actualDb = url.pathname.replace(/^\//, "");
  if (expectedDb && actualDb !== expectedDb) {
    fail(`Refusing to restore ${actualDb}; expected LOCAL_DATABASE_NAME=${expectedDb}.`);
  }
}

function resolveDirectSourceUrl(env) {
  const candidates = options.sourceUrlEnv
    ? [options.sourceUrlEnv]
    : SOURCE_URL_ENV_CANDIDATES;

  for (const key of candidates) {
    const value = env[key];
    if (value && isValidUrl(value)) {
      return { key, url: value };
    }
  }

  return null;
}

function hasCommand(command) {
  const checker = process.platform === "win32" ? "where.exe" : "command";
  const checkerArgs = process.platform === "win32" ? [command] : ["-v", command];
  return new Promise((resolve) => {
    const child = spawn(checker, checkerArgs, { stdio: "ignore", shell: process.platform !== "win32" });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function resolvePgToolMode() {
  if (options.toolMode === "native") {
    const hasPgRestore = await hasCommand("pg_restore");
    if (!hasPgRestore) fail("pg_restore is not available on PATH.");
    return "native";
  }

  if (options.toolMode === "docker") {
    const hasDocker = await hasCommand("docker");
    if (!hasDocker) fail("docker is not available on PATH.");
    return "docker";
  }

  const hasPgRestore = await hasCommand("pg_restore");
  if (hasPgRestore) return "native";

  const hasDocker = await hasCommand("docker");
  if (hasDocker) return "docker";

  fail("Neither native pg_restore nor Docker is available.");
}

function spawnToPromise(command, commandArgs, spawnOptions = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: spawnOptions.stdio ?? "inherit",
      env: spawnOptions.env ?? process.env,
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function spawnToResult(command, commandArgs, spawnOptions = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: spawnOptions.env ?? process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (spawnOptions.tee !== false) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (spawnOptions.tee !== false) process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function isIgnorablePg17ToPg16RestoreWarning(result) {
  const combined = `${result.stdout}\n${result.stderr}`;
  return (
    result.code === 1 &&
    combined.includes('unrecognized configuration parameter "transaction_timeout"') &&
    /errors ignored on restore:\s*1/i.test(combined)
  );
}

function dockerUrl(urlString) {
  const url = new URL(urlString);
  if (LOCAL_HOSTS.has(url.hostname)) {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}

function dockerRunArgs(pgCommand, pgArgs, mountDir) {
  const args = ["run", "--rm"];
  if (mountDir) {
    args.push("-v", `${mountDir}:/work`);
  }
  if (os.platform() === "linux") {
    args.push("--add-host", "host.docker.internal:host-gateway");
  }
  args.push(options.dockerImage, pgCommand, ...pgArgs);
  return args;
}

async function runPgRestore(toolMode, dumpFile, targetUrl) {
  const dumpDir = path.dirname(dumpFile);
  const dumpName = path.basename(dumpFile);

  if (toolMode === "native") {
    const result = await spawnToResult("pg_restore", [
      "--no-owner",
      "--no-acl",
      "--dbname",
      targetUrl,
      dumpFile,
    ]);
    if (result.code !== 0 && !isIgnorablePg17ToPg16RestoreWarning(result)) {
      throw new Error(`pg_restore exited with code ${result.code}`);
    }
    return;
  }

  const result = await spawnToResult("docker", dockerRunArgs("pg_restore", [
    "--no-owner",
    "--no-acl",
    "--dbname",
    dockerUrl(targetUrl),
    `/work/${dumpName}`,
  ], dumpDir));
  if (result.code !== 0 && !isIgnorablePg17ToPg16RestoreWarning(result)) {
    throw new Error(`docker pg_restore exited with code ${result.code}`);
  }
}

async function runPgDumpDirect(toolMode, sourceUrl, dumpFile) {
  const dumpDir = path.dirname(dumpFile);
  const dumpName = path.basename(dumpFile);

  if (toolMode === "native") {
    const hasPgDump = await hasCommand("pg_dump");
    if (!hasPgDump) fail("pg_dump is not available on PATH; use Docker mode or SSH mode.");
    await spawnToPromise("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file",
      dumpFile,
      "--dbname",
      sourceUrl,
    ]);
    return;
  }

  await spawnToPromise("docker", dockerRunArgs("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    `/work/${dumpName}`,
    "--dbname",
    sourceUrl,
  ], dumpDir));
}

function resolveSshKeyFile(env, outputDir) {
  const key = env.STAGING_SSH_PRIVATE_KEY;
  if (!key) return null;

  if (fs.existsSync(key)) {
    return path.resolve(key);
  }

  const keyPath = path.join(outputDir, `staging_ssh_key_${process.pid}_${Date.now()}`);
  const keyContents = normalizePrivateKeyValue(key);
  removeExistingGeneratedKey(keyPath);
  fs.writeFileSync(keyPath, keyContents.endsWith("\n") ? keyContents : `${keyContents}\n`, { mode: 0o600 });
  hardenPrivateKeyFile(keyPath);
  return keyPath;
}

function normalizePrivateKeyValue(value) {
  const trimmed = value.trim();
  if (/-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
      if (/-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(decoded)) {
        return decoded;
      }
    } catch {
      // Fall through to raw value below.
    }
  }

  return value;
}

function getCurrentWindowsUser() {
  return process.env.USERDOMAIN && process.env.USERNAME
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : os.userInfo().username;
}

function removeExistingGeneratedKey(keyPath) {
  if (!fs.existsSync(keyPath)) {
    return;
  }

  try {
    fs.unlinkSync(keyPath);
    return;
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }

  const grantCurrentUser = spawnSync("icacls", [keyPath, "/grant:r", `${getCurrentWindowsUser()}:F`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (grantCurrentUser.status !== 0) {
    throw new Error(`Failed to unlock existing generated SSH key: ${grantCurrentUser.stderr || grantCurrentUser.stdout}`);
  }

  fs.unlinkSync(keyPath);
}

function hardenPrivateKeyFile(keyPath) {
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // Windows needs ACL hardening below; POSIX chmod can fail on some mounts.
  }

  if (process.platform !== "win32") {
    return;
  }

  const removeInheritance = spawnSync("icacls", [keyPath, "/inheritance:r"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (removeInheritance.status !== 0) {
    throw new Error(`Failed to harden SSH key ACL inheritance: ${removeInheritance.stderr || removeInheritance.stdout}`);
  }

  const grantCurrentUser = spawnSync("icacls", [keyPath, "/grant:r", `${getCurrentWindowsUser()}:R`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (grantCurrentUser.status !== 0) {
    throw new Error(`Failed to grant current user SSH key read permission: ${grantCurrentUser.stderr || grantCurrentUser.stdout}`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

async function runRemoteSshDump(env, outputDir, dumpFile) {
  const host = env.STAGING_HOST;
  const user = env.STAGING_USER;
  const port = env.STAGING_SSH_PORT || "22";
  const keyFile = resolveSshKeyFile(env, outputDir);

  if (!host || !user || !keyFile) {
    fail("SSH source requires STAGING_HOST, STAGING_USER, and STAGING_SSH_PRIVATE_KEY.");
  }

const remoteCommand = `
set -e
APP_DIR=${shellQuote(options.remoteAppDir)}
APP_CONTAINER=${shellQuote(options.remoteAppContainer)}
DB_URL=""

if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  if command -v node >/dev/null 2>&1; then
    DB_URL="$(node --input-type=module -e 'import "./loadEnv.js"; process.stdout.write(process.env.FLOOT_DATABASE_URL || process.env.DATABASE_URL || "")' 2>/dev/null || true)"
  fi
fi

if [ -z "$DB_URL" ] && command -v docker >/dev/null 2>&1; then
  if ! docker ps --format '{{.Names}}' | grep -Fx "$APP_CONTAINER" >/dev/null 2>&1; then
    APP_CONTAINER="$(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($0) ~ /creditregulatorpro/ && tolower($0) !~ /postgres/ {print $1; exit}')"
  fi
  if [ -n "$APP_CONTAINER" ]; then
    DB_URL="$(docker exec "$APP_CONTAINER" printenv FLOOT_DATABASE_URL 2>/dev/null || true)"
    if [ -z "$DB_URL" ]; then
      DB_URL="$(docker exec "$APP_CONTAINER" printenv DATABASE_URL 2>/dev/null || true)"
    fi
    if [ -z "$DB_URL" ]; then
      DB_URL="$(docker exec "$APP_CONTAINER" printenv DATABASE_PRIVATE_URL 2>/dev/null || true)"
    fi
  fi
fi

if [ -z "$DB_URL" ]; then
  echo "staging DB URL was not resolved on the remote app server" >&2
  exit 30
fi
if command -v pg_dump >/dev/null 2>&1; then
  exec pg_dump --format=custom --no-owner --no-acl --dbname="$DB_URL"
fi
if command -v docker >/dev/null 2>&1; then
  APP_NETWORK=""
  if [ -n "$APP_CONTAINER" ]; then
    APP_NETWORK="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$APP_CONTAINER" 2>/dev/null | head -n 1 || true)"
  fi
  if [ -n "$APP_NETWORK" ]; then
    exec docker run --rm --network "$APP_NETWORK" --add-host host.docker.internal:host-gateway ${shellQuote(options.dockerImage)} pg_dump --format=custom --no-owner --no-acl --dbname="$DB_URL"
  fi
  exec docker run --rm --network host --add-host host.docker.internal:host-gateway ${shellQuote(options.dockerImage)} pg_dump --format=custom --no-owner --no-acl --dbname="$DB_URL"
fi
echo "pg_dump is not available on the staging host and no Docker fallback worked" >&2
exit 31
`.trim();

  const args = [
    "-i",
    keyFile,
    "-p",
    String(port),
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    `${user}@${host}`,
    remoteCommand,
  ];

  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(dumpFile, { mode: 0o600 });
      const child = spawn("ssh", args, { stdio: ["ignore", "pipe", "inherit"] });

      child.stdout.pipe(out);
      child.on("error", reject);
      out.on("error", reject);
      child.on("exit", (code) => {
        out.end();
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`ssh exited with code ${code}`));
      });
    });
  } finally {
    removeGeneratedSshKeyFile(keyFile, outputDir);
  }
}

function removeGeneratedSshKeyFile(keyFile, outputDir) {
  const resolvedKey = path.resolve(keyFile);
  const resolvedOutput = path.resolve(outputDir);
  const keyName = path.basename(resolvedKey);
  const isGeneratedRefreshKey =
    keyName === "staging_ssh_key" || keyName.startsWith("staging_ssh_key_");
  if (!resolvedKey.startsWith(`${resolvedOutput}${path.sep}`) || !isGeneratedRefreshKey) {
    return;
  }

  try {
    fs.unlinkSync(resolvedKey);
    return;
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }
  }

  const grantCurrentUser = spawnSync("icacls", [resolvedKey, "/grant:r", `${getCurrentWindowsUser()}:F`], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (grantCurrentUser.status !== 0) {
    throw new Error(`Failed to unlock generated SSH key for cleanup: ${grantCurrentUser.stderr || grantCurrentUser.stdout}`);
  }

  fs.unlinkSync(resolvedKey);
}

function makeMaintenanceUrl(targetUrl) {
  const url = new URL(targetUrl);
  url.pathname = "/postgres";
  return url.toString();
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function ensureLocalDatabaseExists(targetUrl) {
  const target = new URL(targetUrl);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const adminSql = postgres(makeMaintenanceUrl(targetUrl), { prepare: false, max: 1 });

  try {
    const existing = await adminSql`select 1 from pg_database where datname = ${dbName}`;
    if (existing.length === 0) {
      await adminSql.unsafe(`create database ${quoteIdentifier(dbName)}`);
    }
  } finally {
    await adminSql.end({ timeout: 1 });
  }
}

async function resetLocalPublicSchema(targetUrl) {
  const target = new URL(targetUrl);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const adminSql = postgres(makeMaintenanceUrl(targetUrl), { prepare: false, max: 1 });

  try {
    await adminSql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${dbName}
        and pid <> pg_backend_pid()
    `;
  } finally {
    await adminSql.end({ timeout: 1 });
  }

  const targetSql = postgres(targetUrl, { prepare: false, max: 1 });
  try {
    await targetSql`drop schema if exists public cascade`;
    await targetSql`create schema public`;
    await targetSql`grant all on schema public to public`;
  } finally {
    await targetSql.end({ timeout: 1 });
  }
}

async function tableExists(sql, tableName) {
  const rows = await sql`select to_regclass(${`public.${tableName}`}) as table_name`;
  return Boolean(rows[0]?.table_name);
}

async function cleanupVolatileLocalTables(targetUrl) {
  const sql = postgres(targetUrl, { prepare: false, max: 1 });
  try {
    for (const table of VOLATILE_TABLES) {
      if (await tableExists(sql, table)) {
        await sql.unsafe(`truncate table public.${quoteIdentifier(table)} cascade`);
      }
    }

    if (await tableExists(sql, "audit_log")) {
      await sql`update public.audit_log set ip_address = null, user_agent = null`;
    }
    if (await tableExists(sql, "suspicious_activity_log")) {
      await sql`update public.suspicious_activity_log set ip_address = null, user_agent = null`;
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function seedLocalAdmin() {
  const command = process.platform === "win32" ? "cmd.exe" : "pnpm";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "pnpm run bootstrap:local-auth-schema"]
      : ["run", "bootstrap:local-auth-schema"];
  await spawnToPromise(command, commandArgs);
}

async function collectCounts(targetUrl) {
  const sql = postgres(targetUrl, { prepare: false, max: 1 });
  const tables = ["users", "report_artifact", "tradeline", "packet", "parser_test_case"];
  const counts = {};
  try {
    for (const table of tables) {
      if (await tableExists(sql, table)) {
        const rows = await sql.unsafe(`select count(*)::int as count from public.${quoteIdentifier(table)}`);
        counts[table] = rows[0]?.count ?? 0;
      } else {
        counts[table] = null;
      }
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
  return counts;
}

function safeDbLabel(urlString) {
  const url = new URL(urlString);
  return `${url.hostname}:${url.port || "default"}/${url.pathname.replace(/^\//, "")}`;
}

function resolveSourcePlan(env) {
  if (options.dumpFile) {
    return { mode: "dump", dumpFile: path.resolve(options.dumpFile), sourceUrlEnv: null };
  }

  if (options.source === "dump") {
    fail("--source dump requires --dump-file PATH.");
  }

  const direct = resolveDirectSourceUrl(env);
  if ((options.source === "direct" || options.source === "auto") && direct) {
    return { mode: "direct", sourceUrl: direct.url, sourceUrlEnv: direct.key };
  }

  if (options.source === "direct") {
    fail(`No direct staging DB URL found. Set ${options.sourceUrlEnv || SOURCE_URL_ENV_CANDIDATES.join(" or ")}.`);
  }

  if (options.source === "ssh" || options.source === "auto") {
    if (env.STAGING_HOST && env.STAGING_USER && env.STAGING_SSH_PRIVATE_KEY) {
      return { mode: "ssh", sourceUrlEnv: null };
    }
  }

  fail("No staging source configured. Add a staging DB URL env var or staging SSH settings.");
}

function ensureInsideWorkspace(localPath) {
  const resolved = path.resolve(localPath);
  const workspace = path.resolve(".");
  if (!resolved.startsWith(`${workspace}${path.sep}`) && resolved !== workspace) {
    fail(`Refusing to write outside the workspace: ${resolved}`);
  }
  return resolved;
}

async function main() {
  const envJson = readEnvJson();
  const env = loadExternalEnv(envJson);
  const targetUrl = resolveLocalDatabaseUrl(envJson, env);
  assertLocalTarget(targetUrl, envJson);

  const sourcePlan = resolveSourcePlan(env);
  const toolMode = await resolvePgToolMode();
  const outputDir = ensureInsideWorkspace(options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const dumpFile =
    sourcePlan.mode === "dump"
      ? path.resolve(sourcePlan.dumpFile)
      : path.join(outputDir, `staging-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);

  if (sourcePlan.mode === "dump" && !fs.existsSync(dumpFile)) {
    fail(`Dump file does not exist: ${dumpFile}`);
  }

  console.log("Local staging refresh plan:");
  console.log(`- Source mode: ${sourcePlan.mode}${sourcePlan.sourceUrlEnv ? ` (${sourcePlan.sourceUrlEnv})` : ""}`);
  console.log(`- Target DB: ${safeDbLabel(targetUrl)}`);
  console.log(`- Postgres client mode: ${toolMode}`);
  console.log(`- Dump path: ${dumpFile}`);
  console.log(`- Clear copied sessions/tokens: ${options.skipVolatileCleanup ? "no" : "yes"}`);
  console.log(`- Reseed local admin: ${options.skipLocalAdmin ? "no" : "yes"}`);

  if (options.dryRun) {
    console.log("Dry run complete. No dump or restore was performed.");
    return;
  }

  if (!options.confirm) {
    fail("This command replaces the local DB contents. Re-run with --confirm to proceed.");
  }

  if (sourcePlan.mode === "direct") {
    const sourceLabel = safeDbLabel(sourcePlan.sourceUrl);
    if (sourceLabel === safeDbLabel(targetUrl)) {
      fail("Source and target database labels match; refusing to continue.");
    }
    console.log("Creating local dump from direct staging database URL...");
    await runPgDumpDirect(toolMode, sourcePlan.sourceUrl, dumpFile);
  } else if (sourcePlan.mode === "ssh") {
    console.log("Creating local dump through staging SSH...");
    await runRemoteSshDump(env, outputDir, dumpFile);
  } else {
    console.log("Using existing dump file.");
  }

  console.log("Resetting local public schema...");
  await ensureLocalDatabaseExists(targetUrl);
  await resetLocalPublicSchema(targetUrl);

  console.log("Restoring dump into local database...");
  await runPgRestore(toolMode, dumpFile, targetUrl);

  if (!options.skipVolatileCleanup) {
    console.log("Clearing copied sessions, transient tokens, and IP/user-agent fields locally...");
    await cleanupVolatileLocalTables(targetUrl);
  }

  if (!options.skipLocalAdmin) {
    console.log("Reseeding local admin account for localhost access...");
    await seedLocalAdmin();
  }

  const counts = await collectCounts(targetUrl);
  console.log("Local refresh complete.");
  console.log(`Counts: ${JSON.stringify(counts)}`);

  if (!options.keepDump && sourcePlan.mode !== "dump") {
    const resolvedDump = path.resolve(dumpFile);
    const resolvedOutput = path.resolve(outputDir);
    if (!resolvedDump.startsWith(`${resolvedOutput}${path.sep}`)) {
      fail(`Refusing to remove dump outside output directory: ${resolvedDump}`);
    }
    fs.unlinkSync(resolvedDump);
    console.log("Removed temporary dump file.");
  } else if (options.keepDump) {
    console.log("Kept dump file. Treat it as sensitive data.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
