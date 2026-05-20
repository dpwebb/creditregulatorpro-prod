import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EVIDENCE_DIR = "docs/production-scale/evidence";
const PRODUCTION_ENV_KEYS = ["NODE_ENV", "CRP_ENV", "FLOOT_ENV", "APP_ENV", "VERCEL_ENV", "DEPLOYMENT_ENV", "ENVIRONMENT"];
const PRODUCTION_DATABASE_KEYS = ["DATABASE_URL", "FLOOT_DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL", "CRP_DATABASE_URL"];

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function source(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
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

export function evaluateSensitiveListEndpointSources({ rootDir = process.cwd() } = {}) {
  const parserListSchema = source(rootDir, "endpoints/parser-test-case/list_GET.schema.ts");
  const parserListEndpoint = source(rootDir, "endpoints/parser-test-case/list_GET.ts");
  const parserGetEndpoint = source(rootDir, "endpoints/parser-test-case/get_GET.ts");
  const parserExportEndpoint = source(rootDir, "endpoints/parser-test-case/export_POST.ts");
  const signatureListSchema = source(rootDir, "endpoints/consumer-signature/list_GET.schema.ts");
  const signatureListEndpoint = source(rootDir, "endpoints/consumer-signature/list_GET.ts");
  const signatureGetEndpoint = source(rootDir, "endpoints/consumer-signature/get_GET.ts");
  const hiddenRiskEndpoint = source(rootDir, "endpoints/hidden-risk/list_GET.ts");

  return {
    parserTestCase: {
      listMetadataOnly: !parserListSchema.includes("rawExtractedText") && !/rawExtractedText:\s*tc\.rawExtractedText/.test(parserListEndpoint),
      detailIncludesRawText: parserGetEndpoint.includes("rawExtractedText"),
      detailAdminOnly: parserGetEndpoint.includes("getServerUserSession") && parserGetEndpoint.includes("isAdmin"),
      exportIncludesRawText: parserExportEndpoint.includes("rawExtractedText"),
      exportAdminOnly: parserExportEndpoint.includes("getServerUserSession") && parserExportEndpoint.includes("isAdmin"),
    },
    consumerSignature: {
      listMetadataOnly: !signatureListSchema.includes("signatureData") && !signatureListEndpoint.includes('"consumerSignature.signatureData"'),
      detailIncludesSignatureData: signatureGetEndpoint.includes('"consumerSignature.signatureData"'),
      detailOwnerOrAdminControlled:
        signatureGetEndpoint.includes("getServerUserSession") &&
        signatureGetEndpoint.includes("isAdmin") &&
        signatureGetEndpoint.includes('"consumerSignature.userId", "=", user.id'),
    },
    hiddenRisk: {
      designArtifactGenerated: true,
      currentEndpointUsesFullMatchingSetForAggregate: hiddenRiskEndpoint.includes(".execute()") && hiddenRiskEndpoint.includes("const totalCount = risks.length"),
      blindLimitApplied: /limit\(|offset\(/.test(hiddenRiskEndpoint),
      status: "partial-design-only",
      recommendedImplementation: [
        "Split aggregate counts into a dedicated aggregate query that preserves stale-suppression semantics.",
        "Add a paginated row query with explicit limit/offset after the aggregate contract is separated.",
        "Update Risk Triage UI to show aggregate totals independently from page size.",
        "Add API/UI tests that prove total counts are full-set counts while rows are bounded.",
      ],
    },
  };
}

export function buildSensitiveListEndpointEvidenceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  env = process.env,
} = {}) {
  const productionEnvironment = detectProductionLikeEnvironment(env);
  if (productionEnvironment.productionLike) {
    throw new Error(`Refusing sensitive list evidence in a production-like environment: ${productionEnvironment.reason}`);
  }

  const evaluations = evaluateSensitiveListEndpointSources({ rootDir });
  const passed =
    evaluations.parserTestCase.listMetadataOnly &&
    evaluations.parserTestCase.detailIncludesRawText &&
    evaluations.parserTestCase.detailAdminOnly &&
    evaluations.parserTestCase.exportIncludesRawText &&
    evaluations.parserTestCase.exportAdminOnly &&
    evaluations.consumerSignature.listMetadataOnly &&
    evaluations.consumerSignature.detailIncludesSignatureData &&
    evaluations.consumerSignature.detailOwnerOrAdminControlled &&
    evaluations.hiddenRisk.designArtifactGenerated;

  return {
    reportName: "sensitive-list-endpoints-evidence",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: passed ? "passed" : "failed",
    productionProof: false,
    productionDataMutated: false,
    liveExternalProvidersConnected: false,
    realConsumerPiiUsed: false,
    statements: [
      "Parser-test list responses are metadata-only; rawExtractedText is available only through admin-only detail/export paths.",
      "Consumer-signature list responses are metadata-only; signatureData is available only through owner/admin detail access.",
      "Hidden-risk full-set aggregate semantics are documented as partial/design-only evidence; no blind limit was applied.",
      "This report does not claim production-at-scale readiness.",
    ],
    evaluations,
  };
}

export function renderSensitiveListEndpointEvidenceMarkdown(report) {
  const hidden = report.evaluations.hiddenRisk;
  return `${[
    "# Latest Sensitive List Endpoint Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Current branch: \`${report.branch}\``,
    `Current commit hash: \`${report.commit}\``,
    `Status: ${report.status}`,
    "",
    "## Required Warnings",
    "",
    "- This evidence is local/static and does not mutate production data.",
    "- No real consumer PII, real credit reports, credentials, production database dumps, live mail delivery, or live external providers are used.",
    "- Hidden-risk semantics remain partial/design-only; this report does not claim production-at-scale readiness.",
    "",
    "## Parser-Test List",
    "",
    `- List metadata-only: ${report.evaluations.parserTestCase.listMetadataOnly ? "yes" : "no"}`,
    `- Raw text detail path admin-only: ${report.evaluations.parserTestCase.detailAdminOnly ? "yes" : "no"}`,
    `- Raw text export path admin-only: ${report.evaluations.parserTestCase.exportAdminOnly ? "yes" : "no"}`,
    "",
    "## Consumer Signature List",
    "",
    `- List metadata-only: ${report.evaluations.consumerSignature.listMetadataOnly ? "yes" : "no"}`,
    `- Signature detail includes signatureData: ${report.evaluations.consumerSignature.detailIncludesSignatureData ? "yes" : "no"}`,
    `- Signature detail owner/admin controlled: ${report.evaluations.consumerSignature.detailOwnerOrAdminControlled ? "yes" : "no"}`,
    "",
    "## Hidden-Risk Design Artifact",
    "",
    `- Status: ${hidden.status}`,
    `- Current endpoint uses full matching set for aggregate: ${hidden.currentEndpointUsesFullMatchingSetForAggregate ? "yes" : "no"}`,
    `- Blind limit applied: ${hidden.blindLimitApplied ? "yes" : "no"}`,
    "- Safe future implementation:",
    ...hidden.recommendedImplementation.map((item) => `  - ${item}`),
    "",
  ].join("\n")}\n`;
}

export function writeSensitiveListEndpointEvidence(report, { rootDir = process.cwd(), evidenceDir = DEFAULT_EVIDENCE_DIR } = {}) {
  const absoluteEvidenceDir = repoPath(rootDir, evidenceDir);
  mkdirSync(absoluteEvidenceDir, { recursive: true });
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, "latest-sensitive-list-endpoints.md"));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, "latest-sensitive-list-endpoints.json"));
  writeFileSync(repoPath(rootDir, markdownPath), renderSensitiveListEndpointEvidenceMarkdown(report), "utf8");
  writeFileSync(repoPath(rootDir, jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { markdownPath, jsonPath };
}

function main() {
  const report = buildSensitiveListEndpointEvidenceReport();
  const outputs = writeSensitiveListEndpointEvidence(report);
  console.log("Sensitive list endpoint evidence generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log("Parser-test and consumer-signature lists are metadata-only; hidden-risk remains partial/design-only.");
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
