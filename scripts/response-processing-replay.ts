import "../loadEnv.js";

import { fileURLToPath } from "node:url";

import {
  runResponseProcessingReplay,
  type ResponseReplayFilters,
  type ResponseReplayMode,
} from "../helpers/responseReplayService";
import type { ResponseClassification } from "../helpers/responseClassificationEngine";

export type ResponseReplayCliOptions = {
  mode: ResponseReplayMode;
  confirmApply: boolean;
  actorUserId: number | null;
  json: boolean;
  filters: ResponseReplayFilters;
};

function fail(message: string): never {
  throw new Error(message);
}

const RESPONSE_REPLAY_CLASSIFICATIONS = new Set<ResponseClassification>([
  "verified_deleted",
  "updated",
  "remains",
  "frivolous",
  "unable_to_verify",
  "duplicate",
  "suspicious_non_compliant",
  "unknown_manual_review",
]);
const SAFE_FILTER_TOKEN_PATTERN = /^[a-zA-Z0-9_.:-]{1,80}$/;

function parsePositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${flag} requires a positive integer.`);
  }
  return parsed;
}

function parseBool(value: string | undefined, flag: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  fail(`${flag} requires true or false.`);
}

function parseLimit(value: string | undefined, flag: string): number {
  const parsed = parsePositiveInt(value, flag);
  if (parsed > 1000) fail(`${flag} must be 1000 or less.`);
  return parsed;
}

function parseSafeToken(value: string | undefined, flag: string): string {
  const token = String(value ?? "").trim();
  if (!SAFE_FILTER_TOKEN_PATTERN.test(token)) {
    fail(`${flag} requires a safe token containing only letters, numbers, underscore, dot, colon, or hyphen.`);
  }
  return token;
}

function parseClassification(value: string | undefined, flag: string): ResponseClassification {
  const classification = parseSafeToken(value, flag) as ResponseClassification;
  if (!RESPONSE_REPLAY_CLASSIFICATIONS.has(classification)) {
    fail(`${flag} is not a supported response classification.`);
  }
  return classification;
}

function parseDateFilter(value: string | undefined, flag: string): string {
  const candidate = String(value ?? "").trim();
  if (!candidate) fail(`${flag} requires a value.`);
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) fail(`${flag} requires a valid date.`);
  return candidate;
}

function nextValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value.`);
  return value;
}

export function parseReplayArgs(args: string[]): ResponseReplayCliOptions {
  const options: ResponseReplayCliOptions = {
    mode: "dry_run",
    confirmApply: false,
    actorUserId: null,
    json: false,
    filters: {},
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run response:replay -- [options]",
        "",
        "Defaults to dry-run. Apply mode requires --apply --confirm-apply --actor-user-id <id>.",
        "",
        "Options:",
        "  --dry-run",
        "  --apply",
        "  --confirm-apply",
        "  --actor-user-id <id>",
        "  --consumer-id <id>",
        "  --user-id <id>",
        "  --packet-id <id>",
        "  --response-id <id>",
        "  --source-type <manual_admin|simulated_inbox|future_mailbox|...>",
        "  --classification <classification>",
        "  --manual-review-required <true|false>",
        "  --start-date <iso-date>",
        "  --end-date <iso-date>",
        "  --limit <1-1000>",
        "  --json",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--dry-run") {
      options.mode = "dry_run";
      continue;
    }
    if (arg === "--apply") {
      options.mode = "apply";
      continue;
    }
    if (arg === "--confirm-apply") {
      options.confirmApply = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--actor-user-id") {
      options.actorUserId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--consumer-id" || arg === "--user-id") {
      options.filters.userId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--packet-id") {
      options.filters.packetId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--response-id") {
      options.filters.responseId = parsePositiveInt(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--source-type") {
      options.filters.sourceType = parseSafeToken(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--classification") {
      options.filters.classification = parseClassification(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--manual-review-required") {
      options.filters.manualReviewRequired = parseBool(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--start-date") {
      options.filters.startDate = parseDateFilter(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--end-date") {
      options.filters.endDate = parseDateFilter(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      options.filters.limit = parseLimit(nextValue(args, index, arg), arg);
      index += 1;
      continue;
    }
    fail(`Unknown option: ${arg}`);
  }

  if (options.mode === "apply") {
    if (!options.confirmApply) fail("Apply mode requires --confirm-apply.");
    if (!options.actorUserId) fail("Apply mode requires --actor-user-id.");
  }

  return options;
}

function renderReplaySummary(result: Awaited<ReturnType<typeof runResponseProcessingReplay>>): string {
  const lines = [
    `Response processing replay ${result.mode}`,
    `Generated: ${result.generatedAt}`,
    `Tool: ${result.replayToolVersion}`,
    `Classifier: ${result.classifierRuleId} / ${result.parserVersion}`,
    `Scanned: ${result.totals.scanned}`,
    `Replayable: ${result.totals.replayable}`,
    `Non-replayable: ${result.totals.nonReplayable}`,
    `Stale/missing classifier metadata: ${result.totals.staleOrMissingClassifierMetadata}`,
    `Missing/malformed processing summary: ${result.totals.missingOrMalformedProcessingSummary}`,
    `Manual review required: ${result.totals.manualReviewRequired}`,
    `Uncertainty: ${result.totals.uncertainty}`,
    `Would append processing events: ${result.totals.wouldAppendProcessingEvents}`,
    `Appended processing events: ${result.totals.appendedProcessingEvents}`,
  ];
  if (result.reasonCounts.length > 0) {
    lines.push("Reason counts:");
    for (const item of result.reasonCounts) {
      lines.push(`- ${item.reason}: ${item.count}`);
    }
  }
  lines.push(
    "Boundaries: dry-run default, apply explicit, no raw response text stored/logged, append-only processing events, no canonical/violation/packet-readiness mutation, no live mailbox integration.",
  );
  return lines.join("\n");
}

async function main() {
  const options = parseReplayArgs(process.argv.slice(2));
  const result = await runResponseProcessingReplay({
    mode: options.mode,
    confirmApply: options.confirmApply,
    actorUserId: options.actorUserId,
    filters: options.filters,
  });

  console.log(options.json ? JSON.stringify(result, null, 2) : renderReplaySummary(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
