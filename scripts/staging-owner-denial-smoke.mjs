import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EVIDENCE_DIR = "docs/production-scale/evidence";
const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_DATABASE_KEYS = ["DATABASE_URL", "FLOOT_DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];

export const OWNER_DENIAL_EVIDENCE_OUTPUTS = {
  markdown: "docs/production-scale/evidence/latest-staging-owner-denial-smoke.md",
  json: "docs/production-scale/evidence/latest-staging-owner-denial-smoke.json",
};

export const SYNTHETIC_ACTORS = {
  ownerA: { id: "synthetic-owner-a", role: "user", tenantId: "synthetic-tenant-a" },
  ownerB: { id: "synthetic-owner-b", role: "user", tenantId: "synthetic-tenant-b" },
  admin: { id: "synthetic-admin", role: "admin", tenantId: "synthetic-admin-tenant" },
  support: { id: "synthetic-support", role: "support", tenantId: "synthetic-support-tenant" },
};

export const OWNER_SCOPED_SYNTHETIC_RECORDS = [
  { domain: "case", route: "/_api/cases/review", recordId: "synthetic-case-a", ownerId: SYNTHETIC_ACTORS.ownerA.id },
  { domain: "evidence", route: "/_api/evidence/list?packetId=synthetic-packet-a", recordId: "synthetic-evidence-a", ownerId: SYNTHETIC_ACTORS.ownerA.id },
  { domain: "report artifact", route: "/_api/report-artifact/get?id=synthetic-report-a", recordId: "synthetic-report-a", ownerId: SYNTHETIC_ACTORS.ownerA.id },
  { domain: "packet", route: "/_api/packet/get?id=synthetic-packet-a", recordId: "synthetic-packet-a", ownerId: SYNTHETIC_ACTORS.ownerA.id },
  { domain: "packet PDF", route: "/_api/packet/pdf?id=synthetic-packet-a", recordId: "synthetic-packet-pdf-a", ownerId: SYNTHETIC_ACTORS.ownerA.id },
  { domain: "response document", route: "/_api/responses/get?id=synthetic-response-a", recordId: "synthetic-response-a", ownerId: SYNTHETIC_ACTORS.ownerA.id },
];

export const ADMIN_ONLY_SYNTHETIC_ROUTES = [
  "/_api/admin/users",
  "/_api/admin/ingest-queue",
  "/_api/responses/queue",
  "/_api/regulatory-notification/list",
];

const EVIDENCE_FORBIDDEN_PATTERNS = [
  { name: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "sin", pattern: /\b\d{3}[- ]?\d{3}[- ]?\d{3}\b/ },
  { name: "raw-pdf-base64", pattern: /JVBERi0x[0-9A-Za-z+/=]{24,}/ },
  { name: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "token", pattern: /\b(?:sk_live|sk_test|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/ },
  { name: "credential-url", pattern: /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s]+@/i },
];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function safeGit(args, rootDir = process.cwd(), fallback = "unknown") {
  try {
    const output = execFileSync("git", args, { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

export function detectProductionLikeEnvironment(env = process.env) {
  for (const key of PRODUCTION_ENV_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (value === "production" || value === "prod" || value.includes("production")) {
      return { productionLike: true, reason: `${key} indicates a production environment.` };
    }
  }

  for (const key of PRODUCTION_DATABASE_KEYS) {
    const value = String(env[key] ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value.includes("creditregulatorpro-prod") || value.includes("production") || value.includes("/prod") || value.includes("prod.")) {
      return { productionLike: true, reason: `${key} appears to reference a production database target.` };
    }
  }

  return { productionLike: false, reason: "" };
}

function canReadOwnerScopedRecord(actor, record) {
  if (actor.role === "admin") return true;
  if (actor.role === "support") return false;
  return actor.id === record.ownerId;
}

function canAccessAdminOnlyRoute(actor) {
  return actor.role === "admin";
}

export function scanEvidenceTextForForbiddenContent(text) {
  const content = String(text ?? "");
  return EVIDENCE_FORBIDDEN_PATTERNS
    .filter((entry) => entry.pattern.test(content))
    .map((entry) => entry.name);
}

export function buildStagingOwnerDenialSmokeReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
} = {}) {
  const productionEnvironment = detectProductionLikeEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing synthetic owner-denial smoke in a production-like environment: ${productionEnvironment.reason}`);
  }

  const ownerDenialChecks = OWNER_SCOPED_SYNTHETIC_RECORDS.flatMap((record) => [
    {
      name: `owner B denied owner A ${record.domain}`,
      domain: record.domain,
      route: record.route,
      recordId: record.recordId,
      requester: SYNTHETIC_ACTORS.ownerB.id,
      recordOwner: record.ownerId,
      expected: "DENY",
      actual: canReadOwnerScopedRecord(SYNTHETIC_ACTORS.ownerB, record) ? "ALLOW" : "DENY",
    },
    {
      name: `owner A can read own ${record.domain}`,
      domain: record.domain,
      route: record.route,
      recordId: record.recordId,
      requester: SYNTHETIC_ACTORS.ownerA.id,
      recordOwner: record.ownerId,
      expected: "ALLOW",
      actual: canReadOwnerScopedRecord(SYNTHETIC_ACTORS.ownerA, record) ? "ALLOW" : "DENY",
    },
    {
      name: `support denied owner A ${record.domain}`,
      domain: record.domain,
      route: record.route,
      recordId: record.recordId,
      requester: SYNTHETIC_ACTORS.support.id,
      recordOwner: record.ownerId,
      expected: "DENY",
      actual: canReadOwnerScopedRecord(SYNTHETIC_ACTORS.support, record) ? "ALLOW" : "DENY",
    },
  ]).map((check) => ({ ...check, passed: check.expected === check.actual }));

  const adminOnlyChecks = ADMIN_ONLY_SYNTHETIC_ROUTES.flatMap((route) => [
    {
      name: `owner B denied admin-only route ${route}`,
      route,
      requester: SYNTHETIC_ACTORS.ownerB.id,
      expected: "DENY",
      actual: canAccessAdminOnlyRoute(SYNTHETIC_ACTORS.ownerB) ? "ALLOW" : "DENY",
    },
    {
      name: `support denied admin-only route ${route}`,
      route,
      requester: SYNTHETIC_ACTORS.support.id,
      expected: "DENY",
      actual: canAccessAdminOnlyRoute(SYNTHETIC_ACTORS.support) ? "ALLOW" : "DENY",
    },
    {
      name: `admin can access admin-only route ${route}`,
      route,
      requester: SYNTHETIC_ACTORS.admin.id,
      expected: "ALLOW",
      actual: canAccessAdminOnlyRoute(SYNTHETIC_ACTORS.admin) ? "ALLOW" : "DENY",
    },
  ]).map((check) => ({ ...check, passed: check.expected === check.actual }));

  const allChecks = [...ownerDenialChecks, ...adminOnlyChecks];
  const failedChecks = allChecks.filter((check) => !check.passed);
  const report = {
    reportName: "staging-owner-denial-smoke",
    label: "LOCAL/STAGING SYNTHETIC ONLY",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: failedChecks.length === 0 ? "passed" : "failed",
    productionProof: false,
    stagingOrLocalProofOnly: true,
    syntheticFixturesOnly: true,
    productionDataMutated: false,
    productionFixturesCreated: false,
    liveExternalProvidersConnected: false,
    statements: [
      "This is local/staging-only synthetic owner-denial evidence.",
      "This is not production proof and does not create production fixtures.",
      "No real consumer PII, credit reports, credentials, production database dumps, or live mail delivery are used.",
      "Owner B must not read owner A synthetic case, evidence, report artifact, packet, packet PDF, or response records.",
      "Admin-only routes must remain admin-only.",
    ],
    actors: SYNTHETIC_ACTORS,
    ownerDenialChecks,
    adminOnlyChecks,
    summary: {
      totalChecks: allChecks.length,
      passedChecks: allChecks.length - failedChecks.length,
      failedChecks: failedChecks.length,
      ownerBDeniedOwnerARecords: ownerDenialChecks
        .filter((check) => check.name.startsWith("owner B denied"))
        .every((check) => check.passed),
      adminOnlyRoutesDeniedForNonAdmins: adminOnlyChecks
        .filter((check) => !check.name.startsWith("admin can access"))
        .every((check) => check.passed),
    },
  };

  const forbiddenFindings = scanEvidenceTextForForbiddenContent(JSON.stringify(report));
  if (forbiddenFindings.length > 0) {
    throw new Error(`Synthetic owner-denial smoke evidence contained forbidden marker(s): ${forbiddenFindings.join(", ")}.`);
  }

  return report;
}

export function renderStagingOwnerDenialSmokeMarkdown(report) {
  const lines = [
    "# Latest Staging Owner-Denial Smoke",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current branch: \`${report.branch}\``,
    `Current commit hash: \`${report.commit}\``,
    `Label: \`${report.label}\``,
    `Status: ${report.status}`,
    "",
    "## Required Warnings",
    "",
    "- This is local/staging-only synthetic evidence, not production proof.",
    "- This smoke does not create production fixtures and does not mutate production data.",
    "- No real consumer PII, real credit reports, credentials, production database dumps, live mail delivery, or live external providers are used.",
    "- Production-safe privacy depth remains partial until human-observed read-only production evidence is recorded.",
    "",
    "## Owner-Denial Checks",
    "",
  ];

  for (const check of report.ownerDenialChecks) {
    lines.push(`- ${check.name}: expected=${check.expected}; actual=${check.actual}; passed=${check.passed ? "yes" : "no"}`);
  }

  lines.push("", "## Admin-Only Checks", "");
  for (const check of report.adminOnlyChecks) {
    lines.push(`- ${check.name}: expected=${check.expected}; actual=${check.actual}; passed=${check.passed ? "yes" : "no"}`);
  }

  lines.push(
    "",
    "## Safety Summary",
    "",
    `- Synthetic fixtures only: ${report.syntheticFixturesOnly ? "yes" : "no"}`,
    `- Production proof: ${report.productionProof ? "yes" : "no"}`,
    `- Production data mutated: ${report.productionDataMutated ? "yes" : "no"}`,
    `- Production fixtures created: ${report.productionFixturesCreated ? "yes" : "no"}`,
    `- Live external providers connected: ${report.liveExternalProvidersConnected ? "yes" : "no"}`,
    `- Total checks: ${report.summary.totalChecks}`,
    `- Failed checks: ${report.summary.failedChecks}`,
    "",
  );

  return `${lines.join("\n")}\n`;
}

export function writeStagingOwnerDenialSmokeEvidence(report, { rootDir = process.cwd(), evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-staging-owner-denial-smoke.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-staging-owner-denial-smoke.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderStagingOwnerDenialSmokeMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function parseArgs(argv) {
  const options = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--evidence-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--evidence-dir requires a value.");
      options.evidenceDir = normalizeRelativePath(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildStagingOwnerDenialSmokeReport();
  const outputs = writeStagingOwnerDenialSmokeEvidence(report, { evidenceDir: options.evidenceDir });
  console.log("Staging/local synthetic owner-denial smoke evidence generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log("LOCAL/STAGING SYNTHETIC ONLY. This is not production proof and creates no production fixtures.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
