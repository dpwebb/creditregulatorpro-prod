import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import type {
  MockLifecycleCoverageSummary,
  MockLifecycleJobRecord,
  MockLifecycleRunConfig,
} from "./types";

const PROJECT_ROOT = process.cwd();
const JOBS_DIR = path.resolve(PROJECT_ROOT, ".local/test-runs/admin-jobs");
const RUNS_DIR = path.resolve(PROJECT_ROOT, ".local/test-runs/admin-ui");
const FIXTURE_UPLOADS_DIR = path.resolve(PROJECT_ROOT, ".local/test-runs/admin-fixtures");
const LOG_LIMIT = 600;

const FORBIDDEN_ACTIVE_ROOTS = [
  path.resolve("C:\\Users\\webbd\\OneDrive"),
  path.resolve("C:\\Users\\webbd\\My Drive"),
];

function isWithinPath(candidate: string, root: string): boolean {
  const normalizedCandidate = path.normalize(candidate).toLowerCase();
  const normalizedRoot = path.normalize(root).toLowerCase();
  if (normalizedCandidate === normalizedRoot) return true;
  return normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function ensureAllowedFixturePath(filePath: string, label: string): void {
  for (const forbiddenRoot of FORBIDDEN_ACTIVE_ROOTS) {
    if (isWithinPath(filePath, forbiddenRoot)) {
      throw new BusinessRuleError(
        `${label} cannot be under ${forbiddenRoot}. Use a path under ${PROJECT_ROOT}.`,
        400
      );
    }
  }
}

export async function resolveAndValidatePdfPath(
  filePath: string,
  label: "Initial report" | "Follow-up report"
): Promise<string> {
  const resolved = path.resolve(PROJECT_ROOT, filePath);

  ensureAllowedFixturePath(resolved, label);

  if (path.extname(resolved).toLowerCase() !== ".pdf") {
    throw new BusinessRuleError(`${label} must be a PDF file path.`, 400);
  }

  try {
    await access(resolved);
  } catch {
    throw new BusinessRuleError(
      `${label} file not found: ${resolved}. Upload the PDF in Admin Lifecycle UI or provide a valid server-local path.`,
      400
    );
  }

  return resolved;
}

export type UploadedFixtureInput = {
  fileName: string;
  mimeType?: string;
  bytesBase64: string;
};

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^\w.\- ]+/g, "_").trim();
  return base || "uploaded-report.pdf";
}

export async function materializeUploadedFixture(
  input: UploadedFixtureInput,
  label: "initial" | "followup"
): Promise<string> {
  const safeName = sanitizeFileName(input.fileName);
  const ext = path.extname(safeName).toLowerCase();
  if (ext !== ".pdf") {
    throw new BusinessRuleError("Uploaded fixture must be a PDF file.", 400);
  }

  if (input.mimeType && !input.mimeType.toLowerCase().includes("pdf")) {
    throw new BusinessRuleError("Uploaded fixture mimeType must be application/pdf.", 400);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.bytesBase64, "base64");
  } catch {
    throw new BusinessRuleError("Uploaded fixture has invalid base64 content.", 400);
  }

  if (!bytes.length) {
    throw new BusinessRuleError("Uploaded fixture is empty.", 400);
  }

  await mkdir(FIXTURE_UPLOADS_DIR, { recursive: true });

  const stampedName = `${label}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}-${safeName}`;
  const targetPath = path.resolve(FIXTURE_UPLOADS_DIR, stampedName);
  await writeFile(targetPath, bytes);

  return targetPath;
}

async function persistJob(job: MockLifecycleJobRecord): Promise<void> {
  await mkdir(JOBS_DIR, { recursive: true });
  const filePath = path.resolve(JOBS_DIR, `${job.jobId}.json`);
  await writeFile(filePath, JSON.stringify(job, null, 2), "utf8");
}

function appendLog(job: MockLifecycleJobRecord, line: string): void {
  if (!line.trim()) return;
  job.logs.push(line);
  if (job.logs.length > LOG_LIMIT) {
    job.logs = job.logs.slice(job.logs.length - LOG_LIMIT);
  }
}

async function findReportOutputs(runOutputDir: string): Promise<{
  jsonReportPath: string | null;
  markdownReportPath: string | null;
}> {
  try {
    const entries = await readdir(runOutputDir, { withFileTypes: true });
    const fileNames = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.startsWith("mock-user-lifecycle-full-suite-"));

    const jsonNames = fileNames
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse();
    const markdownNames = fileNames
      .filter((name) => name.endsWith(".md"))
      .sort()
      .reverse();

    return {
      jsonReportPath: jsonNames[0] ? path.resolve(runOutputDir, jsonNames[0]) : null,
      markdownReportPath: markdownNames[0]
        ? path.resolve(runOutputDir, markdownNames[0])
        : null,
    };
  } catch {
    return {
      jsonReportPath: null,
      markdownReportPath: null,
    };
  }
}

async function readCoverageSummary(
  jsonReportPath: string | null
): Promise<MockLifecycleCoverageSummary | null> {
  if (!jsonReportPath) return null;
  try {
    const text = await readFile(jsonReportPath, "utf8");
    const parsed = JSON.parse(text) as { coverageSummary?: MockLifecycleCoverageSummary };
    return parsed.coverageSummary ?? null;
  } catch {
    return null;
  }
}

function buildLifecycleScriptArgs(input: MockLifecycleRunConfig, runOutputDir: string): string[] {
  const args = [
    "--initial-report",
    input.initialReportPath,
    "--followup-report",
    input.followupReportPath,
    "--base-url",
    input.baseUrl,
    "--origin",
    input.origin,
    "--simulate-days",
    String(input.simulateDays),
    "--packet-count",
    String(input.packetCount),
    "--output-dir",
    runOutputDir,
  ];

  if (input.strict) {
    args.push("--strict");
  }
  if (!input.useDbAssist) {
    args.push("--no-db-assist");
  }
  if (input.email) {
    args.push("--email", input.email);
  }
  if (input.password) {
    args.push("--password", input.password);
  }
  if (input.displayName) {
    args.push("--display-name", input.displayName);
  }
  if (input.legalNameSignature) {
    args.push("--legal-name-signature", input.legalNameSignature);
  }

  return args;
}

export async function startMockLifecycleJob(input: {
  runConfig: MockLifecycleRunConfig;
  initiatedByUserId: number;
  initiatedByEmail: string;
}): Promise<MockLifecycleJobRecord> {
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(RUNS_DIR, { recursive: true });

  const jobId = `mock-lifecycle-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const runOutputDir = path.resolve(RUNS_DIR, jobId);
  await mkdir(runOutputDir, { recursive: true });

  const job: MockLifecycleJobRecord = {
    jobId,
    status: "QUEUED",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    initiatedByUserId: input.initiatedByUserId,
    initiatedByEmail: input.initiatedByEmail,
    input: input.runConfig,
    runOutputDir,
    jsonReportPath: null,
    markdownReportPath: null,
    coverageSummary: null,
    error: null,
    logs: [],
  };

  await persistJob(job);

  const tsxCliPath = path.resolve(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  try {
    await access(tsxCliPath);
  } catch {
    throw new BusinessRuleError(
      "Lifecycle runner dependency missing: node_modules/tsx/dist/cli.mjs not found.",
      500
    );
  }

  const lifecycleArgs = buildLifecycleScriptArgs(input.runConfig, runOutputDir);
  const command = process.execPath;
  const args = [tsxCliPath, "scripts/mock-user-lifecycle-e2e.ts", ...lifecycleArgs];
  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  job.status = "RUNNING";
  job.startedAt = new Date().toISOString();
  appendLog(job, `[runner] Command: ${command} ${args.join(" ")}`);
  await persistJob(job);

  let persistQueue = Promise.resolve();
  const queuePersist = () => {
    persistQueue = persistQueue
      .then(() => persistJob(job))
      .catch(() => undefined);
  };

  const bindStream = (stream: NodeJS.ReadableStream, prefix: "[stdout]" | "[stderr]") => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        appendLog(job, `${prefix} ${line}`);
      }
      queuePersist();
    });
    stream.on("end", () => {
      if (buffer.trim()) {
        appendLog(job, `${prefix} ${buffer}`);
      }
      queuePersist();
    });
  };

  bindStream(child.stdout, "[stdout]");
  bindStream(child.stderr, "[stderr]");

  child.on("error", (error) => {
    job.status = "FAILED";
    job.completedAt = new Date().toISOString();
    job.error = `Runner failed to start: ${error.message}`;
    appendLog(job, `[runner] ${job.error}`);
    queuePersist();
  });

  child.on("close", async (code, signal) => {
    const outputs = await findReportOutputs(runOutputDir);
    job.jsonReportPath = outputs.jsonReportPath;
    job.markdownReportPath = outputs.markdownReportPath;
    job.coverageSummary = await readCoverageSummary(outputs.jsonReportPath);
    job.completedAt = new Date().toISOString();

    if (code === 0) {
      job.status = "COMPLETED";
      appendLog(job, "[runner] Suite completed successfully.");
    } else {
      job.status = "FAILED";
      job.error = `Suite exited with code ${code ?? "unknown"}${signal ? ` (signal: ${signal})` : ""}.`;
      appendLog(job, `[runner] ${job.error}`);
    }

    queuePersist();
    await persistQueue;
  });

  return job;
}

function assertSafeJobId(jobId: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(jobId)) {
    throw new BusinessRuleError("Invalid jobId format.", 400);
  }
}

export async function getMockLifecycleJob(jobId: string): Promise<MockLifecycleJobRecord | null> {
  assertSafeJobId(jobId);
  const filePath = path.resolve(JOBS_DIR, `${jobId}.json`);

  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text) as MockLifecycleJobRecord;
  } catch {
    return null;
  }
}

export async function listMockLifecycleJobs(limit: number): Promise<MockLifecycleJobRecord[]> {
  try {
    const entries = await readdir(JOBS_DIR, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    const jobs: MockLifecycleJobRecord[] = [];
    for (const fileName of files) {
      try {
        const filePath = path.resolve(JOBS_DIR, fileName);
        const text = await readFile(filePath, "utf8");
        jobs.push(JSON.parse(text) as MockLifecycleJobRecord);
      } catch {
        continue;
      }
      if (jobs.length >= limit) break;
    }

    jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jobs;
  } catch {
    return [];
  }
}

export async function getMockLifecycleReport(jobId: string): Promise<Record<string, unknown> | null> {
  const job = await getMockLifecycleJob(jobId);
  if (!job?.jsonReportPath) return null;

  try {
    const text = await readFile(job.jsonReportPath, "utf8");
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
