import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import type { InputType as LogInput } from "./log_POST.schema";
import type { InputType as PromptInput } from "./prompt_POST.schema";

export const BETA_TESTING_HUB_STAGING_HOST = "staging.creditregulatorpro.com";
export const BETA_READINESS_COMMAND = "pnpm run beta-live:certify";
export const BETA_READINESS_AUTHORITY = "SAFE_FOR_BETA_LIVE=true/false";

const BETA_LOG_DIR = path.join(process.cwd(), ".local", "beta-testing-hub");
const BETA_LOG_FILE = path.join(BETA_LOG_DIR, "codex-reports.jsonl");

function firstForwardedHeader(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
}

export function requestHost(request: Request): string {
  const url = new URL(request.url);
  const host =
    firstForwardedHeader(request.headers.get("x-forwarded-host")) ||
    firstForwardedHeader(request.headers.get("host")) ||
    url.host;
  return normalizeHost(host);
}

export function isLiveStagingRequest(request: Request): boolean {
  return requestHost(request) === BETA_TESTING_HUB_STAGING_HOST;
}

export function assertLiveStagingRequest(request: Request): void {
  if (!isLiveStagingRequest(request)) {
    throw new BusinessRuleError("Beta Testing Hub is available on live staging only.", 403);
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function valueOrFallback(value: string | undefined, fallback = "Not provided."): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function buildBetaIssueId(input: PromptInput, generatedAt: string): string {
  const compactTimestamp = generatedAt.replace(/\D/g, "").slice(0, 14) || "unknown";
  const hash = hashText([input.title, input.observed, generatedAt].join("\0")).slice(0, 8);
  return `beta-${compactTimestamp}-${hash}`;
}

export function buildBetaCodexPrompt(input: PromptInput, issueId: string, generatedAt: string): string {
  return [
    "You are Codex working in the existing CreditRegulatorPro staging repository.",
    "",
    "Objective:",
    "Implement the smallest safe fix for the beta issue below.",
    "",
    "Beta issue:",
    `- Issue ID: ${issueId}`,
    `- Generated: ${generatedAt}`,
    `- Severity: ${input.severity}`,
    `- Area: ${valueOrFallback(input.area)}`,
    `- Live staging URL: ${valueOrFallback(input.stagingUrl)}`,
    `- Title: ${input.title}`,
    "",
    "Observed behavior:",
    valueOrFallback(input.observed),
    "",
    "Expected behavior:",
    valueOrFallback(input.expected),
    "",
    "Reproduction steps:",
    valueOrFallback(input.reproductionSteps),
    "",
    "Additional notes:",
    valueOrFallback(input.notes),
    "",
    "Beta rules:",
    "- FIX means this prompt handoff only; the hub did not change code.",
    "- Codex performs implementation separately in the staging repository.",
    "- Do not add automatic Codex integration or direct Codex calls.",
    "- Do not bypass readiness gates.",
    "- Do not mutate production data.",
    `- Final readiness authority remains: ${BETA_READINESS_COMMAND} and ${BETA_READINESS_AUTHORITY}.`,
    "",
    "Implementation constraints:",
    "- Read AGENTS.md and preserve the protected platform systems.",
    "- Keep the patch bounded and avoid unrelated refactors.",
    "- Do not touch production paths, secrets, environment files, deployment config, parser truth, violation truth, evidence binding, regulation mappings, packet truth, or schemas unless explicitly required and approved.",
    "- If the issue requires broad architectural modification, stop and report a plan with risk analysis instead of editing code.",
    "",
    "Required report back to the Beta Testing Hub:",
    "- Files changed.",
    "- Tests run and results.",
    "- Whether beta-live certification was run.",
    "- Final readiness line: SAFE_FOR_BETA_LIVE=true or SAFE_FOR_BETA_LIVE=false.",
  ].join("\n");
}

const secretPatterns: Array<[RegExp, string]> = [
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]"],
  [
    /\b(OPENAI_API_KEY|GITHUB_TOKEN|DATABASE_URL|SESSION_SECRET|STRIPE_SECRET_KEY|POSTGRES_PASSWORD)\s*=\s*[^\s]+/gi,
    "$1=[REDACTED]",
  ],
];

export function sanitizeBetaLogText(value: string): string {
  return secretPatterns.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

export async function appendBetaTestingHubReportLog({
  input,
  request,
  userId,
  loggedAt = new Date().toISOString(),
}: {
  input: LogInput;
  request: Request;
  userId: number;
  loggedAt?: string;
}): Promise<{ logId: string; loggedAt: string }> {
  const logId = `${input.issueId}-${loggedAt.replace(/\D/g, "").slice(0, 14)}`;
  const sanitizedReport = sanitizeBetaLogText(input.codexReport);
  const record = {
    type: "beta_testing_hub_codex_report",
    logId,
    issueId: input.issueId,
    title: input.title,
    loggedAt,
    adminUserId: userId,
    host: requestHost(request),
    codexReport: sanitizedReport,
    codexReportHash: hashText(sanitizedReport),
    generatedPromptHash: input.generatedPrompt ? hashText(input.generatedPrompt) : null,
    readinessCommand: BETA_READINESS_COMMAND,
    readinessAuthority: BETA_READINESS_AUTHORITY,
  };

  await mkdir(BETA_LOG_DIR, { recursive: true });
  await appendFile(BETA_LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
  console.info(`[beta-testing-hub] logged Codex report ${logId}`);
  return { logId, loggedAt };
}
