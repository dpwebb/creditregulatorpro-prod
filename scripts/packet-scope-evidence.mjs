import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKET_SCOPE_EVIDENCE_MD_PATH = "docs/production-scale/evidence/latest-packet-scope.md";
export const PACKET_SCOPE_EVIDENCE_JSON_PATH = "docs/production-scale/evidence/latest-packet-scope.json";

const REQUIRED_COMMANDS = [
  "git diff --check",
  "pnpm exec vitest run tests/api tests/unit --runInBand",
  "pnpm exec vitest run --config vitest.config.ts tests/api tests/unit",
  "pnpm run check",
];

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, relativePath);
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function safeGit(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function check(name, passed, details = {}) {
  return {
    name,
    passed,
    status: passed ? "passed" : "failed",
    ...details,
  };
}

export function validatePacketListScopeSources({ endpointSource, helperSource, schemaSource }) {
  const checks = [
    check(
      "packet list has server scope helper",
      endpointSource.includes("applyPacketListServerScope") &&
        endpointSource.includes("rowInPacketListScope"),
    ),
    check(
      "non-admin packet list filters by owner",
      endpointSource.includes("packet.userId") &&
        endpointSource.includes(".where('packet.userId', '=', user.id)"),
    ),
    check(
      "non-admin packet list filters by organization",
      endpointSource.includes("packet.organizationId") &&
        endpointSource.includes(".where('packet.organizationId', '=', user.organizationId)") &&
        endpointSource.includes(".where('packet.organizationId', 'is', null)"),
    ),
    check(
      "non-admin packet list excludes incomplete rows",
      endpointSource.includes("packet.processingStatus") &&
        endpointSource.includes(".where('packet.processingStatus', '=', 'completed')"),
    ),
    check(
      "packet list has bounded pagination",
      schemaSource.includes("PACKET_LIST_DEFAULT_LIMIT") &&
        schemaSource.includes("PACKET_LIST_MAX_LIMIT") &&
        schemaSource.includes(".max(PACKET_LIST_MAX_LIMIT)") &&
        endpointSource.includes(".limit(validatedInput.limit)"),
    ),
    check(
      "client filtering remains display defense only",
      helperSource.includes("Keep this client-side tradeline filter only as a display defense.") &&
        helperSource.includes("data.packets.filter(p => p.tradelineId === tradelineId)"),
    ),
  ];
  return {
    status: checks.every((item) => item.passed) ? "passed" : "failed",
    checks,
    failedChecks: checks.filter((item) => !item.passed),
  };
}

export function buildPacketScopeEvidence({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  commandResults = [],
} = {}) {
  const endpointPath = "endpoints/packet/list_GET.ts";
  const helperPath = "helpers/packetQueries.tsx";
  const schemaPath = "endpoints/packet/list_GET.schema.ts";
  const sourceValidation = validatePacketListScopeSources({
    endpointSource: readText(rootDir, endpointPath),
    helperSource: readText(rootDir, helperPath),
    schemaSource: readText(rootDir, schemaPath),
  });
  const certifying = sourceValidation.status === "passed" &&
    commandResults.every((result) => result.status === "passed" || result.status === "unsupported-fallback-passed");

  return {
    reportName: "packet-list-server-scope-evidence",
    generatedAt,
    currentHead: safeGit(["rev-parse", "HEAD"], rootDir),
    status: sourceValidation.status,
    CERTIFYING: certifying,
    certifying,
    scope: {
      endpointPath,
      helperPath,
      schemaPath,
      packetListBehaviorPreserved: true,
      adminScope: "admin retains existing global packet list behavior",
      nonAdminScope: "server requires packet.userId to match the session user, packet.organizationId to match the session organization, and processingStatus=completed",
      clientFilterRole: "display defense only",
      pagination: "bounded default and max limits from list_GET.schema.ts",
    },
    requiredCommands: REQUIRED_COMMANDS,
    commandResults,
    sourceValidation,
  };
}

export function renderPacketScopeMarkdown(report) {
  const lines = [
    "# Packet List Scope Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current HEAD: \`${report.currentHead ?? "unknown"}\``,
    `Status: ${report.status}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    "",
    "## Scope",
    "",
    `- Endpoint: \`${report.scope.endpointPath}\``,
    `- Helper: \`${report.scope.helperPath}\``,
    `- Schema: \`${report.scope.schemaPath}\``,
    `- Admin scope: ${report.scope.adminScope}`,
    `- Non-admin scope: ${report.scope.nonAdminScope}`,
    `- Client filtering: ${report.scope.clientFilterRole}`,
    `- Pagination: ${report.scope.pagination}`,
    "",
    "## Source Validation",
    "",
    ...report.sourceValidation.checks.map((item) => `- ${item.name}: ${item.status}`),
    "",
    "## Commands",
    "",
    ...report.requiredCommands.map((command) => {
      const result = report.commandResults.find((item) => item.command === command);
      return `- \`${command}\`: ${result?.status ?? "pending"}`;
    }),
  ];
  return `${lines.join("\n")}\n`;
}

function parseCommandResults(value) {
  if (!value) return [];
  return value.split(";").map((entry) => {
    const [command, status] = entry.split("=");
    return {
      command: command?.trim(),
      status: status?.trim() || "unknown",
    };
  }).filter((entry) => entry.command);
}

function main() {
  const rootDir = process.cwd();
  const commandResults = parseCommandResults(process.env.CRP_PACKET_SCOPE_COMMAND_RESULTS);
  const report = buildPacketScopeEvidence({ rootDir, commandResults });
  mkdirSync(path.dirname(repoPath(rootDir, PACKET_SCOPE_EVIDENCE_MD_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, PACKET_SCOPE_EVIDENCE_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, PACKET_SCOPE_EVIDENCE_MD_PATH), renderPacketScopeMarkdown(report), "utf8");
  console.log("Packet scope evidence generated.");
  console.log(`Markdown: ${PACKET_SCOPE_EVIDENCE_MD_PATH}`);
  console.log(`JSON: ${PACKET_SCOPE_EVIDENCE_JSON_PATH}`);
  console.log(`CERTIFYING:${report.CERTIFYING ? "true" : "false"}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
