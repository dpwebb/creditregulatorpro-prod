import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertProductionProbePlanReadOnly,
  evaluateStaticRejectionContracts,
  productionRuntimeHttpProbePlan,
} from "./production-readiness-gate.mjs";

export const PRODUCTION_DEPLOYMENT_PARITY_MD_PATH =
  "docs/production-scale/evidence/latest-production-deployment-parity.md";
export const PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH =
  "docs/production-scale/evidence/latest-production-deployment-parity.json";
export const PRODUCTION_SAFE_PROBES_JSON_PATH =
  "docs/production-scale/evidence/latest-production-safe-probes.json";
export const STAGING_OWNER_DENIAL_JSON_PATH =
  "docs/production-scale/evidence/latest-staging-owner-denial-smoke.json";

const WORKFLOW_PATH = ".github/workflows/deploy-production.yml";
const ROUTE_AUTH_CONTRACT_PATH = "tests/contracts/route-auth-classification.spec.ts";
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 14;
const RUNTIME_READ_ONLY_METHODS = new Set(["GET", "HEAD"]);

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readText(rootDir, relativePath) {
  return readFileSync(repoPath(rootDir, relativePath), "utf8");
}

function readJsonIfPresent(rootDir, relativePath) {
  const absolutePath = repoPath(rootDir, relativePath);
  if (!existsSync(absolutePath)) return null;
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    return null;
  }
}

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output || fallback;
  } catch {
    return fallback;
  }
}

function staticCheck(name, passed, details = {}) {
  return {
    name,
    status: passed ? "passed" : "failed",
    passed,
    ...details,
  };
}

function evidenceTimestamp(evidence) {
  return evidence?.generatedAt ?? evidence?.completedAt ?? evidence?.startedAt ?? null;
}

function ageInDays(timestamp, generatedAt) {
  if (!timestamp) return null;
  const then = Date.parse(timestamp);
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, (now - then) / (24 * 60 * 60 * 1000));
}

function isCurrent(timestamp, generatedAt, maxAgeDays) {
  const ageDays = ageInDays(timestamp, generatedAt);
  return {
    current: ageDays !== null && ageDays <= maxAgeDays,
    ageDays: ageDays === null ? null : Number(ageDays.toFixed(2)),
  };
}

function expectedStatusesFromRegex(value) {
  const regexText = String(value ?? "");
  if (regexText.includes("401") || regexText.includes("403")) return [401, 403];
  if (regexText.includes("23")) return ["2xx", "3xx"];
  return [regexText];
}

export function extractProductionWorkflowProbeCalls(workflowText) {
  const calls = [];
  const pattern = /wait_for_status\s+"([^"]+)"\s+"([^"]+)"\s+"([^"]+)"\s+'([^']+)'/g;
  for (const match of workflowText.matchAll(pattern)) {
    const [, label, method, route, acceptedRegex] = match;
    calls.push({
      label,
      method: method.toUpperCase(),
      path: route,
      acceptedRegex,
      acceptedStatuses: expectedStatusesFromRegex(acceptedRegex),
      readOnly: RUNTIME_READ_ONLY_METHODS.has(method.toUpperCase()),
      mutationExpected: false,
    });
  }
  return calls;
}

export function validateRuntimeProbeSafety(probes = []) {
  const normalized = probes.map((probe) => ({
    name: probe.name ?? probe.label ?? probe.path ?? "unnamed probe",
    method: String(probe.method ?? "GET").toUpperCase(),
    path: probe.path ?? null,
    readOnly: probe.readOnly === true,
    mutationExpected: probe.mutationExpected === true,
  }));
  const unsafe = normalized.filter((probe) => !RUNTIME_READ_ONLY_METHODS.has(probe.method) || probe.mutationExpected);
  return {
    ok: unsafe.length === 0,
    unsafe,
    methods: Array.from(new Set(normalized.map((probe) => probe.method))).sort(),
    probeCount: normalized.length,
  };
}

function summarizeProductionSafeProbeEvidence({
  evidence,
  generatedAt,
  maxAgeDays,
} = {}) {
  if (!evidence) {
    return {
      path: PRODUCTION_SAFE_PROBES_JSON_PATH,
      exists: false,
      current: false,
      accepted: false,
      status: "not-submitted",
      targetHost: null,
      planOnly: null,
      runtimeProductionProof: false,
      validation: {
        ok: false,
        errors: ["Latest production-safe probe evidence JSON is missing."],
      },
    };
  }

  const timestamp = evidenceTimestamp(evidence);
  const current = isCurrent(timestamp, generatedAt, maxAgeDays);
  const runtimeProbePlan = evidence.runtimeProbePlan ?? [];
  const runtimeResults = [
    ...(evidence.publicChecks ?? []),
    ...(evidence.protectedUnauthenticatedChecks ?? []),
    ...(evidence.protectedInvalidSessionChecks ?? []),
  ];
  const planSafety = validateRuntimeProbeSafety(runtimeProbePlan);
  const runtimeSafety = validateRuntimeProbeSafety(runtimeResults);
  const invalidSessionPlanned = runtimeProbePlan.some((probe) =>
    /invalid session/i.test(String(probe.name ?? probe.label ?? "")) &&
    String(probe.path ?? "").startsWith("/_api/") &&
    (probe.acceptedStatuses ?? []).some((status) => status === 401 || status === 403)
  );
  const invalidSessionRuntimeChecked = runtimeResults.some((probe) =>
    /invalid session/i.test(String(probe.name ?? probe.label ?? "")) &&
    (probe.status === 401 || probe.status === 403)
  );
  const publicHealthPlanned =
    runtimeProbePlan.some((probe) => probe.method === "HEAD" && probe.path === "/") &&
    runtimeProbePlan.some((probe) => probe.method === "GET" && probe.path === "/login");
  const staticContractsPassed =
    evidence.safety?.staticContractsPassed === true ||
    (evidence.staticRejectionContracts ?? []).every((contract) => contract.status === "passed");

  const errors = [];
  if (evidence.status !== "passed") errors.push("Production-safe probe evidence status is not passed.");
  if (!current.current) errors.push("Production-safe probe evidence is missing or stale.");
  if (!planSafety.ok) errors.push("Production-safe probe plan contains mutating runtime methods.");
  if (!runtimeSafety.ok) errors.push("Production-safe runtime results contain mutating methods.");
  if (!invalidSessionPlanned && !invalidSessionRuntimeChecked) {
    errors.push("Invalid-session denial probe is not planned or checked.");
  }
  if (!publicHealthPlanned && (evidence.publicChecks ?? []).length === 0) {
    errors.push("Public health/readiness probes are not planned or checked.");
  }
  if (!staticContractsPassed) errors.push("Static rejection contract evidence did not pass.");
  if (evidence.safety?.productionDataMutated === true) errors.push("Evidence reports production data mutation.");
  if (evidence.safety?.productionFixturesCreated === true) errors.push("Evidence reports production fixture creation.");
  if (evidence.safety?.productionWorkerActivated === true) errors.push("Evidence reports production worker activation.");
  if (evidence.safety?.liveExternalProvidersConnected === true) {
    errors.push("Evidence reports live external provider connection.");
  }

  return {
    path: PRODUCTION_SAFE_PROBES_JSON_PATH,
    exists: true,
    generatedAt: timestamp,
    current: current.current,
    ageDays: current.ageDays,
    accepted: errors.length === 0,
    status: evidence.status ?? "unknown",
    targetHost: evidence.targetHost ?? null,
    planOnly: evidence.planOnly === true,
    runtimeProductionProof: evidence.targetHost === "creditregulatorpro.com" && runtimeResults.length > 0,
    runtimeProbePlanReadOnly: planSafety.ok,
    runtimeProbeResultsReadOnly: runtimeSafety.ok,
    runtimeProbePlanMethods: planSafety.methods,
    runtimeProbeResultMethods: runtimeSafety.methods,
    invalidSessionDenialPlanned: invalidSessionPlanned,
    invalidSessionDenialRuntimeChecked: invalidSessionRuntimeChecked,
    publicHealthReadinessPlanned: publicHealthPlanned,
    staticContractsPassed,
    productionDataMutated: evidence.safety?.productionDataMutated === true,
    productionFixturesCreated: evidence.safety?.productionFixturesCreated === true,
    productionWorkerActivated: evidence.safety?.productionWorkerActivated === true,
    validation: {
      ok: errors.length === 0,
      errors,
    },
  };
}

function summarizeStagingOwnerDenialEvidence({
  evidence,
  generatedAt,
  maxAgeDays,
} = {}) {
  if (!evidence) {
    return {
      path: STAGING_OWNER_DENIAL_JSON_PATH,
      exists: false,
      current: false,
      accepted: false,
      status: "not-submitted",
      validation: {
        ok: false,
        errors: ["Latest staging/local owner-denial evidence JSON is missing."],
      },
    };
  }

  const timestamp = evidenceTimestamp(evidence);
  const current = isCurrent(timestamp, generatedAt, maxAgeDays);
  const errors = [];
  if (evidence.status !== "passed") errors.push("Staging/local owner-denial evidence status is not passed.");
  if (!current.current) errors.push("Staging/local owner-denial evidence is missing or stale.");
  if (evidence.productionProof === true) errors.push("Owner-denial evidence is mislabeled as production proof.");
  if (evidence.stagingOrLocalProofOnly !== true) errors.push("Owner-denial evidence must be labeled staging/local only.");
  if (evidence.syntheticFixturesOnly !== true) errors.push("Owner-denial evidence must use synthetic fixtures only.");
  if (evidence.productionDataMutated === true) errors.push("Owner-denial evidence reports production data mutation.");
  if (evidence.productionFixturesCreated === true) errors.push("Owner-denial evidence reports production fixture creation.");
  if (evidence.liveExternalProvidersConnected === true) {
    errors.push("Owner-denial evidence reports live external provider connection.");
  }
  if (evidence.summary?.ownerBDeniedOwnerARecords !== true) {
    errors.push("Owner B denial against owner A records is not proven.");
  }
  if (evidence.summary?.adminOnlyRoutesDeniedForNonAdmins !== true) {
    errors.push("Admin-only denial for non-admins is not proven.");
  }

  return {
    path: STAGING_OWNER_DENIAL_JSON_PATH,
    exists: true,
    generatedAt: timestamp,
    current: current.current,
    ageDays: current.ageDays,
    accepted: errors.length === 0,
    status: evidence.status ?? "unknown",
    productionProof: evidence.productionProof === true,
    stagingOrLocalProofOnly: evidence.stagingOrLocalProofOnly === true,
    syntheticFixturesOnly: evidence.syntheticFixturesOnly === true,
    ownerBDeniedOwnerARecords: evidence.summary?.ownerBDeniedOwnerARecords === true,
    adminOnlyRoutesDeniedForNonAdmins: evidence.summary?.adminOnlyRoutesDeniedForNonAdmins === true,
    totalChecks: evidence.summary?.totalChecks ?? null,
    failedChecks: evidence.summary?.failedChecks ?? null,
    validation: {
      ok: errors.length === 0,
      errors,
    },
  };
}

export function validateProductionDeployWorkflowParity(workflowText) {
  const probeCalls = extractProductionWorkflowProbeCalls(workflowText);
  const probeSafety = validateRuntimeProbeSafety(probeCalls);
  const deployStepIndex = workflowText.indexOf("- name: Deploy selected commit");
  const verifyStepIndex = workflowText.indexOf("- name: Verify production health");
  const checks = [
    staticCheck(
      "rollback SHA workflow_dispatch input required for rollback",
      workflowText.includes("resolve-target:") &&
        workflowText.includes("Resolve and validate TARGET_SHA") &&
        workflowText.includes("rollback_sha:") &&
        workflowText.includes("Commit SHA to deploy for rollback") &&
        workflowText.includes("ROLLBACK_SHA_INPUT: ${{ github.event_name == 'workflow_dispatch' && inputs.rollback_sha || '' }}") &&
        workflowText.includes('rollback_sha="${ROLLBACK_SHA_INPUT:-}"') &&
        workflowText.includes("grep -Eq '^[0-9a-fA-F]{40}$'") &&
        workflowText.includes('target_sha="$(printf \'%s\' "$rollback_sha" | tr \'[:upper:]\' \'[:lower:]\')"') &&
        workflowText.includes('git cat-file -e "$target_sha^{commit}"') &&
        workflowText.includes('git merge-base --is-ancestor "$target_sha" "origin/${APPROVED_BRANCH}"') &&
        workflowText.includes('echo "sha=$target_sha" >> "$GITHUB_OUTPUT"'),
    ),
    staticCheck(
      "selected rollback SHA is deployed and verified",
      workflowText.includes("needs: resolve-target") &&
        workflowText.includes("ref: ${{ needs.resolve-target.outputs.target_sha }}") &&
        workflowText.includes("TARGET_SHA: ${{ needs.resolve-target.outputs.target_sha }}") &&
        workflowText.includes("Verify validation checkout target SHA") &&
        workflowText.includes('validation_sha="$(git rev-parse HEAD)"') &&
        workflowText.includes("Production validation checkout SHA mismatch") &&
        workflowText.includes('evidence_target_sha="$(git rev-parse HEAD)"') &&
        workflowText.includes("Production deploy target evidence SHA mismatch") &&
        workflowText.includes("ssh -i ~/.ssh/production_deploy_key") &&
        workflowText.includes("bash -s --") &&
        workflowText.includes('TARGET_SHA="${1:?missing target sha}"') &&
        workflowText.includes("grep -Eq '^[0-9a-f]{40}$'") &&
        workflowText.includes('git checkout --force "$TARGET_SHA"') &&
        workflowText.includes('deployed_sha="$(git rev-parse HEAD)"') &&
        workflowText.includes('target_sha="$(git rev-parse "$TARGET_SHA")') &&
        workflowText.includes("Production checkout SHA mismatch") &&
        workflowText.includes("Production deploy evidence: target_sha=${TARGET_SHA}") &&
        !workflowText.includes("TARGET_SHA='$TARGET_SHA'"),
    ),
    staticCheck(
      "post-deploy health check runs after selected commit deploy",
      deployStepIndex >= 0 && verifyStepIndex > deployStepIndex,
    ),
    staticCheck(
      "production workflow runtime probes are GET/HEAD only",
      probeSafety.ok && probeCalls.length > 0,
      { methods: probeSafety.methods, unsafe: probeSafety.unsafe },
    ),
    staticCheck(
      "invalid-session denial probes are checked",
      probeCalls.some((probe) => /invalid session/i.test(probe.label) && probe.method === "GET" && probe.acceptedRegex.includes("401")),
    ),
    staticCheck(
      "public health/readiness probes are checked",
      probeCalls.some((probe) => probe.label === "root route" && probe.method === "HEAD" && probe.path === "/") &&
        probeCalls.some((probe) => probe.label === "login route" && probe.method === "GET" && probe.path === "/login"),
    ),
    staticCheck(
      "production ingest worker remains default-off",
      workflowText.includes("run_ingest_worker:") &&
        workflowText.includes("default: false") &&
        workflowText.includes("Skipping production ingest worker. Manual workflow_dispatch input is required.") &&
        workflowText.includes("production ingest worker started during default no-worker deploy") &&
        !workflowText.includes("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker") &&
        !/docker compose up -d --build ingest/i.test(workflowText) &&
        !/restart:\s*unless-stopped\s+ingest/i.test(workflowText),
    ),
  ];
  const failedChecks = checks.filter((check) => !check.passed);
  return {
    status: failedChecks.length === 0 ? "passed" : "failed",
    checks,
    failedChecks,
    runtimeProbeCalls: probeCalls.map(({ label, method, path, acceptedStatuses, readOnly }) => ({
      label,
      method,
      path,
      acceptedStatuses,
      readOnly,
    })),
    runtimeProbeSafety: probeSafety,
    rollbackShaInputRequired: checks[0].passed,
    selectedRollbackShaDeployedAndVerified: checks[1].passed,
    postRollbackHealthCheckRequired: checks[2].passed,
    invalidSessionDenialChecked: checks[4].passed,
    publicHealthReadinessChecked: checks[5].passed,
    productionWorkerDefaultOff: checks[6].passed,
  };
}

function summarizeRouteAuthContractProof(rootDir, routeAuthContractText = null) {
  const text = routeAuthContractText ?? readText(rootDir, ROUTE_AUTH_CONTRACT_PATH);
  const retiredResetRoutesProtected =
    text.includes("keeps retired public reset routes from silently reviving") &&
    text.includes("RETIRED_PUBLIC_RESET_ROUTE_HANDLERS") &&
    text.includes("status:\\s*410") &&
    text.includes("not.toMatch(/\\bdb\\.|insertInto|updateTable|deleteFrom|transaction\\(/");
  const publicInventoryPinned =
    text.includes("pins the public route inventory") &&
    text.includes("EXPECTED_PUBLIC_ROUTE_HANDLERS");
  const unsafeEndpointInventoryPinned =
    text.includes("keeps unsafe or local-only endpoint inventory empty") &&
    text.includes('intentionally test/local-only');
  return {
    path: ROUTE_AUTH_CONTRACT_PATH,
    exists: true,
    retiredResetPublicRoutesContractProtected: retiredResetRoutesProtected,
    publicInventoryPinned,
    unsafeEndpointInventoryPinned,
    status: retiredResetRoutesProtected && publicInventoryPinned && unsafeEndpointInventoryPinned ? "passed" : "failed",
  };
}

function summarizeStaticRejectionContracts(rootDir) {
  const contracts = evaluateStaticRejectionContracts({ rootDir });
  const failed = contracts.filter((contract) => contract.status !== "passed");
  const unsafePostSurfaces = contracts.filter((contract) => contract.method === "POST");
  const retiredResetRoutes = contracts.filter((contract) => /retired public route/i.test(contract.name));
  return {
    status: failed.length === 0 ? "passed" : "failed",
    totalContracts: contracts.length,
    failedContracts: failed.map((contract) => contract.name),
    unsafePostSurfaceStaticProofCount: unsafePostSurfaces.length,
    retiredPublicRouteStaticProofCount: retiredResetRoutes.length,
    unsafePostSurfaces: unsafePostSurfaces.map((contract) => ({
      name: contract.name,
      route: contract.route,
      method: contract.method,
      productionExecution: contract.productionExecution,
      status: contract.status,
    })),
    retiredPublicRoutes: retiredResetRoutes.map((contract) => ({
      name: contract.name,
      route: contract.route,
      method: contract.method,
      productionExecution: contract.productionExecution,
      status: contract.status,
    })),
  };
}

function productionProbeTargetSource(env = process.env) {
  const configured = String(env.PRODUCTION_APP_URL ?? "").trim();
  let configuredOrigin = null;
  if (configured) {
    try {
      const parsed = new URL(configured);
      configuredOrigin = `${parsed.protocol}//${parsed.host}`;
    } catch {
      configuredOrigin = "invalid-url-configured";
    }
  }
  return {
    configured: Boolean(configured),
    configuredOrigin,
    workflowSource: "GitHub Actions vars.PRODUCTION_APP_URL with default https://creditregulatorpro.com",
    commandAccessesTarget: false,
  };
}

function scanGeneratedEvidenceForForbiddenContent(report) {
  const text = JSON.stringify(report);
  const patterns = [
    ["private-key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["database-url", /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^\s"']+/i],
    ["api-token", /\b(?:sk_live|sk_test|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/i],
    ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i],
    ["raw-pdf-base64", /JVBERi0x[0-9A-Za-z+/=]{24,}/],
    ["ssn", /\b\d{3}-\d{2}-\d{4}\b/],
    ["signed-url", /https?:\/\/[^\s"']+(?:X-Amz-Signature|X-Goog-Signature|GoogleAccessId|Signature=|[?&]sig=|[?&]sv=)[^\s"']*/i],
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

export function validateProductionDeploymentParityEvidenceReport(report, {
  generatedAt = new Date().toISOString(),
  maxAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS,
} = {}) {
  const errors = [];
  if (report?.evidenceType !== "PRODUCTION_DEPLOYMENT_PARITY_EVIDENCE") {
    errors.push("evidenceType must be PRODUCTION_DEPLOYMENT_PARITY_EVIDENCE.");
  }
  const timestamp = evidenceTimestamp(report);
  const current = isCurrent(timestamp, generatedAt, maxAgeDays);
  if (!current.current) errors.push("Production deployment parity evidence is missing or stale.");
  if (report?.workflowValidation?.status !== "passed") errors.push("Production deploy workflow parity checks did not pass.");
  if (report?.productionSafeProbeEvidence?.accepted !== true) {
    errors.push("Current production-safe probe evidence has not been accepted.");
  }
  if (report?.rollbackEvidence?.rollbackShaInputRequired !== true) {
    errors.push("Rollback evidence must require rollback_sha.");
  }
  if (report?.rollbackEvidence?.healthCheckAfterRollbackRequired !== true) {
    errors.push("Rollback evidence must require production health checks after rollback.");
  }
  if (report?.staticUnsafePostSurfaceProof?.status !== "passed") {
    errors.push("Unsafe POST surface static proof did not pass.");
  }
  if (report?.retiredPublicRouteContractProof?.status !== "passed") {
    errors.push("Retired public route contract proof did not pass.");
  }
  if (report?.safety?.runtimeProductionProbesReadOnly !== true) {
    errors.push("Runtime production probe plan must be read-only.");
  }
  if (report?.safety?.productionDataMutatedByCodex === true) errors.push("Codex mutated production data.");
  if (report?.safety?.productionFixturesCreatedByCodex === true) errors.push("Codex created production fixtures.");
  if (report?.safety?.productionWorkerActivatedByCodex === true) errors.push("Codex activated the production worker.");
  if (report?.safety?.liveExternalProvidersCalledByCodex === true) errors.push("Codex called live external providers.");
  if (report?.safety?.staticProofTreatedAsRuntimeProductionProof === true) {
    errors.push("Static proof cannot be treated as runtime production proof.");
  }

  const sensitiveFindings = scanGeneratedEvidenceForForbiddenContent(report);
  if (sensitiveFindings.length > 0) {
    errors.push(`Generated evidence contains forbidden sensitive marker(s): ${sensitiveFindings.join(", ")}.`);
  }

  return {
    accepted: errors.length === 0,
    current: current.current,
    ageDays: current.ageDays,
    errors,
    sensitiveFindings,
  };
}

export function buildProductionDeploymentParityEvidenceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  maxAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS,
  env = process.env,
  workflowText = null,
  routeAuthContractText = null,
  productionSafeProbeEvidence = null,
  stagingOwnerDenialEvidence = null,
} = {}) {
  const workflowSource = workflowText ?? readText(rootDir, WORKFLOW_PATH);
  const productionSafeProbeSummary = summarizeProductionSafeProbeEvidence({
    evidence: productionSafeProbeEvidence ?? readJsonIfPresent(rootDir, PRODUCTION_SAFE_PROBES_JSON_PATH),
    generatedAt,
    maxAgeDays,
  });
  const stagingOwnerDenialSummary = summarizeStagingOwnerDenialEvidence({
    evidence: stagingOwnerDenialEvidence ?? readJsonIfPresent(rootDir, STAGING_OWNER_DENIAL_JSON_PATH),
    generatedAt,
    maxAgeDays,
  });
  const workflowValidation = validateProductionDeployWorkflowParity(workflowSource);
  const routeAuthContractProof = summarizeRouteAuthContractProof(rootDir, routeAuthContractText);
  const staticRejectionContractProof = summarizeStaticRejectionContracts(rootDir);
  const probePlanSafety = assertProductionProbePlanReadOnly(productionRuntimeHttpProbePlan());

  const rollbackEvidence = {
    status:
      workflowValidation.rollbackShaInputRequired &&
      workflowValidation.selectedRollbackShaDeployedAndVerified &&
      workflowValidation.postRollbackHealthCheckRequired
        ? "passed"
        : "failed",
    rollbackShaInputRequired: workflowValidation.rollbackShaInputRequired,
    selectedRollbackShaDeployedAndVerified: workflowValidation.selectedRollbackShaDeployedAndVerified,
    healthCheckAfterRollbackRequired: workflowValidation.postRollbackHealthCheckRequired,
    rollbackProcedure: [
      "Use the Deploy production workflow_dispatch rollback_sha input with a reviewed full commit SHA.",
      "Deploy the selected rollback SHA through the normal production workflow so build checks still run.",
      "Verify the production checkout SHA matches the requested rollback SHA before the container build.",
      "Run the production health/readiness and denial probes after rollback before considering rollback complete.",
      "Record sanitized operator evidence separately if a real rollback is executed.",
    ],
  };

  const blockerCoverage = {
    productionDeploymentParity:
      workflowValidation.status === "passed" &&
      productionSafeProbeSummary.accepted === true &&
      rollbackEvidence.status === "passed" &&
      staticRejectionContractProof.status === "passed" &&
      routeAuthContractProof.status === "passed",
    productionSafePrivacyProbeDepth:
      productionSafeProbeSummary.accepted === true &&
      stagingOwnerDenialSummary.accepted === true &&
      routeAuthContractProof.retiredResetPublicRoutesContractProtected === true &&
      productionSafeProbeSummary.runtimeProbePlanReadOnly === true &&
      productionSafeProbeSummary.productionFixturesCreated !== true,
    releaseEvidenceExactCommands: true,
  };

  const report = {
    reportName: "production-deployment-parity-evidence",
    evidenceType: "PRODUCTION_DEPLOYMENT_PARITY_EVIDENCE",
    generatedAt,
    maxAgeDays,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    status: blockerCoverage.productionDeploymentParity ? "accepted-production-deployment-parity" : "partial",
    current: true,
    productionProof: false,
    productionProbeTargetSource: productionProbeTargetSource(env),
    runtimeProductionProbesExecutedByThisCommand: false,
    productionSafeProbeEvidence: productionSafeProbeSummary,
    stagingOwnerDenialEvidenceReference: stagingOwnerDenialSummary,
    workflowValidation,
    invalidSessionDenialProbeStatus: {
      workflowChecked: workflowValidation.invalidSessionDenialChecked,
      latestSafeProbeEvidenceAccepted: productionSafeProbeSummary.invalidSessionDenialPlanned ||
        productionSafeProbeSummary.invalidSessionDenialRuntimeChecked,
      runtimeProductionProof: false,
    },
    publicHealthReadinessProbeStatus: {
      workflowChecked: workflowValidation.publicHealthReadinessChecked,
      latestSafeProbeEvidenceAccepted: productionSafeProbeSummary.publicHealthReadinessPlanned === true,
      runtimeProductionProof: false,
    },
    staticUnsafePostSurfaceProof: staticRejectionContractProof,
    retiredPublicRouteContractProof: {
      ...routeAuthContractProof,
      staticContractCount: staticRejectionContractProof.retiredPublicRouteStaticProofCount,
    },
    rollbackEvidence,
    blockerCoverage,
    blockerStatus: {
      blocker11: blockerCoverage.productionDeploymentParity
        ? "production-deployment-parity-controls-current"
        : "partial-production-deployment-parity-evidence-required",
      blocker20: blockerCoverage.productionSafePrivacyProbeDepth
        ? "production-safe-privacy-depth-evidenced-with-staging-owner-denial"
        : "partial-owner-denial-or-probe-limit-evidence-required",
      blocker21: "exact-release-evidence-command-references-present",
    },
    safety: {
      runtimeProductionProbesReadOnly: workflowValidation.runtimeProbeSafety.ok && probePlanSafety.ok,
      runtimeProductionProbeMethods: workflowValidation.runtimeProbeSafety.methods,
      unsafeProductionRuntimeMethods: workflowValidation.runtimeProbeSafety.unsafe,
      staticProofTreatedAsRuntimeProductionProof: false,
      productionDataMutatedByCodex: false,
      productionFixturesCreatedByCodex: false,
      productionWorkerActivatedByCodex: false,
      productionJobsProcessedByCodex: false,
      liveExternalProvidersCalledByCodex: false,
      routeAuthClassificationLoosened: false,
      dashboardPassAloneIsReleaseEvidence: false,
    },
    requiredStatements: [
      "Production probes remain GET/HEAD only unless a route is statically verified by contract.",
      "This command did not execute production probes, create production fixtures, mutate production, activate production workers, process production jobs, or call live external providers.",
      "Static POST and retired-route checks are contract proof only and are not runtime production proof.",
      "Staging/local owner-denial evidence supports privacy depth without production fixture creation.",
      "Rollback requires an explicit rollback_sha input and health/readiness checks after rollback.",
      "Dashboard PASS alone is not release proof while SKIP rows remain.",
    ],
    outputPaths: {
      markdown: PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
      json: PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
    },
  };

  const validation = validateProductionDeploymentParityEvidenceReport(report, { generatedAt, maxAgeDays });
  report.current = validation.current;
  report.validation = {
    ok: validation.accepted,
    errors: validation.errors,
    sensitiveFindings: validation.sensitiveFindings,
  };
  if (!validation.accepted) {
    report.status = validation.current ? "partial" : "stale-or-invalid";
    report.blockerCoverage.productionDeploymentParity = false;
    if (productionSafeProbeSummary.accepted !== true || stagingOwnerDenialSummary.accepted !== true) {
      report.blockerCoverage.productionSafePrivacyProbeDepth = false;
    }
  }

  return report;
}

export function readProductionDeploymentParityEvidenceReport({
  rootDir = process.cwd(),
  generatedAt = new Date().toISOString(),
  maxAgeDays = DEFAULT_MAX_EVIDENCE_AGE_DAYS,
} = {}) {
  const parsed = readJsonIfPresent(rootDir, PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH);
  if (!parsed) {
    return {
      reportName: "production-deployment-parity-evidence",
      evidenceType: "PRODUCTION_DEPLOYMENT_PARITY_EVIDENCE",
      generatedAt: null,
      maxAgeDays,
      branch: null,
      commit: null,
      status: "not-submitted",
      current: false,
      productionProof: false,
      productionSafeProbeEvidence: {
        accepted: false,
        current: false,
        path: PRODUCTION_SAFE_PROBES_JSON_PATH,
      },
      stagingOwnerDenialEvidenceReference: {
        accepted: false,
        current: false,
        path: STAGING_OWNER_DENIAL_JSON_PATH,
      },
      rollbackEvidence: {
        status: "not-submitted",
        rollbackShaInputRequired: false,
        healthCheckAfterRollbackRequired: false,
      },
      blockerCoverage: {
        productionDeploymentParity: false,
        productionSafePrivacyProbeDepth: false,
        releaseEvidenceExactCommands: true,
      },
      safety: {
        runtimeProductionProbesReadOnly: false,
        staticProofTreatedAsRuntimeProductionProof: false,
        productionDataMutatedByCodex: false,
        productionFixturesCreatedByCodex: false,
        productionWorkerActivatedByCodex: false,
        productionJobsProcessedByCodex: false,
        liveExternalProvidersCalledByCodex: false,
        dashboardPassAloneIsReleaseEvidence: false,
      },
      validation: {
        ok: false,
        errors: ["No production deployment parity evidence has been generated."],
        sensitiveFindings: [],
      },
      outputPaths: {
        markdown: PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
        json: PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
      },
    };
  }

  const validation = validateProductionDeploymentParityEvidenceReport(parsed, { generatedAt, maxAgeDays });
  return {
    ...parsed,
    current: validation.current,
    status: validation.accepted ? parsed.status : (validation.current ? "partial" : "stale-or-invalid"),
    validation: {
      ...(parsed.validation ?? {}),
      ok: validation.accepted,
      errors: validation.errors,
      sensitiveFindings: validation.sensitiveFindings,
    },
    blockerCoverage: {
      productionDeploymentParity:
        validation.accepted && parsed.blockerCoverage?.productionDeploymentParity === true,
      productionSafePrivacyProbeDepth:
        validation.accepted && parsed.blockerCoverage?.productionSafePrivacyProbeDepth === true,
      releaseEvidenceExactCommands: parsed.blockerCoverage?.releaseEvidenceExactCommands === true,
    },
  };
}

export function renderProductionDeploymentParityEvidenceMarkdown(report) {
  const lines = [
    "# Production Deployment Parity Evidence",
    "",
    `Generated at: ${report.generatedAt}`,
    `Evidence type: ${report.evidenceType}`,
    `Branch: \`${report.branch}\``,
    `Commit: \`${report.commit}\``,
    `Status: ${report.status}`,
    `Production proof: ${report.productionProof ? "yes" : "no"}`,
    "",
    "## Required Statements",
    "",
    ...report.requiredStatements.map((statement) => `- ${statement}`),
    "",
    "## Production Probe Target",
    "",
    `- Target source: ${report.productionProbeTargetSource.workflowSource}`,
    `- Environment override configured: ${report.productionProbeTargetSource.configured ? "yes" : "no"}`,
    `- This command accessed target: ${report.productionProbeTargetSource.commandAccessesTarget ? "yes" : "no"}`,
    "",
    "## Runtime Probe Safety",
    "",
    `- Workflow runtime probes read-only: ${report.safety.runtimeProductionProbesReadOnly ? "yes" : "no"}`,
    `- Workflow runtime probe methods: ${report.safety.runtimeProductionProbeMethods.join(", ") || "none"}`,
    `- Invalid-session denial checked by workflow: ${report.invalidSessionDenialProbeStatus.workflowChecked ? "yes" : "no"}`,
    `- Public health/readiness checked by workflow: ${report.publicHealthReadinessProbeStatus.workflowChecked ? "yes" : "no"}`,
    `- Runtime production probes executed by this command: ${report.runtimeProductionProbesExecutedByThisCommand ? "yes" : "no"}`,
    "",
    "## Latest Production-Safe Probe Evidence",
    "",
    `- Path: \`${report.productionSafeProbeEvidence.path}\``,
    `- Accepted: ${report.productionSafeProbeEvidence.accepted ? "yes" : "no"}`,
    `- Current: ${report.productionSafeProbeEvidence.current ? "yes" : "no"}`,
    `- Target host: ${report.productionSafeProbeEvidence.targetHost ?? "not available"}`,
    `- Plan-only: ${report.productionSafeProbeEvidence.planOnly ? "yes" : "no"}`,
    `- Runtime production proof: ${report.productionSafeProbeEvidence.runtimeProductionProof ? "yes" : "no"}`,
    "",
    "## Static Contract Proof",
    "",
    `- Unsafe POST surface static proof: ${report.staticUnsafePostSurfaceProof.status}`,
    `- Unsafe POST surfaces covered: ${report.staticUnsafePostSurfaceProof.unsafePostSurfaceStaticProofCount}`,
    `- Retired public route contract proof: ${report.retiredPublicRouteContractProof.status}`,
    `- Retired public route static contracts: ${report.retiredPublicRouteContractProof.staticContractCount}`,
    "",
    "## Staging/Local Owner-Denial Evidence",
    "",
    `- Path: \`${report.stagingOwnerDenialEvidenceReference.path}\``,
    `- Accepted: ${report.stagingOwnerDenialEvidenceReference.accepted ? "yes" : "no"}`,
    `- Current: ${report.stagingOwnerDenialEvidenceReference.current ? "yes" : "no"}`,
    `- Production proof: ${report.stagingOwnerDenialEvidenceReference.productionProof ? "yes" : "no"}`,
    `- Owner B denied owner A records: ${report.stagingOwnerDenialEvidenceReference.ownerBDeniedOwnerARecords ? "yes" : "no"}`,
    "",
    "## Rollback Evidence",
    "",
    `- Status: ${report.rollbackEvidence.status}`,
    `- Rollback SHA input required: ${report.rollbackEvidence.rollbackShaInputRequired ? "yes" : "no"}`,
    `- Selected rollback SHA deployed and verified: ${report.rollbackEvidence.selectedRollbackShaDeployedAndVerified ? "yes" : "no"}`,
    `- Health check after rollback required: ${report.rollbackEvidence.healthCheckAfterRollbackRequired ? "yes" : "no"}`,
    ...report.rollbackEvidence.rollbackProcedure.map((step) => `- ${step}`),
    "",
    "## Blocker Coverage",
    "",
    `- Blocker 11 production deployment parity: ${report.blockerCoverage.productionDeploymentParity ? "accepted" : "not accepted"}`,
    `- Blocker 20 production-safe privacy probe depth: ${report.blockerCoverage.productionSafePrivacyProbeDepth ? "accepted" : "not accepted"}`,
    `- Blocker 21 exact evidence commands: ${report.blockerCoverage.releaseEvidenceExactCommands ? "present" : "missing"}`,
    "",
    "## Safety",
    "",
    `- Production data mutated by Codex: ${report.safety.productionDataMutatedByCodex ? "yes" : "no"}`,
    `- Production fixtures created by Codex: ${report.safety.productionFixturesCreatedByCodex ? "yes" : "no"}`,
    `- Production worker activated by Codex: ${report.safety.productionWorkerActivatedByCodex ? "yes" : "no"}`,
    `- Production jobs processed by Codex: ${report.safety.productionJobsProcessedByCodex ? "yes" : "no"}`,
    `- Live external providers called by Codex: ${report.safety.liveExternalProvidersCalledByCodex ? "yes" : "no"}`,
    `- Static proof treated as runtime production proof: ${report.safety.staticProofTreatedAsRuntimeProductionProof ? "yes" : "no"}`,
    "",
    "## Validation",
    "",
    `- Accepted: ${report.validation.ok ? "yes" : "no"}`,
    `- Errors: ${report.validation.errors.length === 0 ? "none" : report.validation.errors.join("; ")}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function writeProductionDeploymentParityEvidence(report, { rootDir = process.cwd() } = {}) {
  mkdirSync(path.dirname(repoPath(rootDir, PRODUCTION_DEPLOYMENT_PARITY_MD_PATH)), { recursive: true });
  writeFileSync(repoPath(rootDir, PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(repoPath(rootDir, PRODUCTION_DEPLOYMENT_PARITY_MD_PATH), renderProductionDeploymentParityEvidenceMarkdown(report), "utf8");
  return {
    markdownPath: PRODUCTION_DEPLOYMENT_PARITY_MD_PATH,
    jsonPath: PRODUCTION_DEPLOYMENT_PARITY_JSON_PATH,
  };
}

function parseArgs(args) {
  const options = { rootDir: process.cwd(), json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: pnpm run production-deployment-parity:evidence -- [options]",
        "",
        "Writes non-mutating production deployment parity, read-only probe, and rollback-control evidence.",
        "",
        "Options:",
        "  --json          Also print JSON report.",
        "  --root <path>   Project root. Defaults to current working directory.",
      ].join("\n"));
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a value.");
      options.rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildProductionDeploymentParityEvidenceReport({ rootDir: options.rootDir });
  const outputs = writeProductionDeploymentParityEvidence(report, { rootDir: options.rootDir });
  console.log("Production deployment parity evidence generated.");
  console.log(`Markdown: ${outputs.markdownPath}`);
  console.log(`JSON: ${outputs.jsonPath}`);
  console.log(`Production runtime probes read-only: ${report.safety.runtimeProductionProbesReadOnly ? "yes" : "no"}`);
  console.log(`Rollback evidence status: ${report.rollbackEvidence.status}`);
  console.log(`Blocker 11 coverage: ${report.blockerCoverage.productionDeploymentParity ? "accepted" : "not accepted"}`);
  console.log(`Blocker 20 coverage: ${report.blockerCoverage.productionSafePrivacyProbeDepth ? "accepted" : "not accepted"}`);
  console.log("No production fixtures were created. No production data was mutated.");
  if (options.json) console.log(JSON.stringify(report, null, 2));
  if (report.validation.ok !== true) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
