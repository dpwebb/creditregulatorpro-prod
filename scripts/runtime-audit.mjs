#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";

const DEFAULT_BASE_URL = "https://staging.creditregulatorpro.com";
const DEFAULT_SSH_HOST = "staging.creditregulatorpro.com";
const DEFAULT_APP_CONTAINER = "creditregulatorpro-staging";
const DEFAULT_WORKER_CONTAINER = "creditregulatorpro-staging-ingest-worker";
const DEFAULT_REMOTE_APP_DIR = "/opt/creditregulatorpro-staging/app";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_LOG_TAIL = 500;

const REFUSED_HOSTS = new Set(["creditregulatorpro.com", "www.creditregulatorpro.com"]);
const ALLOWED_HOSTS = new Set(["staging.creditregulatorpro.com", "localhost", "127.0.0.1"]);

const checks = [];
const findings = [];
let tempKeyPath = null;

function parseArgs(argv, env = process.env) {
  const flags = new Set(argv);
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] ?? "" : "";
  };

  return {
    allowLocal: flags.has("--allow-local"),
    json: flags.has("--json"),
    sshMode: flags.has("--ssh"),
    localVpsMode: flags.has("--local-vps"),
    containerLocalMode: flags.has("--container-local"),
    publicOnly: flags.has("--public-only") || normalizeBoolean(env.CRP_RUNTIME_AUDIT_PUBLIC_ONLY),
    baseUrl: nonEmpty(valueAfter("--base-url")) ?? nonEmpty(env.STAGING_BASE_URL) ?? nonEmpty(env.STAGING_APP_URL) ?? DEFAULT_BASE_URL,
    sshHost: nonEmpty(valueAfter("--ssh-host")) ?? nonEmpty(env.STAGING_RUNTIME_SSH_HOST) ?? nonEmpty(env.STAGING_HOST) ?? DEFAULT_SSH_HOST,
    sshUser: nonEmpty(valueAfter("--ssh-user")) ?? nonEmpty(env.STAGING_RUNTIME_SSH_USER) ?? nonEmpty(env.STAGING_USER),
    sshPort: nonEmpty(valueAfter("--ssh-port")) ?? nonEmpty(env.STAGING_RUNTIME_SSH_PORT) ?? nonEmpty(env.STAGING_SSH_PORT) ?? "22",
    sshKeyPath: nonEmpty(valueAfter("--ssh-key")) ?? nonEmpty(env.STAGING_RUNTIME_SSH_KEY) ?? nonEmpty(env.STAGING_OBSERVABILITY_SSH_KEY),
    sshPrivateKey: nonEmpty(env.STAGING_SSH_PRIVATE_KEY),
    appContainer:
      nonEmpty(valueAfter("--container")) ?? nonEmpty(env.STAGING_RUNTIME_CONTAINER) ?? DEFAULT_APP_CONTAINER,
    workerContainer:
      nonEmpty(valueAfter("--worker-container")) ??
      nonEmpty(env.STAGING_RUNTIME_WORKER_CONTAINER) ??
      DEFAULT_WORKER_CONTAINER,
    remoteAppDir:
      nonEmpty(valueAfter("--remote-app-dir")) ?? nonEmpty(env.STAGING_RUNTIME_APP_DIR) ?? DEFAULT_REMOTE_APP_DIR,
    timeoutMs: clampInteger(valueAfter("--timeout-ms") || env.STAGING_RUNTIME_AUDIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 3000, 120000),
    logTail: clampInteger(valueAfter("--tail") || env.STAGING_RUNTIME_AUDIT_LOG_TAIL, DEFAULT_LOG_TAIL, 50, 5000),
  };
}

function commandAvailable(command) {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "sh", process.platform === "win32" ? [command] : ["-lc", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return result.status === 0;
}

function runningInContainer() {
  if (existsSync("/.dockerenv")) return true;
  try {
    return /docker|containerd|kubepods|lxc/i.test(readFileSync("/proc/1/cgroup", "utf8"));
  } catch {
    return false;
  }
}

function runningOnStagingVps(options) {
  if (process.platform === "win32") return false;
  const cwd = process.cwd();
  return (
    cwd === options.remoteAppDir ||
    cwd.startsWith(`${options.remoteAppDir}/`) ||
    existsSync(options.remoteAppDir)
  ) && commandAvailable("docker");
}

function resolveExecutionMode(options) {
  const explicitModes = [
    options.sshMode ? "--ssh" : null,
    options.localVpsMode ? "--local-vps" : null,
    options.containerLocalMode ? "--container-local" : null,
  ].filter(Boolean);

  if (explicitModes.length > 1) {
    throw new Error(`Runtime audit modes are mutually exclusive: ${explicitModes.join(", ")}`);
  }
  if (options.publicOnly) return "public-only";
  if (options.sshMode) return "ssh";
  if (options.localVpsMode) return "local-vps";
  if (options.containerLocalMode) return "container-local";
  if (runningOnStagingVps(options)) return "local-vps";
  if (runningInContainer()) return "container-local";
  return "ssh";
}

function nonEmpty(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function clampInteger(value, defaultValue, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function addCheck(subsystem, name, status, details = "", evidence = {}) {
  checks.push({ subsystem, name, status, details, evidence });
}

function addFinding(severity, subsystem, message, evidence = {}) {
  findings.push({ severity, subsystem, message, evidence });
}

function failCheck(subsystem, name, details, evidence = {}) {
  addCheck(subsystem, name, "FAIL", details, evidence);
  addFinding("FAIL", subsystem, `${name}: ${details}`, evidence);
}

function warnCheck(subsystem, name, details, evidence = {}) {
  addCheck(subsystem, name, "WARN", details, evidence);
  addFinding("WARN", subsystem, `${name}: ${details}`, evidence);
}

function passCheck(subsystem, name, details = "", evidence = {}) {
  addCheck(subsystem, name, "PASS", details, evidence);
}

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(session|token|password|secret|key|authorization|cookie)=([^;\s]+)/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"]+/gi, "$1[REDACTED]")
    .replace(/(sk-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+)/g, "[REDACTED]");
}

function sanitizeLine(line) {
  return redact(line).slice(0, 500);
}

function validateTargetUrl(baseUrl, allowLocal) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid staging runtime audit URL: ${baseUrl}`);
  }
  const host = url.hostname.toLowerCase();
  if (REFUSED_HOSTS.has(host)) {
    throw new Error(`Refusing runtime audit against production host ${host}.`);
  }
  if (!ALLOWED_HOSTS.has(host) || (!allowLocal && (host === "localhost" || host === "127.0.0.1"))) {
    throw new Error(`Refusing runtime audit against unapproved host ${host}.`);
  }
  return url;
}

async function fetchWithTimeout(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "creditregulatorpro-runtime-audit/2.0",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function absoluteUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function runPublicChecks(options) {
  const url = validateTargetUrl(options.baseUrl, options.allowLocal);
  const publicChecks = [
    { subsystem: "Staging Domain", name: "App shell", method: "GET", path: "/", statuses: [200] },
    { subsystem: "Staging Domain", name: "Login route", method: "GET", path: "/login", statuses: [200] },
    { subsystem: "API Availability", name: "Auth session unauthorized", method: "GET", path: "/_api/auth/session", statuses: [401, 403] },
    { subsystem: "API Availability", name: "Report artifact auth boundary", method: "GET", path: "/_api/report-artifact/list?limit=1", statuses: [401, 403] },
    { subsystem: "API Availability", name: "Ingest status auth boundary", method: "GET", path: "/_api/ingest/status?artifactId=1", statuses: [401, 403] },
    { subsystem: "API Availability", name: "Admin lifecycle auth boundary", method: "GET", path: "/_api/admin/mock-lifecycle/status", statuses: [401, 403] },
  ];

  for (const check of publicChecks) {
    try {
      const started = Date.now();
      const response = await fetchWithTimeout(absoluteUrl(options.baseUrl, check.path), options.timeoutMs, {
        method: check.method,
      });
      const elapsedMs = Date.now() - started;
      const details = `HTTP ${response.status} in ${elapsedMs}ms`;
      if (check.statuses.includes(response.status)) {
        passCheck(check.subsystem, check.name, details, {
          path: check.path,
          acceptedStatuses: check.statuses,
        });
      } else {
        failCheck(check.subsystem, check.name, `${details}; expected ${check.statuses.join(", ")}`, {
          path: check.path,
        });
      }
    } catch (error) {
      failCheck(check.subsystem, check.name, errorMessage(error), { path: check.path });
    }
  }

  if (url.protocol === "https:") {
    await checkTls(url.hostname, options.timeoutMs);
  } else {
    warnCheck("HTTPS", "TLS certificate", `Target protocol is ${url.protocol}, not https:`, { host: url.hostname });
  }
}

function checkTls(hostname, timeoutMs) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: true,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        passCheck("HTTPS", "TLS certificate", "Certificate validated by Node TLS", {
          host: hostname,
          subject: cert.subject?.CN ?? null,
          issuer: cert.issuer?.O ?? cert.issuer?.CN ?? null,
          validTo: cert.valid_to ?? null,
        });
        socket.end();
        resolve();
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      failCheck("HTTPS", "TLS certificate", "TLS connection timed out", { host: hostname });
      resolve();
    });
    socket.on("error", (error) => {
      failCheck("HTTPS", "TLS certificate", errorMessage(error), { host: hostname });
      resolve();
    });
  });
}

function errorMessage(error) {
  return error instanceof Error ? redact(error.message) : redact(String(error));
}

function prepareSshKey(options) {
  if (options.sshKeyPath) return options.sshKeyPath;
  if (!options.sshPrivateKey) return null;

  const dir = mkdtempSync(path.join(tmpdir(), "crp-runtime-audit-"));
  tempKeyPath = path.join(dir, "staging_key");
  writeFileSync(tempKeyPath, `${options.sshPrivateKey.trim()}\n`, { mode: 0o600 });
  return tempKeyPath;
}

function cleanupTempKey() {
  if (!tempKeyPath) return;
  rmSync(path.dirname(tempKeyPath), { recursive: true, force: true });
  tempKeyPath = null;
}

function sshBaseArgs(options) {
  const keyPath = prepareSshKey(options);
  const args = [
    "-p",
    options.sshPort,
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=15",
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  if (keyPath) args.push("-i", keyPath);
  args.push(`${options.sshUser}@${options.sshHost}`);
  return args;
}

function runSsh(options, remoteCommand, { input = null, timeoutMs = options.timeoutMs } = {}) {
  const result = spawnSync("ssh", [...sshBaseArgs(options), remoteCommand], {
    input,
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || `ssh exited with ${result.status ?? "unknown"}`));
  }
  return result.stdout;
}

function runLocalShell(command, { input = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const result = spawnSync(command, {
    input,
    shell: true,
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(redact(result.stderr || result.stdout || `command exited with ${result.status ?? "unknown"}`));
  }
  return result.stdout;
}

function createHostExecutor(mode, options) {
  if (mode === "ssh") {
    return {
      mode,
      label: "SSH",
      run(command, runOptions = {}) {
        return runSsh(options, command, runOptions);
      },
    };
  }
  return {
    mode,
    label: "local VPS",
    run(command, runOptions = {}) {
      return runLocalShell(command, {
        ...runOptions,
        timeoutMs: runOptions.timeoutMs ?? options.timeoutMs,
      });
    },
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function sshPrerequisites(options) {
  const missing = [];
  if (!options.sshHost) missing.push("STAGING_HOST or --ssh-host");
  if (!options.sshUser) missing.push("STAGING_USER or --ssh-user");
  if (!options.sshKeyPath && !options.sshPrivateKey) {
    missing.push("STAGING_OBSERVABILITY_SSH_KEY, STAGING_RUNTIME_SSH_KEY, --ssh-key, or STAGING_SSH_PRIVATE_KEY");
  }
  return missing;
}

async function runRuntimeChecks(options, mode) {
  if (mode === "public-only") {
    warnCheck("Audit Coverage", "Container-level audit", "Skipped by --public-only; public HTTP/TLS checks only.", {
      completion: "PUBLIC_ONLY_PARTIAL_PASS",
    });
    return;
  }

  if (mode === "container-local") {
    passCheck("Audit Access", "Container-local mode", "Running container-local runtime probes without host Docker access.", {
      cwd: process.cwd(),
      hostOnlyChecksAvailable: false,
    });
    markContainerHostOnlyUnavailable("Container-local mode cannot inspect host Docker, Traefik, host disk, or sibling container logs.", {
      mode,
    });
    await runContainerLocalProbe(options);
    return;
  }

  const executor = createHostExecutor(mode, options);

  if (mode === "local-vps") {
    if (!runningOnStagingVps(options) && !options.allowLocal) {
      failCheck("Audit Access", "Local VPS execution context", "Current process does not appear to be running from the staging VPS app directory.", {
        cwd: process.cwd(),
        expectedAppDir: options.remoteAppDir,
        dockerAvailable: commandAvailable("docker"),
      });
      markAccessBlockedSubsystems("Local VPS mode requested outside the staging VPS app directory.", { mode });
      return;
    }
    passCheck("Audit Access", "Local VPS execution context", "Running Docker/container diagnostics locally on the staging VPS.", {
      cwd: process.cwd(),
      remoteAppDir: options.remoteAppDir,
      dockerAvailable: commandAvailable("docker"),
    });
    await runHostDockerChecks(options, executor);
    await runHostContainerProbe(options, executor);
    await runHostDiskAndLogChecks(options, executor);
    return;
  }

  const missing = sshPrerequisites(options);
  if (missing.length > 0) {
    failCheck("SSH Diagnostics", "Container-level audit prerequisites", "Missing SSH credential inputs.", {
      missingEnvVars: missing,
    });
    markAccessBlockedSubsystems("Missing SSH credential inputs.", { missingEnvVars: missing, mode });
    return;
  }

  const sshHost = String(options.sshHost).toLowerCase();
  if (REFUSED_HOSTS.has(sshHost) || !ALLOWED_HOSTS.has(sshHost)) {
    failCheck("SSH Diagnostics", "SSH host safety", `Refusing unapproved SSH host ${sshHost}.`, { sshHost });
    return;
  }

  try {
    const hostname = runSsh(options, "hostname", { timeoutMs: 30000 }).trim();
    passCheck("SSH Diagnostics", "SSH access", "SSH command execution succeeded.", {
      sshHost,
      remoteHostname: hostname,
      sshUserConfigured: true,
      sshKeyConfigured: true,
    });
  } catch (error) {
    failCheck("SSH Diagnostics", "SSH access", errorMessage(error), {
      sshHost,
      sshUserConfigured: Boolean(options.sshUser),
      sshKeyConfigured: Boolean(options.sshKeyPath || options.sshPrivateKey),
    });
    markAccessBlockedSubsystems("SSH command execution failed.", { sshHost, mode });
    return;
  }

  await runHostDockerChecks(options, executor);
  await runHostContainerProbe(options, executor);
  await runHostDiskAndLogChecks(options, executor);
}

function markAccessBlockedSubsystems(reason, evidence) {
  const blockedChecks = [
    ["Docker Containers", "Live container inspection"],
    ["Traefik Routing", "Live routing labels/container state"],
    ["Environment Variables", "Container env inventory"],
    ["Database Connectivity", "DB host/query confirmation"],
    ["Storage Connectivity", "Storage write/read/delete"],
    ["Mounted Volumes", "Live volume mount inspection"],
    ["Runtime Tooling", "OCR/PDF tool checks"],
    ["Filesystem Permissions", "Container temp/storage permissions"],
    ["Logging/Error Reporting", "Docker log inspection"],
    ["Disk Space", "Remote filesystem usage"],
    ["Queue/Job Systems", "Queue and worker state"],
  ];

  for (const [subsystem, name] of blockedChecks) {
    failCheck(subsystem, name, `Not verified: ${reason}`, evidence);
  }
}

function markContainerHostOnlyUnavailable(reason, evidence) {
  const unavailableChecks = [
    ["Docker Containers", "Host Docker container inventory"],
    ["Traefik Routing", "Host Traefik labels/container state"],
    ["Mounted Volumes", "Host volume mount inspection"],
    ["Logging/Error Reporting", "Host Docker log inspection"],
    ["Disk Space", "Host filesystem usage"],
  ];

  for (const [subsystem, name] of unavailableChecks) {
    warnCheck(subsystem, name, `Not verified: ${reason}`, evidence);
  }
}

async function runHostDockerChecks(options, executor) {
  let allContainers = [];
  try {
    const output = executor.run("docker ps -a --format '{{json .}}'");
    allContainers = parseJsonLines(output);
    const stagingContainers = allContainers.filter((row) => String(row.Names ?? "").includes("creditregulatorpro-staging"));
    if (stagingContainers.length > 0) {
      passCheck("Docker Containers", "Staging container inventory", `${stagingContainers.length} staging container(s) found.`, {
        containers: stagingContainers.map((row) => ({
          name: row.Names,
          image: row.Image,
          status: row.Status,
          ports: row.Ports,
        })),
      });
    } else {
      failCheck("Docker Containers", "Staging container inventory", "No creditregulatorpro-staging containers found.", {});
    }
  } catch (error) {
    failCheck("Docker Containers", "Docker ps", errorMessage(error), {});
    return;
  }

  for (const containerName of [options.appContainer, options.workerContainer]) {
    try {
      const inspect = JSON.parse(executor.run(`docker inspect ${shellQuote(containerName)}`))[0];
      const running = inspect?.State?.Running === true;
      const status = inspect?.State?.Status ?? "unknown";
      if (running) {
        passCheck("Docker Containers", `${containerName} running`, `Container status is ${status}.`, dockerContainerSummary(inspect));
      } else {
        failCheck("Docker Containers", `${containerName} running`, `Container status is ${status}.`, dockerContainerSummary(inspect));
      }

      checkContainerMapping(containerName, inspect);
      checkTraefikLabels(containerName, inspect);
      checkMountedVolumes(containerName, inspect);
    } catch (error) {
      failCheck("Docker Containers", `${containerName} inspect`, errorMessage(error), { containerName });
    }
  }

  const traefikRows = allContainers.filter((row) => /traefik/i.test(String(row.Names ?? row.Image ?? "")));
  if (traefikRows.length > 0) {
    passCheck("Traefik Routing", "Traefik container visibility", `${traefikRows.length} Traefik container(s) visible.`, {
      containers: traefikRows.map((row) => ({ name: row.Names, image: row.Image, status: row.Status })),
    });
  } else {
    warnCheck("Traefik Routing", "Traefik container visibility", "No Traefik container matched by docker ps; routing labels and public HTTPS are checked separately.", {});
  }
}

function dockerContainerSummary(inspect) {
  return {
    name: String(inspect?.Name ?? "").replace(/^\//, ""),
    image: inspect?.Config?.Image ?? inspect?.Image ?? null,
    restartPolicy: inspect?.HostConfig?.RestartPolicy?.Name ?? null,
    networkMode: inspect?.HostConfig?.NetworkMode ?? null,
    workingDir: inspect?.Config?.WorkingDir ?? null,
    command: Array.isArray(inspect?.Config?.Cmd) ? inspect.Config.Cmd.join(" ") : inspect?.Config?.Cmd ?? null,
    portBindings: inspect?.HostConfig?.PortBindings ?? {},
  };
}

function checkContainerMapping(containerName, inspect) {
  const summary = dockerContainerSummary(inspect);
  const expectedNetworkMode = "host";
  const networkOk = summary.networkMode === expectedNetworkMode;
  if (networkOk) {
    passCheck("Container Mapping", `${containerName} network mode`, `network_mode=${summary.networkMode}`, summary);
  } else {
    warnCheck("Container Mapping", `${containerName} network mode`, `Expected host network mode, saw ${summary.networkMode ?? "unknown"}.`, summary);
  }
}

function checkTraefikLabels(containerName, inspect) {
  if (containerName !== DEFAULT_APP_CONTAINER) return;
  const labels = inspect?.Config?.Labels ?? {};
  const requiredLabels = [
    "traefik.enable",
    "traefik.http.routers.creditregulatorpro-staging.rule",
    "traefik.http.routers.creditregulatorpro-staging.entrypoints",
    "traefik.http.routers.creditregulatorpro-staging.tls",
    "traefik.http.services.creditregulatorpro-staging.loadbalancer.server.port",
  ];
  const missing = requiredLabels.filter((key) => labels[key] == null);
  const evidence = {
    missingLabels: missing,
    routerRule: labels["traefik.http.routers.creditregulatorpro-staging.rule"] ?? null,
    entrypoints: labels["traefik.http.routers.creditregulatorpro-staging.entrypoints"] ?? null,
    tls: labels["traefik.http.routers.creditregulatorpro-staging.tls"] ?? null,
    servicePort: labels["traefik.http.services.creditregulatorpro-staging.loadbalancer.server.port"] ?? null,
  };
  if (missing.length === 0) {
    passCheck("Traefik Routing", "App Traefik labels", "Required staging routing labels are present.", evidence);
  } else {
    failCheck("Traefik Routing", "App Traefik labels", "Missing required Traefik labels.", evidence);
  }
}

function checkMountedVolumes(containerName, inspect) {
  const mounts = Array.isArray(inspect?.Mounts) ? inspect.Mounts : [];
  const storageMount = mounts.find((mount) => mount.Destination === "/app/document-storage");
  if (storageMount) {
    passCheck("Mounted Volumes", `${containerName} document storage mount`, "Document storage mount is present.", {
      type: storageMount.Type,
      source: storageMount.Source,
      destination: storageMount.Destination,
      rw: storageMount.RW,
    });
  } else {
    failCheck("Mounted Volumes", `${containerName} document storage mount`, "Missing /app/document-storage mount.", {
      mounts: mounts.map((mount) => ({ type: mount.Type, source: mount.Source, destination: mount.Destination, rw: mount.RW })),
    });
  }
}

async function runHostContainerProbe(options, executor) {
  const probe = buildContainerProbe();
  let result;
  try {
    const output = executor.run(
      `docker exec -i -w /app ${shellQuote(options.appContainer)} node --input-type=module`,
      { input: probe, timeoutMs: Math.max(options.timeoutMs, 60000) },
    );
    result = JSON.parse(output);
  } catch (error) {
    failCheck("Runtime Probe", "Container runtime probe", errorMessage(error), { container: options.appContainer });
    return;
  }

  evaluateEnvProbe(result.env);
  evaluateDbProbe(result.database);
  evaluateStorageProbe(result.storage);
  evaluateToolProbe(result.tools);
  evaluateFilesystemProbe(result.filesystem);
  evaluateQueueProbe(result.queues);
}

async function runContainerLocalProbe(options) {
  const probe = buildContainerProbe();
  let result;
  try {
    const output = runLocalShell(`${shellQuote(process.execPath)} --input-type=module`, {
      input: probe,
      timeoutMs: Math.max(options.timeoutMs, 60000),
    });
    result = JSON.parse(output);
  } catch (error) {
    failCheck("Runtime Probe", "Container-local runtime probe", errorMessage(error), {
      cwd: process.cwd(),
    });
    return;
  }

  evaluateEnvProbe(result.env);
  evaluateDbProbe(result.database);
  evaluateStorageProbe(result.storage);
  evaluateToolProbe(result.tools);
  evaluateFilesystemProbe(result.filesystem);
  evaluateQueueProbe(result.queues);
}

function buildContainerProbe() {
  return String.raw`
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

function envPresence(keys) {
  const result = {};
  for (const key of keys) result[key] = Boolean(process.env[key]);
  return result;
}

function storageRoot() {
  return path.resolve(process.cwd(), process.env.LOCAL_DOCUMENT_STORAGE_PATH || process.env.DOCUMENT_STORAGE_PATH || "document-storage");
}

async function canWriteReadDelete(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
  const readBack = await readFile(filePath, "utf8");
  await rm(filePath, { force: true });
  let deleted = false;
  try {
    await stat(filePath);
  } catch (error) {
    deleted = error && error.code === "ENOENT";
  }
  return { wrote: true, readBackMatches: readBack === contents, deleted };
}

function runVersion(command, args) {
  try {
    return {
      ok: true,
      path: execFileSync("sh", ["-lc", "command -v " + command], { encoding: "utf8" }).trim(),
      version: execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/)[0],
    };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) };
  }
}

async function dbProbe() {
  const databaseUrl = process.env.FLOOT_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, missingEnvVar: "FLOOT_DATABASE_URL or DATABASE_URL" };
  }
  const parsed = new URL(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5, idle_timeout: 1 });
  try {
    const rows = await sql.unsafe("select current_database() as database_name, current_user as current_user, inet_server_addr()::text as server_addr, inet_server_port() as server_port, version() as version");
    const tableRows = await sql.unsafe("select to_regclass('public.ingest_processing_job')::text as ingest_job_table, to_regclass('public.response_processing_job')::text as response_job_table, to_regclass('public.sessions')::text as sessions_table");
    const tableInfo = tableRows[0] ?? {};
    const counts = {};
    if (tableInfo.ingest_job_table) {
      counts.ingestProcessingJobs = Number((await sql.unsafe("select count(*)::int as count from ingest_processing_job"))[0]?.count ?? 0);
    }
    if (tableInfo.response_job_table) {
      counts.responseProcessingJobs = Number((await sql.unsafe("select count(*)::int as count from response_processing_job"))[0]?.count ?? 0);
    }
    if (tableInfo.sessions_table) {
      counts.sessions = Number((await sql.unsafe("select count(*)::int as count from sessions"))[0]?.count ?? 0);
    }
    return {
      ok: true,
      configuredHost: parsed.hostname,
      configuredPort: parsed.port || null,
      configuredDatabase: parsed.pathname.replace(/^\//, ""),
      databaseName: rows[0]?.database_name ?? null,
      serverAddr: rows[0]?.server_addr ?? null,
      serverPort: rows[0]?.server_port ?? null,
      version: rows[0]?.version?.split(",")[0] ?? null,
      tables: tableInfo,
      counts,
    };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error).slice(0, 500) };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function storageProbe() {
  const root = storageRoot();
  const id = randomUUID();
  const reportPath = path.join(root, "runtime-audit", id + ".txt");
  const packetPath = path.join(root, "packet-pdfs", "runtime-audit", id + ".pdf");
  const requiredDirectoryIds = [
    "",
    "report-artifacts",
    "packet-pdfs",
    "evidence",
    "evidence/bureau-communications",
    "identification",
    "packets",
  ];
  const result = {
    root,
    reportPath,
    packetPath,
    requiredDirectories: [],
    reportArtifact: null,
    packetPdf: null,
    rootWritable: false,
  };
  for (const directoryId of requiredDirectoryIds) {
    const directoryPath = directoryId ? path.join(root, directoryId) : root;
    try {
      const entry = await stat(directoryPath);
      let writable = true;
      let accessError = null;
      try {
        await access(directoryPath, constants.W_OK);
      } catch (error) {
        writable = false;
        accessError = String(error && error.message ? error.message : error).slice(0, 300);
      }
      result.requiredDirectories.push({
        id: directoryId || "root",
        path: directoryPath,
        exists: true,
        isDirectory: entry.isDirectory(),
        writable,
        error: accessError,
      });
    } catch (error) {
      result.requiredDirectories.push({
        id: directoryId || "root",
        path: directoryPath,
        exists: false,
        isDirectory: false,
        writable: false,
        error: String(error && error.message ? error.message : error).slice(0, 300),
      });
    }
  }
  try {
    await access(root, constants.W_OK);
    result.rootWritable = true;
  } catch (error) {
    result.rootWritable = false;
    result.rootError = String(error && error.message ? error.message : error).slice(0, 300);
  }
  try {
    result.reportArtifact = await canWriteReadDelete(reportPath, "crp-runtime-audit-report-artifact");
  } catch (error) {
    result.reportArtifact = { ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) };
  }
  try {
    await access(path.join(root, "packet-pdfs"), constants.W_OK);
    result.packetPdf = await canWriteReadDelete(packetPath, "%PDF-1.4\n% crp-runtime-audit\n");
  } catch (error) {
    result.packetPdf = { ok: false, error: String(error && error.message ? error.message : error).slice(0, 300) };
  }
  return result;
}

async function filesystemProbe() {
  const tmpRoot = os.tmpdir();
  const tmpPath = path.join(tmpRoot, "crp-runtime-audit-" + randomUUID() + ".tmp");
  const result = {
    cwd: process.cwd(),
    tmpRoot,
    tmpWritable: false,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    diskUsage: [],
  };
  try {
    const io = await canWriteReadDelete(tmpPath, "crp-runtime-audit-temp");
    result.tmpWritable = io.wrote && io.readBackMatches && io.deleted;
  } catch (error) {
    result.tmpWritable = false;
    result.tmpError = String(error && error.message ? error.message : error).slice(0, 300);
  }
  try {
    result.diskUsage = parseDf(execFileSync("df", ["-P", "-k", "/", tmpRoot, storageRoot()], { encoding: "utf8" }));
  } catch (error) {
    result.diskError = String(error && error.message ? error.message : error).slice(0, 300);
  }
  return result;
}

function parseDf(output) {
  const lines = String(output ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(1).map((line) => {
    const parts = line.split(/\s+/);
    return {
      filesystem: parts[0],
      sizeKb: Number(parts[1] ?? 0),
      usedKb: Number(parts[2] ?? 0),
      availableKb: Number(parts[3] ?? 0),
      usePercent: Number(String(parts[4] ?? "0").replace("%", "")),
      mountedOn: parts.slice(5).join(" "),
    };
  });
}

const envKeys = [
  "NODE_ENV",
  "CRP_ENV",
  "PORT",
  "JWT_SECRET",
  "DATABASE_URL",
  "FLOOT_DATABASE_URL",
  "LOCAL_DOCUMENT_STORAGE_PATH",
  "DOCUMENT_STORAGE_PATH",
  "CRP_DETERMINISTIC_OCR_ENABLED",
  "GOOGLE_GEMINI_SA_KEY",
  "OPENAI_API_KEY",
  "SENDGRID_API_KEY",
  "POSTGRID_API_KEY",
  "STRIPE_SECRET_KEY",
];

const report = {
  env: {
    presence: envPresence(envKeys),
    nodeEnv: process.env.NODE_ENV || null,
    crpEnv: process.env.CRP_ENV || null,
    port: process.env.PORT || null,
    deterministicOcrEnabled: process.env.CRP_DETERMINISTIC_OCR_ENABLED || null,
    storageRoot: storageRoot(),
    missingCore: [],
  },
  database: await dbProbe(),
  storage: await storageProbe(),
  filesystem: await filesystemProbe(),
  tools: {
    node: { ok: true, version: process.version },
    pnpm: runVersion("pnpm", ["--version"]),
    tesseract: runVersion("tesseract", ["--version"]),
    pdftoppm: runVersion("pdftoppm", ["-v"]),
  },
  queues: { ok: true },
};

for (const key of ["NODE_ENV", "PORT", "JWT_SECRET"]) {
  if (!report.env.presence[key]) report.env.missingCore.push(key);
}
if (!report.env.presence.FLOOT_DATABASE_URL && !report.env.presence.DATABASE_URL) {
  report.env.missingCore.push("FLOOT_DATABASE_URL or DATABASE_URL");
}
if (!report.env.presence.LOCAL_DOCUMENT_STORAGE_PATH && !report.env.presence.DOCUMENT_STORAGE_PATH) {
  report.env.missingCore.push("LOCAL_DOCUMENT_STORAGE_PATH or DOCUMENT_STORAGE_PATH");
}
if (!report.env.presence.CRP_DETERMINISTIC_OCR_ENABLED) {
  report.env.missingCore.push("CRP_DETERMINISTIC_OCR_ENABLED");
}
report.queues.databaseCounts = report.database.ok ? report.database.counts : null;
console.log(JSON.stringify(report));
`;
}

function evaluateEnvProbe(env) {
  const missing = env?.missingCore ?? [];
  if (missing.length === 0) {
    passCheck("Environment Variables", "Core runtime env", "Required core env vars are present.", {
      nodeEnv: env.nodeEnv,
      crpEnv: env.crpEnv,
      port: env.port,
      deterministicOcrEnabled: env.deterministicOcrEnabled,
      storageRoot: env.storageRoot,
      databaseUrlEnvPresent: Boolean(env.presence?.FLOOT_DATABASE_URL || env.presence?.DATABASE_URL),
      providerKeysPresent: providerPresence(env.presence),
    });
  } else {
    failCheck("Environment Variables", "Core runtime env", "Missing required runtime env vars.", {
      missingEnvVars: missing,
      nodeEnv: env?.nodeEnv ?? null,
      crpEnv: env?.crpEnv ?? null,
      port: env?.port ?? null,
    });
  }

  if (env?.deterministicOcrEnabled === "true") {
    passCheck("Parser/OCR Configuration", "Deterministic OCR flag", "CRP_DETERMINISTIC_OCR_ENABLED=true", {});
  } else {
    failCheck("Parser/OCR Configuration", "Deterministic OCR flag", "CRP_DETERMINISTIC_OCR_ENABLED is not true.", {
      value: env?.deterministicOcrEnabled ?? null,
    });
  }
}

function providerPresence(presence = {}) {
  return {
    GOOGLE_GEMINI_SA_KEY: Boolean(presence.GOOGLE_GEMINI_SA_KEY),
    OPENAI_API_KEY: Boolean(presence.OPENAI_API_KEY),
    SENDGRID_API_KEY: Boolean(presence.SENDGRID_API_KEY),
    POSTGRID_API_KEY: Boolean(presence.POSTGRID_API_KEY),
    STRIPE_SECRET_KEY: Boolean(presence.STRIPE_SECRET_KEY),
  };
}

function evaluateDbProbe(database) {
  if (database?.ok) {
    passCheck("Database Connectivity", "Postgres query", "Database connection and read query succeeded.", {
      configuredHost: database.configuredHost,
      configuredPort: database.configuredPort,
      configuredDatabase: database.configuredDatabase,
      serverAddr: database.serverAddr,
      serverPort: database.serverPort,
      databaseName: database.databaseName,
      version: database.version,
    });
  } else {
    failCheck("Database Connectivity", "Postgres query", database?.missingEnvVar ? "Database env var is missing." : database?.error ?? "Unknown database failure.", {
      missingEnvVar: database?.missingEnvVar,
    });
  }
}

function storageIoOk(entry) {
  return entry?.wrote === true && entry?.readBackMatches === true && entry?.deleted === true;
}

function evaluateStorageProbe(storage) {
  const requiredDirectories = Array.isArray(storage?.requiredDirectories) ? storage.requiredDirectories : [];
  for (const directory of requiredDirectories) {
    const ok = directory.exists === true && directory.isDirectory === true && directory.writable === true;
    const name = `Required storage directory ${directory.id}`;
    if (ok) {
      passCheck("Storage Connectivity", name, "Required storage directory exists and is writable.", {
        path: directory.path,
      });
    } else {
      failCheck(
        "Storage Connectivity",
        name,
        directory.error ?? "Required storage directory is missing, not a directory, or not writable.",
        {
          path: directory.path,
          exists: directory.exists,
          isDirectory: directory.isDirectory,
          writable: directory.writable,
        },
      );
    }
  }

  if (storage?.rootWritable) {
    passCheck("Storage Connectivity", "Storage root writable", "Storage root is writable.", { path: storage.root });
  } else {
    failCheck("Storage Connectivity", "Storage root writable", storage?.rootError ?? "Storage root is not writable.", { path: storage?.root });
  }

  if (storageIoOk(storage?.reportArtifact)) {
    passCheck("Storage Connectivity", "Report artifact write/read/delete", "Storage write/read/delete succeeded.", {
      path: storage.reportPath,
    });
  } else {
    failCheck("Storage Connectivity", "Report artifact write/read/delete", storage?.reportArtifact?.error ?? "Storage round-trip failed.", {
      path: storage?.reportPath,
    });
  }

  if (storageIoOk(storage?.packetPdf)) {
    passCheck("Storage Connectivity", "Generated PDF write/read/delete", "Generated PDF path write/read/delete succeeded.", {
      path: storage.packetPath,
    });
  } else {
    failCheck("Storage Connectivity", "Generated PDF write/read/delete", storage?.packetPdf?.error ?? "Generated PDF round-trip failed.", {
      path: storage?.packetPath,
    });
  }
}

function evaluateToolProbe(tools) {
  for (const [name, tool] of Object.entries(tools ?? {})) {
    if (tool?.ok) {
      passCheck("Runtime Tooling", name, `${name} is available.`, {
        path: tool.path ?? null,
        version: tool.version ?? null,
      });
    } else {
      failCheck("Runtime Tooling", name, `${name} is unavailable.`, {
        error: tool?.error ?? null,
      });
    }
  }
}

function evaluateFilesystemProbe(filesystem) {
  if (filesystem?.tmpWritable) {
    passCheck("Filesystem Permissions", "Temp directory write/read/delete", "Temp directory round-trip succeeded.", {
      tmpRoot: filesystem.tmpRoot,
      cwd: filesystem.cwd,
      uid: filesystem.uid,
    });
  } else {
    failCheck("Filesystem Permissions", "Temp directory write/read/delete", filesystem?.tmpError ?? "Temp directory is not writable.", {
      tmpRoot: filesystem?.tmpRoot,
      cwd: filesystem?.cwd,
    });
  }

  const rows = Array.isArray(filesystem?.diskUsage) ? filesystem.diskUsage : [];
  if (rows.length > 0) {
    for (const row of rows) {
      if (row.usePercent >= 95) {
        failCheck("Disk Space", `Container disk usage ${row.mountedOn}`, `Container disk usage is ${row.usePercent}%.`, row);
      } else if (row.usePercent >= 85) {
        warnCheck("Disk Space", `Container disk usage ${row.mountedOn}`, `Container disk usage is ${row.usePercent}%.`, row);
      } else {
        passCheck("Disk Space", `Container disk usage ${row.mountedOn}`, `Container disk usage is ${row.usePercent}%.`, row);
      }
    }
  } else {
    warnCheck("Disk Space", "Container filesystem usage", filesystem?.diskError ?? "Container df rows unavailable.", {
      cwd: filesystem?.cwd,
    });
  }
}

function evaluateQueueProbe(queues) {
  const counts = queues?.databaseCounts;
  if (counts) {
    passCheck("Queue/Job Systems", "Queue tables reachable", "Queue/session table counts were readable.", counts);
  } else {
    warnCheck("Queue/Job Systems", "Queue tables reachable", "Queue counts unavailable because database probe did not complete.", {});
  }
}

async function runHostDiskAndLogChecks(options, executor) {
  try {
    const paths = ["/", "/tmp", options.remoteAppDir, `${options.remoteAppDir}/document-storage`, `${options.remoteAppDir}/document-storage/packet-pdfs`];
    const output = executor.run(`df -P -k ${paths.map(shellQuote).join(" ")} 2>/dev/null || true`);
    const rows = parseDf(output);
    if (rows.length === 0) {
      warnCheck("Disk Space", "Filesystem usage", "No df rows returned.", { paths });
    }
    for (const row of rows) {
      if (row.usePercent >= 95) {
        failCheck("Disk Space", `Disk usage ${row.mountedOn}`, `Disk usage is ${row.usePercent}%.`, row);
      } else if (row.usePercent >= 85) {
        warnCheck("Disk Space", `Disk usage ${row.mountedOn}`, `Disk usage is ${row.usePercent}%.`, row);
      } else {
        passCheck("Disk Space", `Disk usage ${row.mountedOn}`, `Disk usage is ${row.usePercent}%.`, row);
      }
    }
  } catch (error) {
    failCheck("Disk Space", "Filesystem usage", errorMessage(error), {});
  }

  try {
    const appLogs = executor.run(`docker logs --tail=${Number(options.logTail)} ${shellQuote(options.appContainer)} 2>&1 || true`);
    const workerLogs = executor.run(`docker logs --tail=${Number(options.logTail)} ${shellQuote(options.workerContainer)} 2>&1 || true`);
    analyzeLogs("App container logs", appLogs);
    analyzeLogs("Worker container logs", workerLogs);
  } catch (error) {
    failCheck("Logging/Error Reporting", "Docker log tail", errorMessage(error), {});
  }
}

function parseJsonLines(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseDf(output) {
  const lines = String(output ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(1).map((line) => {
    const parts = line.split(/\s+/);
    const usePercent = Number(String(parts[4] ?? "0").replace("%", ""));
    return {
      filesystem: parts[0],
      sizeKb: Number(parts[1] ?? 0),
      usedKb: Number(parts[2] ?? 0),
      availableKb: Number(parts[3] ?? 0),
      usePercent,
      mountedOn: parts.slice(5).join(" "),
    };
  });
}

function analyzeLogs(name, logText) {
  const lines = String(logText ?? "").split(/\r?\n/).filter(Boolean);
  const fatal = lines.filter((line) => /UnhandledPromiseRejection|uncaught exception|fatal error|out of memory/i.test(line));
  const storageNotFound = lines.filter((line) => /storage_read_failed:not_found/i.test(line));
  const warnings = lines.filter((line) => /\bwarn(?:ing)?\b|vite/i.test(line));
  const errors = lines.filter((line) => /\berror\b|exception|5\d\d/i.test(line));

  if (storageNotFound.length > 0) {
    warnCheck("Logging/Error Reporting", `${name} storage_read_failed:not_found scan`, `${storageNotFound.length} storage_read_failed:not_found log line(s) found.`, {
      samples: storageNotFound.slice(-5).map(sanitizeLine),
    });
  } else {
    passCheck("Logging/Error Reporting", `${name} storage_read_failed:not_found scan`, `No storage_read_failed:not_found entries in ${lines.length} tailed line(s).`, {
      linesAnalyzed: lines.length,
      rawLogsPrinted: false,
    });
  }

  if (fatal.length > 0) {
    failCheck("Logging/Error Reporting", name, `${fatal.length} fatal/unhandled log line(s) found.`, {
      samples: fatal.slice(-5).map(sanitizeLine),
    });
  } else if (errors.length > 0) {
    warnCheck("Logging/Error Reporting", name, `${errors.length} non-fatal error-like log line(s) found in tail window.`, {
      samples: errors.slice(-5).map(sanitizeLine),
    });
  } else if (warnings.length > 0) {
    warnCheck("Logging/Error Reporting", name, `${warnings.length} warning/Vite-like log line(s) found in tail window.`, {
      samples: warnings.slice(-5).map(sanitizeLine),
    });
  } else {
    passCheck("Logging/Error Reporting", name, `No fatal/error/warning patterns in ${lines.length} tailed line(s).`, {
      linesAnalyzed: lines.length,
      rawLogsPrinted: false,
    });
  }
}

function expectedComposeMapping() {
  const composePath = path.join(process.cwd(), "docker-compose.yml");
  if (!existsSync(composePath)) return;
  const compose = readFileSync(composePath, "utf8");
  const evidence = {
    file: "docker-compose.yml",
    appContainer: DEFAULT_APP_CONTAINER,
    workerContainer: DEFAULT_WORKER_CONTAINER,
    appPort: "3334",
    storageMount: "./document-storage:/app/document-storage",
    networkMode: compose.includes("network_mode: host") ? "host" : "not detected",
    traefikHostRule: compose.match(/Host\(`([^`]+)`\)/)?.[1] ?? null,
  };
  passCheck("Container Mapping", "Expected compose mapping", "Local compose mapping inventoried.", evidence);
}

function buildReport(options) {
  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;
  const accessFailure = checks.some((check) =>
    check.status === "FAIL" && ["SSH Diagnostics", "Audit Access"].includes(check.subsystem)
  );
  const completion =
    options.executionMode === "public-only"
      ? "PUBLIC_ONLY_PARTIAL_PASS"
      : accessFailure
        ? "AUDIT_ACCESS_FAILURE"
        : failCount > 0
          ? "PLATFORM_FAILURE"
          : options.executionMode === "container-local"
            ? "CONTAINER_LOCAL_PARTIAL_PASS"
            : warnCount > 0
              ? "FULL_RUNTIME_PASS_WITH_WARNINGS"
              : "FULL_RUNTIME_PASS";
  const status =
    failCount > 0
      ? "FAIL"
      : options.executionMode === "public-only"
        ? "PARTIAL"
        : warnCount > 0
          ? "WARN"
          : "PASS";
  return {
    audit: "CreditRegulatorPro Level 2 Runtime/System Audit",
    mode: options.executionMode,
    completion,
    target: {
      baseUrl: options.baseUrl,
      sshHost: options.sshHost,
      appContainer: options.appContainer,
      workerContainer: options.workerContainer,
      remoteAppDir: options.remoteAppDir,
    },
    status,
    summary: {
      pass: checks.filter((check) => check.status === "PASS").length,
      warn: warnCount,
      fail: failCount,
    },
    checks,
    findings,
    safety: {
      readOnly: true,
      platformDataReset: false,
      infrastructureModified: false,
      schemasModified: false,
      secretsPrinted: false,
      rawLogsPrinted: false,
    },
  };
}

function printReport(report) {
  console.log(report.audit);
  console.log(`Mode: ${report.mode}`);
  console.log(`Completion: ${report.completion}`);
  console.log(`Target: ${report.target.baseUrl}`);
  console.log(`Status: ${report.status} (${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail)`);
  console.log("");
  for (const subsystem of [...new Set(report.checks.map((check) => check.subsystem))]) {
    console.log(subsystem);
    for (const check of report.checks.filter((entry) => entry.subsystem === subsystem)) {
      console.log(`- [${check.status}] ${check.name}${check.details ? `: ${check.details}` : ""}`);
      const evidence = compactEvidence(check.evidence);
      if (Object.keys(evidence).length > 0) {
        console.log(`  evidence=${JSON.stringify(evidence)}`);
      }
    }
    console.log("");
  }
}

function compactEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return {};
  return JSON.parse(JSON.stringify(evidence, (_key, value) => {
    if (Array.isArray(value) && value.length > 8) return value.slice(0, 8);
    return value;
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    options.executionMode = resolveExecutionMode(options);
    validateTargetUrl(options.baseUrl, options.allowLocal);
    expectedComposeMapping();
    await runPublicChecks(options);
    await runRuntimeChecks(options, options.executionMode);
    const report = buildReport(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    process.exit(report.status === "FAIL" ? 1 : 0);
  } catch (error) {
    failCheck("Audit Runner", "Runtime audit", errorMessage(error), {});
    const report = buildReport(options);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
    process.exit(1);
  } finally {
    cleanupTempKey();
  }
}

main();
