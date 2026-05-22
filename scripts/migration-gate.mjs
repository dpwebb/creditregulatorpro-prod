import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_LEDGER_DIR,
  DEFAULT_MIGRATION_EVIDENCE_DIR,
  DEFAULT_SCAN_ROOTS,
  EXPECTED_SCHEMA_SOURCES,
  scanMigrationState,
  validateMigrationGovernanceReport,
} from "./check-migrations.mjs";
import { simulateReviewedMigrationFreshDatabase } from "./reviewed-migration-simulator.mjs";

export const MIGRATION_GATE_POLICY_PATH = "docs/production-scale/migration-governance-policy.json";
export const MIGRATION_GATE_MARKDOWN = "latest-migration-gate.md";
export const MIGRATION_GATE_JSON = "latest-migration-gate.json";
export const MIGRATION_GATE_MD_PATH = `${DEFAULT_MIGRATION_EVIDENCE_DIR}/${MIGRATION_GATE_MARKDOWN}`;
export const MIGRATION_GATE_JSON_PATH = `${DEFAULT_MIGRATION_EVIDENCE_DIR}/${MIGRATION_GATE_JSON}`;

const VALID_POLICY_MODES = new Set(["warning-only", "release-blocking", "waived"]);
const REFUSED_FLAGS = new Set(["--apply", "--execute", "--run-ddl", "--ddl", "--mutate", "--write-db"]);
const CONVERTED_RUNTIME_STATUSES = new Set(["converted-additive", "converted-reviewed-additive"]);
const GOVERNED_RUNTIME_STATUSES = new Set([
  "machine-governed-runtime-residual",
  "reviewed-governed-runtime-residual",
  "reviewed-governed-additive-ledger",
]);
const TEMPORARY_RUNTIME_ALLOWLIST_STATUSES = new Set([
  "temporary-production-allowlist",
  "temporary-allowlist",
  "approved-residual",
]);
const RESIDUAL_CLASSIFICATIONS = Object.freeze({
  reviewedAdditive: "already-covered-by-additive-migration",
  machineLedgeredAdditive: "ledgered additive migration",
  reviewedGoverned: "reviewed and governed",
  obsoleteRemoved: "obsolete and removed",
  unresolved: "unresolved",
  expired: "expired",
  needsLedger: "needs-new-additive-ledger-entry",
  temporaryWithExpiry: "still-requires-temporary-acceptance-with-explicit-expiry",
});

function normalizeRelativePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function repoPath(rootDir, relativePath) {
  return path.join(rootDir, ...normalizeRelativePath(relativePath).split("/").filter(Boolean));
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readFileSync(repoPath(rootDir, relativePath), "utf8"));
}

function writeText(rootDir, relativePath, text) {
  const target = repoPath(rootDir, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text, "utf8");
}

function safeGit(args, rootDir, fallback = "unknown") {
  try {
    const output = execFileSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return output.length > 0 ? output : fallback;
  } catch {
    return fallback;
  }
}

function policyPaths(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeRelativePath(typeof item === "string" ? item : item?.path))
      .filter(Boolean),
  );
}

function policyEntriesByPath(items) {
  const entries = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const entry = typeof item === "string" ? { path: item } : item;
    const normalizedPath = normalizeRelativePath(entry?.path);
    if (normalizedPath) entries.set(normalizedPath, entry);
  }
  return entries;
}

function expectedSourcesByKind(kind, expectedSources = EXPECTED_SCHEMA_SOURCES) {
  return expectedSources.filter((source) => source.kind === kind).map((source) => normalizeRelativePath(source.path));
}

function sourceKind(sourcePath, expectedSources = EXPECTED_SCHEMA_SOURCES) {
  const normalized = normalizeRelativePath(sourcePath);
  return expectedSources.find((source) => normalizeRelativePath(source.path) === normalized)?.kind ?? "unknown";
}

function endOfDayUtc(dateValue) {
  const trimmed = String(dateValue ?? "").trim();
  if (!trimmed) return Number.NaN;
  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T23:59:59.999Z` : trimmed;
  return Date.parse(dateText);
}

function runtimeEntryStatus(entry) {
  return String(entry?.status ?? "").trim().toLowerCase();
}

function isConvertedRuntimeEntry(entry) {
  return CONVERTED_RUNTIME_STATUSES.has(runtimeEntryStatus(entry));
}

function isGovernedRuntimeEntry(entry) {
  return GOVERNED_RUNTIME_STATUSES.has(runtimeEntryStatus(entry));
}

function isTemporaryRuntimeAllowlistEntry(entry) {
  return TEMPORARY_RUNTIME_ALLOWLIST_STATUSES.has(runtimeEntryStatus(entry));
}

function runtimeEntryReason(entry) {
  return String(entry?.reason ?? entry?.waiverReason ?? entry?.description ?? "").trim();
}

function runtimeEntryOwner(entry) {
  return String(entry?.ownerRole ?? entry?.approvedByRole ?? entry?.owner ?? "").trim();
}

function runtimeEntryExpiry(entry) {
  return String(entry?.expiresOn ?? entry?.allowlistExpiresOn ?? entry?.expiry ?? "").trim();
}

function runtimeEntryLedgerEntry(entry) {
  return normalizeRelativePath(entry?.ledgerEntry ?? entry?.migrationLedgerEntry ?? "");
}

function runtimeEntryLedgerStatus(entry) {
  return String(entry?.ledgerStatus ?? entry?.governanceLedgerStatus ?? entry?.residualClassification ?? "").trim();
}

function validateTemporaryRuntimeAllowlistEntry(entry, generatedAt) {
  const errors = [];
  let expired = false;
  if (!runtimeEntryReason(entry)) errors.push("temporary allowlist reason is required.");
  if (!runtimeEntryOwner(entry)) errors.push("temporary allowlist ownerRole is required.");
  const expiresOn = runtimeEntryExpiry(entry);
  if (!expiresOn) {
    errors.push("temporary allowlist expiresOn is required.");
  } else {
    const expiry = endOfDayUtc(expiresOn);
    if (!Number.isFinite(expiry)) {
      errors.push("temporary allowlist expiresOn must be parseable.");
    } else if (expiry < Date.parse(generatedAt)) {
      expired = true;
      errors.push("temporary allowlist expiresOn is expired.");
    }
  }
  if (entry?.CERTIFYING !== false) errors.push("temporary allowlist entry must set CERTIFYING:false.");
  return { errors, expired, expiresOn };
}

function validateConvertedRuntimeMigrationEntry({ entry, sourcePath, rootDir }) {
  const errors = [];
  const reviewedMigration = normalizeRelativePath(entry?.reviewedMigration ?? entry?.migrationPath ?? "");
  if (!reviewedMigration) {
    errors.push("converted runtime ensure entry requires reviewedMigration.");
    return { reviewedMigration, simulation: null, errors };
  }
  const absoluteMigrationPath = repoPath(rootDir, reviewedMigration);
  if (!existsSync(absoluteMigrationPath)) {
    errors.push(`reviewed migration is missing: ${reviewedMigration}.`);
    return { reviewedMigration, simulation: null, errors };
  }
  const migrationText = readFileSync(absoluteMigrationPath, "utf8");
  if (!normalizeRelativePath(migrationText).includes(normalizeRelativePath(sourcePath))) {
    errors.push(`reviewed migration must mention runtime ensure source ${sourcePath}.`);
  }
  let simulation = null;
  try {
    simulation = simulateReviewedMigrationFreshDatabase({ rootDir, migrationPath: reviewedMigration });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { reviewedMigration, simulation, errors };
}

function validateGovernedRuntimeResidualEntry({ entry, sourcePath, rootDir }) {
  const errors = [];
  const ledgerEntry = runtimeEntryLedgerEntry(entry);
  const ledgerStatus = runtimeEntryLedgerStatus(entry);

  if (!ledgerEntry) errors.push("machine-governed runtime residual requires ledgerEntry.");
  if (!ledgerStatus) errors.push("machine-governed runtime residual requires ledgerStatus.");
  if (ledgerStatus && ledgerStatus !== RESIDUAL_CLASSIFICATIONS.reviewedGoverned) {
    errors.push(`machine-governed runtime residual ledgerStatus must be "${RESIDUAL_CLASSIFICATIONS.reviewedGoverned}".`);
  }
  if (!runtimeEntryReason(entry)) errors.push("machine-governed runtime residual reason is required.");
  if (!runtimeEntryOwner(entry)) errors.push("machine-governed runtime residual ownerRole is required.");
  if (entry?.productionPromotionAuthorized !== true) {
    errors.push("machine-governed runtime residual requires productionPromotionAuthorized:true.");
  }
  if (entry?.CERTIFYING !== true) {
    errors.push("machine-governed runtime residual requires CERTIFYING:true.");
  }
  if (entry?.humanObserved === true || entry?.manualApprovalRequired === true || entry?.humanInteractionRequired === true) {
    errors.push("machine-governed runtime residual must not require human observation or manual approval.");
  }
  if (ledgerEntry) {
    const absoluteLedgerPath = repoPath(rootDir, ledgerEntry);
    if (!existsSync(absoluteLedgerPath)) {
      errors.push(`machine-governed ledger entry is missing: ${ledgerEntry}.`);
    } else {
      const ledgerText = readFileSync(absoluteLedgerPath, "utf8");
      if (!normalizeRelativePath(ledgerText).includes(normalizeRelativePath(sourcePath))) {
        errors.push(`machine-governed ledger entry must mention runtime ensure source ${sourcePath}.`);
      }
    }
  }

  return { ledgerEntry, ledgerStatus, errors };
}

function finding({
  category,
  sourcePath = null,
  title,
  impact,
  status,
  recommendation,
  detail = "",
}) {
  return {
    category,
    sourcePath,
    title,
    impact,
    status,
    recommendation,
    detail,
  };
}

export function loadMigrationGatePolicy({
  rootDir = process.cwd(),
  policyPath = MIGRATION_GATE_POLICY_PATH,
} = {}) {
  return readJson(rootDir, policyPath);
}

function validatePolicyShape(policy) {
  const errors = [];
  if (!policy || typeof policy !== "object") errors.push("policy must be an object.");
  if (!VALID_POLICY_MODES.has(policy?.currentMode)) {
    errors.push("policy currentMode must be warning-only, release-blocking, or waived.");
  }
  if (!Array.isArray(policy?.approvedRuntimeEnsureInventory)) {
    errors.push("policy approvedRuntimeEnsureInventory is required.");
  }
  if (!Array.isArray(policy?.allowedBootstrapScripts)) {
    errors.push("policy allowedBootstrapScripts is required.");
  }
  if (!Array.isArray(policy?.forbiddenMutationPatterns)) {
    errors.push("policy forbiddenMutationPatterns is required.");
  }
  if (!Array.isArray(policy?.releaseGateRequirements)) {
    errors.push("policy releaseGateRequirements is required.");
  }
  if (!Array.isArray(policy?.waiverRequirements)) {
    errors.push("policy waiverRequirements is required.");
  }
  if (!Array.isArray(policy?.futureCutoverProcedure)) {
    errors.push("policy futureCutoverProcedure is required.");
  }
  return errors;
}

function validateFormalWaiver(policy, generatedAt) {
  const waiver = policy?.formalWaiver ?? {};
  const errors = [];
  if (policy?.currentMode !== "waived") {
    return { accepted: false, errors: ["Policy mode is not waived."], waiver };
  }
  if (String(waiver.status ?? "").toLowerCase() !== "approved") errors.push("formalWaiver.status must be approved.");
  if (!String(waiver.reason ?? "").trim()) errors.push("formalWaiver.reason is required.");
  if (!String(waiver.approvedByRole ?? "").trim()) errors.push("formalWaiver.approvedByRole is required.");
  if (!String(waiver.acceptedAt ?? "").trim()) errors.push("formalWaiver.acceptedAt is required.");
  if (!String(waiver.expiresOn ?? "").trim()) errors.push("formalWaiver.expiresOn is required.");
  const expiry = Date.parse(`${String(waiver.expiresOn ?? "").trim()}T23:59:59.999Z`);
  if (Number.isFinite(expiry) && expiry < Date.parse(generatedAt)) {
    errors.push("formalWaiver.expiresOn is before the evidence timestamp.");
  }
  if (!/runtime ensure|migration|ledger|cutover/i.test(String(waiver.reason ?? ""))) {
    errors.push("formalWaiver.reason must identify the migration/runtime ensure residual being waived.");
  }
  return { accepted: errors.length === 0, errors, waiver };
}

function forbiddenPatternFindings(migrationState, policy) {
  const forbidden = new Set(
    (policy.forbiddenMutationPatterns ?? [])
      .map((entry) => String(typeof entry === "string" ? entry : entry?.pattern ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  return migrationState.detectedSchemaMutationSources.flatMap((source) =>
    source.matches
      .filter((match) => forbidden.has(String(match.pattern ?? "").toLowerCase()))
      .map((match) =>
        finding({
          category: "forbidden-mutation-pattern",
          sourcePath: source.path,
          title: "Forbidden schema mutation pattern detected",
          impact: "release-blocking",
          status: "forbidden",
          recommendation: "Remove the forbidden mutation or replace it with a reviewed additive migration plan.",
          detail: `${match.pattern} at line ${match.line}`,
        }),
      ),
  );
}

function buildGateFindings({ policy, migrationState, expectedSources, rootDir, generatedAt }) {
  const findings = [];
  const policyRuntimePaths = policyPaths(policy.approvedRuntimeEnsureInventory);
  const policyRuntimeEntries = policyEntriesByPath(policy.approvedRuntimeEnsureInventory);
  const policyBootstrapPaths = policyPaths(policy.allowedBootstrapScripts);
  const expectedRuntimePaths = expectedSourcesByKind("runtime-ensure", expectedSources);
  const detectedPaths = new Set(migrationState.detectedSchemaMutationSourcePaths ?? []);

  for (const error of validatePolicyShape(policy)) {
    findings.push(finding({
      category: "invalid-policy",
      title: "Migration gate policy is invalid",
      impact: "release-blocking",
      status: "invalid",
      recommendation: "Fix the policy before treating migration governance as release-gated.",
      detail: error,
    }));
  }

  for (const sourcePath of migrationState.unknownSchemaMutationSources ?? []) {
    findings.push(finding({
      category: "unknown-schema-mutation-source",
      sourcePath,
      title: "Unknown schema mutation source detected",
      impact: "release-blocking",
      status: "unknown",
      recommendation: "Add the source to the reviewed inventory or remove the schema mutation from runtime code.",
      detail: "Detected by the static migration checker.",
    }));
  }

  for (const sourcePath of migrationState.unledgeredSchemaMutationSources ?? []) {
    findings.push(finding({
      category: "unledgered-schema-mutation-source",
      sourcePath,
      title: "Schema mutation source is not represented in the ledger",
      impact: "release-blocking",
      status: "unledgered",
      recommendation: "Add a ledger entry naming this source before accepting the migration gate.",
      detail: "Detected source was absent from migration ledger text.",
    }));
  }

  for (const sourcePath of migrationState.missingExpectedSources ?? []) {
    findings.push(finding({
      category: "missing-expected-source",
      sourcePath,
      title: "Expected schema source missing",
      impact: "release-blocking",
      status: "missing",
      recommendation: "Restore the expected source or update the reviewed migration policy and ledger.",
    }));
  }

  for (const sourcePath of migrationState.missingExpectedInventoryEntries ?? []) {
    findings.push(finding({
      category: "missing-expected-inventory-entry",
      sourcePath,
      title: "Expected source missing from migration inventory ledger",
      impact: "release-blocking",
      status: "unledgered",
      recommendation: "Update migrations/0000-runtime-schema-inventory.md or a later reviewed ledger entry.",
    }));
  }

  for (const sourcePath of expectedRuntimePaths.filter((sourcePath) => !policyRuntimePaths.has(sourcePath))) {
    findings.push(finding({
      category: "missing-policy-runtime-inventory-entry",
      sourcePath,
      title: "Expected runtime ensure source missing from gate policy",
      impact: "release-blocking",
      status: "missing",
      recommendation: "Add this runtime ensure source to approvedRuntimeEnsureInventory or remove it through reviewed migration cutover.",
    }));
  }

  for (const sourcePath of [...detectedPaths].filter((sourcePath) => sourceKind(sourcePath, expectedSources) === "bootstrap" && !policyBootstrapPaths.has(sourcePath))) {
    findings.push(finding({
      category: "unapproved-bootstrap-mutation-source",
      sourcePath,
      title: "Bootstrap mutation source is not approved by policy",
      impact: "release-blocking",
      status: "unapproved",
      recommendation: "Add the bootstrap source to allowedBootstrapScripts or remove its schema mutation.",
    }));
  }

  findings.push(...forbiddenPatternFindings(migrationState, policy));

  const approvedRuntimeResiduals = migrationState.runtimeEnsureFunctions.filter((source) => source.exists && policyRuntimePaths.has(source.path));
  const convertedRuntimeResiduals = [];
  const governedRuntimeResiduals = [];
  const temporaryAllowlistResiduals = [];

  for (const source of approvedRuntimeResiduals) {
    const entry = policyRuntimeEntries.get(source.path) ?? {};

    if (policy.currentMode === "warning-only") {
      findings.push(finding({
        category: "approved-runtime-ensure-residual",
        sourcePath: source.path,
        title: "Approved runtime ensure residual remains active",
        impact: "warning-only",
        status: "present",
        recommendation: "Keep this residual visible until the reviewed additive migration ledger cutover is complete.",
        detail: source.description,
      }));
      continue;
    }

    if (policy.currentMode === "waived") {
      findings.push(finding({
        category: "approved-runtime-ensure-residual",
        sourcePath: source.path,
        title: "Approved runtime ensure residual remains active",
        impact: "formally-waived",
        status: "present",
        recommendation: "Keep this residual visible until the reviewed additive migration ledger cutover is complete.",
        detail: source.description,
      }));
      continue;
    }

    if (isConvertedRuntimeEntry(entry)) {
      const convertedValidation = validateConvertedRuntimeMigrationEntry({ entry, sourcePath: source.path, rootDir });
      if (convertedValidation.errors.length > 0) {
        findings.push(finding({
          category: "invalid-converted-runtime-migration",
          sourcePath: source.path,
          title: "Converted runtime ensure source lacks valid reviewed migration evidence",
          impact: "release-blocking",
          status: "invalid",
          recommendation: "Fix the reviewed additive migration artifact before accepting production promotion.",
          detail: convertedValidation.errors.join("; "),
        }));
        continue;
      }
      convertedRuntimeResiduals.push({
        ...source,
        reviewedMigration: convertedValidation.reviewedMigration,
        ledgerEntry: runtimeEntryLedgerEntry(entry) || convertedValidation.reviewedMigration,
        ledgerStatus: RESIDUAL_CLASSIFICATIONS.machineLedgeredAdditive,
        simulation: convertedValidation.simulation,
        classification: RESIDUAL_CLASSIFICATIONS.reviewedAdditive,
      });
      findings.push(finding({
        category: "converted-runtime-ensure-residual",
        sourcePath: source.path,
        title: "Runtime ensure source has a reviewed additive migration",
        impact: "reviewed-additive",
        status: "converted",
        recommendation: "Keep the runtime ensure path as redundant compatibility until a separate task narrows it.",
        detail: `${source.description} Reviewed migration: ${convertedValidation.reviewedMigration}`,
      }));
      continue;
    }

    if (isGovernedRuntimeEntry(entry)) {
      const governedValidation = validateGovernedRuntimeResidualEntry({ entry, sourcePath: source.path, rootDir });
      if (governedValidation.errors.length > 0) {
        findings.push(finding({
          category: "invalid-machine-governed-runtime-residual",
          sourcePath: source.path,
          title: "Machine-governed runtime ensure source lacks valid ledger evidence",
          impact: "release-blocking",
          status: "unresolved",
          recommendation: "Fix the machine-governed ledger entry before accepting production promotion.",
          detail: governedValidation.errors.join("; "),
        }));
        continue;
      }
      governedRuntimeResiduals.push({
        ...source,
        ledgerEntry: governedValidation.ledgerEntry,
        ledgerStatus: governedValidation.ledgerStatus,
        classification: RESIDUAL_CLASSIFICATIONS.reviewedGoverned,
        reason: runtimeEntryReason(entry),
        ownerRole: runtimeEntryOwner(entry),
      });
      findings.push(finding({
        category: "machine-governed-runtime-residual",
        sourcePath: source.path,
        title: "Runtime ensure source is governed by machine-validated ledger evidence",
        impact: "reviewed-governed",
        status: "governed",
        recommendation: "Keep the runtime ensure path as compatibility redundancy until a separate task narrows it.",
        detail: `${source.description} Ledger entry: ${governedValidation.ledgerEntry}`,
      }));
      continue;
    }

    if (isTemporaryRuntimeAllowlistEntry(entry)) {
      const allowlistValidation = validateTemporaryRuntimeAllowlistEntry(entry, generatedAt);
      if (allowlistValidation.errors.length > 0) {
        const expiredOnly = allowlistValidation.expired && allowlistValidation.errors.length === 1;
        findings.push(finding({
          category: expiredOnly ? "expired-temporary-runtime-allowlist" : "invalid-temporary-runtime-allowlist",
          sourcePath: source.path,
          title: expiredOnly
            ? "Temporary runtime ensure allowlist entry is expired"
            : "Temporary runtime ensure allowlist entry is invalid",
          impact: "release-blocking",
          status: expiredOnly ? "expired" : "invalid",
          recommendation: expiredOnly
            ? "Convert the source to a reviewed additive migration before production promotion."
            : "Add reason, ownerRole, future expiresOn, and CERTIFYING:false or convert the source to a reviewed migration.",
          detail: allowlistValidation.errors.join("; "),
        }));
        continue;
      }
      temporaryAllowlistResiduals.push({
        ...source,
        impact: "release-blocking",
        classification: RESIDUAL_CLASSIFICATIONS.temporaryWithExpiry,
        reason: runtimeEntryReason(entry),
        ownerRole: runtimeEntryOwner(entry),
        expiresOn: allowlistValidation.expiresOn,
        CERTIFYING: false,
      });
      findings.push(finding({
        category: "unresolved-temporary-runtime-allowlist",
        sourcePath: source.path,
        title: "Temporary runtime ensure allowlist entry remains active",
        impact: "release-blocking",
        status: "unresolved",
        recommendation: "Production promotion remains blocked until this source is converted to a reviewed additive migration or removed through governed cutover.",
        detail: `${source.description} Expires on: ${allowlistValidation.expiresOn}. Reason: ${runtimeEntryReason(entry)}`,
      }));
      continue;
    }

    findings.push(finding({
      category: "unauthorized-runtime-ensure-source",
      sourcePath: source.path,
      title: "Runtime ensure source is not authorized for production promotion",
      impact: "release-blocking",
      status: "unauthorized",
      recommendation: "Convert the source to a reviewed additive migration or add machine-governed ledger evidence.",
      detail: source.description,
    }));
  }

  const hasRuntimeReleaseBlockingFinding = findings.some((item) =>
    item.impact === "release-blocking" && /runtime.*ensure|runtime.*migration|allowlist/i.test(`${item.category} ${item.title}`),
  );
  const runtimeResidualImpact =
    hasRuntimeReleaseBlockingFinding
      ? "release-blocking"
      : governedRuntimeResiduals.length > 0
        ? "reviewed-governed"
        : convertedRuntimeResiduals.length > 0
          ? "reviewed-additive"
          : policy.currentMode === "warning-only"
            ? "warning-only"
            : policy.currentMode === "waived"
              ? "formally-waived"
              : "none";

  return {
    findings,
    approvedRuntimeResiduals,
    convertedRuntimeResiduals,
    governedRuntimeResiduals,
    temporaryAllowlistResiduals,
    runtimeResidualImpact,
  };
}

export function buildMigrationGateReport({
  rootDir = process.cwd(),
  policy = null,
  policyPath = MIGRATION_GATE_POLICY_PATH,
  migrationState = null,
  scanRoots = DEFAULT_SCAN_ROOTS,
  ledgerDir = DEFAULT_LEDGER_DIR,
  expectedSources = EXPECTED_SCHEMA_SOURCES,
  generatedAt = new Date().toISOString(),
} = {}) {
  const loadedPolicy = policy ?? loadMigrationGatePolicy({ rootDir, policyPath });
  const state =
    migrationState ??
    scanMigrationState({
      rootDir,
      scanRoots,
      ledgerDir,
      expectedSources,
      generatedAt,
    });
  const checkerValidation = validateMigrationGovernanceReport(state);
  const formalWaiver = validateFormalWaiver(loadedPolicy, generatedAt);
  const {
    findings,
    approvedRuntimeResiduals,
    convertedRuntimeResiduals,
    governedRuntimeResiduals,
    temporaryAllowlistResiduals,
    runtimeResidualImpact,
  } = buildGateFindings({
    policy: loadedPolicy,
    migrationState: state,
    expectedSources,
    rootDir,
    generatedAt,
  });
  if (loadedPolicy.currentMode === "waived" && !formalWaiver.accepted) {
    for (const error of formalWaiver.errors) {
      findings.push(finding({
        category: "invalid-formal-waiver",
        title: "Formal migration gate waiver is invalid",
        impact: "release-blocking",
        status: "invalid",
        recommendation: "Add an approved waiver reason, approving role, acceptance timestamp, and expiry.",
        detail: error,
      }));
    }
  }

  const releaseBlockingFindings = findings.filter((item) => item.impact === "release-blocking");
  const warningOnlyFindings = findings.filter((item) => item.impact === "warning-only");
  const waivedFindings = findings.filter((item) => item.impact === "formally-waived");
  const temporaryAllowlistFindings = findings.filter((item) =>
    /temporary.*allowlist/i.test(`${item.category} ${item.title}`),
  );
  const reviewedAdditiveFindings = findings.filter((item) => item.impact === "reviewed-additive");
  const reviewedGovernedFindings = findings.filter((item) => item.impact === "reviewed-governed");
  const hasBlockingFindings = releaseBlockingFindings.length > 0;
  const acceptedReleaseBlocking = loadedPolicy.currentMode === "release-blocking" && !hasBlockingFindings;
  const acceptedFormalWaiver = loadedPolicy.currentMode === "waived" && formalWaiver.accepted && !hasBlockingFindings;
  const releaseGateAccepted = acceptedReleaseBlocking || acceptedFormalWaiver;
  const temporaryAllowlistActive = temporaryAllowlistResiduals.length > 0;
  const CERTIFYING =
    acceptedReleaseBlocking &&
    !temporaryAllowlistActive &&
    approvedRuntimeResiduals.length === convertedRuntimeResiduals.length + governedRuntimeResiduals.length;
  const status = hasBlockingFindings
    ? "failed"
    : acceptedReleaseBlocking
      ? "accepted-release-blocking"
      : acceptedFormalWaiver
        ? "accepted-formal-waiver"
        : "warning-only";
  const approvedRuntimeResidualDetails = approvedRuntimeResiduals.map((source) => {
    const converted = convertedRuntimeResiduals.find((item) => item.path === source.path);
    const governed = governedRuntimeResiduals.find((item) => item.path === source.path);
    const allowlisted = temporaryAllowlistResiduals.find((item) => item.path === source.path);
    const classification = converted
      ? RESIDUAL_CLASSIFICATIONS.reviewedAdditive
      : governed
        ? RESIDUAL_CLASSIFICATIONS.reviewedGoverned
      : allowlisted
        ? RESIDUAL_CLASSIFICATIONS.temporaryWithExpiry
        : RESIDUAL_CLASSIFICATIONS.needsLedger;
    return {
      path: source.path,
      description: source.description,
      impact: converted ? "reviewed-additive" : governed ? "reviewed-governed" : allowlisted ? "release-blocking" : runtimeResidualImpact,
      classification,
      reviewedMigration: converted?.reviewedMigration ?? null,
      ledgerEntry: converted?.ledgerEntry ?? governed?.ledgerEntry ?? null,
      ledgerStatus: converted?.ledgerStatus ?? governed?.ledgerStatus ?? null,
      expiresOn: allowlisted?.expiresOn ?? null,
    };
  });
  const residualMachineStatuses = approvedRuntimeResidualDetails.map((source) => {
    const sourceFindings = findings.filter((item) => item.sourcePath === source.path);
    const expired = sourceFindings.some((item) => /expired.*temporary.*allowlist/i.test(`${item.category} ${item.title}`));
    const unresolved = sourceFindings.some((item) =>
      item.impact === "release-blocking" && /temporary.*allowlist|runtime.*residual|runtime.*ensure|runtime.*migration/i.test(`${item.category} ${item.title}`),
    );
    const classification = expired
      ? RESIDUAL_CLASSIFICATIONS.expired
      : unresolved
        ? RESIDUAL_CLASSIFICATIONS.unresolved
        : source.impact === "reviewed-additive"
          ? RESIDUAL_CLASSIFICATIONS.machineLedgeredAdditive
          : source.impact === "reviewed-governed"
            ? RESIDUAL_CLASSIFICATIONS.reviewedGoverned
            : source.classification === RESIDUAL_CLASSIFICATIONS.needsLedger
              ? RESIDUAL_CLASSIFICATIONS.unresolved
              : source.classification;
    return {
      path: source.path,
      status: expired ? "expired" : unresolved ? "unresolved" : "certifying",
      classification,
      policyClassification: source.classification,
      impact: source.impact,
      ledgerEntry: source.ledgerEntry,
      ledgerStatus: source.ledgerStatus,
      reviewedMigration: source.reviewedMigration,
      expiresOn: source.expiresOn,
      certifying: !expired && !unresolved,
    };
  });

  return {
    reportName: "migration-governance-release-gate",
    evidenceType: "MIGRATION_GATE_EVIDENCE",
    generatedAt,
    branch: safeGit(["branch", "--show-current"], rootDir),
    commit: safeGit(["rev-parse", "HEAD"], rootDir),
    policyPath,
    policyName: loadedPolicy.policyName ?? "unknown",
    policyMode: loadedPolicy.currentMode,
    status,
    CERTIFYING,
    releaseGateAccepted,
    productionPromotionGateAccepted: releaseGateAccepted,
    temporaryAllowlistActive,
    checkerValidation,
    migrationStateSummary: {
      releaseBlockingFindings: state.releaseSummary?.releaseBlockingFindings ?? null,
      warningOnlyFindings: state.releaseSummary?.warningOnlyFindings ?? null,
      unknownSchemaMutationSourceCount: state.unknownSchemaMutationSources?.length ?? 0,
      unledgeredSchemaMutationSourceCount: state.unledgeredSchemaMutationSources?.length ?? 0,
      missingExpectedSourceCount: state.missingExpectedSources?.length ?? 0,
      missingExpectedInventoryEntryCount: state.missingExpectedInventoryEntries?.length ?? 0,
      runtimeEnsureResidualCount: approvedRuntimeResiduals.length,
      convertedRuntimeEnsureResidualCount: convertedRuntimeResiduals.length,
      governedRuntimeEnsureResidualCount: governedRuntimeResiduals.length,
      temporaryAllowlistRuntimeEnsureResidualCount: temporaryAllowlistResiduals.length,
    },
    approvedRuntimeEnsureInventory: loadedPolicy.approvedRuntimeEnsureInventory ?? [],
    allowedBootstrapScripts: loadedPolicy.allowedBootstrapScripts ?? [],
    forbiddenMutationPatterns: loadedPolicy.forbiddenMutationPatterns ?? [],
    releaseGateRequirements: loadedPolicy.releaseGateRequirements ?? [],
    waiverRequirements: loadedPolicy.waiverRequirements ?? [],
    futureCutoverProcedure: loadedPolicy.futureCutoverProcedure ?? [],
    formalWaiver: {
      accepted: formalWaiver.accepted,
      reason: formalWaiver.waiver?.reason ?? null,
      approvedByRole: formalWaiver.waiver?.approvedByRole ?? null,
      acceptedAt: formalWaiver.waiver?.acceptedAt ?? null,
      expiresOn: formalWaiver.waiver?.expiresOn ?? null,
      errors: formalWaiver.errors,
    },
    approvedRuntimeResiduals: approvedRuntimeResidualDetails,
    residualClassifications: approvedRuntimeResidualDetails.map((source) => ({
      path: source.path,
      classification: source.classification,
      impact: source.impact,
      reviewedMigration: source.reviewedMigration,
      ledgerEntry: source.ledgerEntry,
      ledgerStatus: source.ledgerStatus,
      expiresOn: source.expiresOn,
    })),
    residualMachineStatuses,
    convertedRuntimeResiduals: convertedRuntimeResiduals.map((source) => ({
      path: source.path,
      description: source.description,
      impact: "reviewed-additive",
      classification: RESIDUAL_CLASSIFICATIONS.reviewedAdditive,
      machineClassification: RESIDUAL_CLASSIFICATIONS.machineLedgeredAdditive,
      reviewedMigration: source.reviewedMigration,
      ledgerEntry: source.ledgerEntry,
      ledgerStatus: source.ledgerStatus,
      simulation: source.simulation,
    })),
    governedRuntimeResiduals: governedRuntimeResiduals.map((source) => ({
      path: source.path,
      description: source.description,
      impact: "reviewed-governed",
      classification: RESIDUAL_CLASSIFICATIONS.reviewedGoverned,
      ledgerEntry: source.ledgerEntry,
      ledgerStatus: source.ledgerStatus,
      reason: source.reason,
      ownerRole: source.ownerRole,
    })),
    temporaryAllowlistResiduals: temporaryAllowlistResiduals.map((source) => ({
      path: source.path,
      description: source.description,
      impact: "release-blocking",
      classification: RESIDUAL_CLASSIFICATIONS.temporaryWithExpiry,
      reason: source.reason,
      ownerRole: source.ownerRole,
      expiresOn: source.expiresOn,
      CERTIFYING: false,
    })),
    runtimeEnsureResidualImpact: runtimeResidualImpact,
    findings,
    releaseBlockingFindings,
    warningOnlyFindings,
    waivedFindings,
    temporaryAllowlistFindings,
    reviewedAdditiveFindings,
    reviewedGovernedFindings,
    blockerCoverage: {
      migrationGovernance: CERTIFYING,
      productionPromotionGate: releaseGateAccepted,
      temporaryAllowlistActive,
      acceptedReleaseBlocking,
      acceptedFormalWaiver,
    },
    safety: {
      nonMutating: true,
      requiresDatabase: false,
      mutatesDatabase: false,
      executesDdl: false,
      performsRuntimeDdl: false,
      productionMutationAttempted: false,
      schemaChangedByCodex: false,
      runtimeEnsurePathsRemoved: false,
      adHocDdlAdded: false,
    },
    outputPaths: {
      markdown: MIGRATION_GATE_MD_PATH,
      json: MIGRATION_GATE_JSON_PATH,
    },
  };
}

export function validateMigrationGateReport(report) {
  const errors = [];
  if (report.reportName !== "migration-governance-release-gate") errors.push("reportName is invalid.");
  if (report.evidenceType !== "MIGRATION_GATE_EVIDENCE") errors.push("evidenceType is invalid.");
  if (!VALID_POLICY_MODES.has(report.policyMode)) errors.push("policyMode is invalid.");
  if (!report.generatedAt || !report.branch || !report.commit) errors.push("generatedAt, branch, and commit are required.");
  if (report.safety?.nonMutating !== true) errors.push("gate must be non-mutating.");
  if (report.safety?.requiresDatabase !== false) errors.push("gate must not require database access.");
  if (report.safety?.mutatesDatabase !== false) errors.push("gate must not mutate database.");
  if (report.safety?.executesDdl !== false || report.safety?.performsRuntimeDdl !== false) errors.push("gate must not execute DDL.");
  if (report.safety?.productionMutationAttempted === true) errors.push("gate must not mutate production.");
  if (!Array.isArray(report.findings)) errors.push("findings are required.");
  if (report.status === "accepted-release-blocking" && report.policyMode !== "release-blocking") {
    errors.push("accepted-release-blocking status requires release-blocking policy mode.");
  }
  if (report.status === "accepted-temporary-allowlist") {
    errors.push("accepted-temporary-allowlist is retired; active temporary allowlist residuals must fail closed.");
  }
  if (report.status === "accepted-formal-waiver" && (report.policyMode !== "waived" || report.formalWaiver?.accepted !== true)) {
    errors.push("accepted-formal-waiver status requires an accepted formal waiver.");
  }
  if (report.releaseBlockingFindings?.length > 0 && report.releaseGateAccepted === true) {
    errors.push("releaseGateAccepted cannot be true with release-blocking findings.");
  }
  if (report.temporaryAllowlistActive === true && report.releaseGateAccepted === true) {
    errors.push("releaseGateAccepted cannot be true while temporary runtime ensure allowlist entries remain active.");
  }
  if (
    report.temporaryAllowlistActive === true &&
    !report.releaseBlockingFindings?.some((item) => /temporary.*allowlist/i.test(`${item.category} ${item.title}`))
  ) {
    errors.push("active temporary runtime ensure allowlist entries must be release-blocking findings.");
  }
  if (report.temporaryAllowlistActive === true && report.CERTIFYING === true) {
    errors.push("CERTIFYING cannot be true while temporary runtime ensure allowlist entries remain active.");
  }
  if (report.CERTIFYING === true && Array.isArray(report.residualMachineStatuses)) {
    for (const residual of report.residualMachineStatuses) {
      if (["unresolved", "expired"].includes(residual.status) || ["unresolved", "expired"].includes(residual.classification)) {
        errors.push(`CERTIFYING cannot be true with ${residual.classification} migration residual ${residual.path}.`);
      }
      if (!residual.ledgerStatus || !residual.ledgerEntry) {
        errors.push(`CERTIFYING migration residual ${residual.path} requires ledgerStatus and ledgerEntry.`);
      }
    }
  }
  if (report.blockerCoverage?.migrationGovernance === true && report.releaseGateAccepted !== true) {
    errors.push("migration governance blocker coverage requires an accepted release gate.");
  }
  return { ok: errors.length === 0, errors };
}

export function renderMigrationGateReport(report) {
  const lines = [
    "# Migration Governance Release Gate",
    "",
    "Safety: non-mutating static source and policy validation only; no database connection, credentials, runtime DDL, or schema mutation.",
    `Generated at: ${report.generatedAt}`,
    `Branch: ${report.branch}`,
    `Commit: ${report.commit}`,
    `Policy: ${report.policyPath}`,
    `Policy mode: ${report.policyMode}`,
    `Status: ${report.status}`,
    `CERTIFYING:${report.CERTIFYING ? "true" : "false"}`,
    `Release gate accepted: ${report.releaseGateAccepted ? "yes" : "no"}`,
    `Production promotion gate accepted: ${report.productionPromotionGateAccepted ? "yes" : "no"}`,
    "",
    "## Gate Summary",
    "",
    `- Unknown mutation sources: ${report.migrationStateSummary.unknownSchemaMutationSourceCount}`,
    `- Unledgered mutation sources: ${report.migrationStateSummary.unledgeredSchemaMutationSourceCount}`,
    `- Missing expected sources: ${report.migrationStateSummary.missingExpectedSourceCount}`,
    `- Missing expected inventory entries: ${report.migrationStateSummary.missingExpectedInventoryEntryCount}`,
    `- Runtime ensure residuals: ${report.migrationStateSummary.runtimeEnsureResidualCount}`,
    `- Converted reviewed runtime ensure residuals: ${report.migrationStateSummary.convertedRuntimeEnsureResidualCount}`,
    `- Machine-governed runtime ensure residuals: ${report.migrationStateSummary.governedRuntimeEnsureResidualCount}`,
    `- Temporary allowlist runtime ensure residuals: ${report.migrationStateSummary.temporaryAllowlistRuntimeEnsureResidualCount}`,
    `- Runtime ensure residual impact: ${report.runtimeEnsureResidualImpact}`,
    "",
    "## Formal Waiver",
    "",
    `- Accepted: ${report.formalWaiver.accepted ? "yes" : "no"}`,
    `- Approved by role: ${report.formalWaiver.approvedByRole ?? "n/a"}`,
    `- Accepted at: ${report.formalWaiver.acceptedAt ?? "n/a"}`,
    `- Expires on: ${report.formalWaiver.expiresOn ?? "n/a"}`,
    `- Reason: ${report.formalWaiver.reason ?? "n/a"}`,
    "",
    "## Approved Runtime Ensure Residuals",
    "",
    ...(report.approvedRuntimeResiduals.length
      ? report.approvedRuntimeResiduals.map((source) =>
          `- [${source.impact}] ${source.path}: ${source.description}; classification ${source.classification}`,
        )
      : ["- None."]),
    "",
    "## Residual Classifications",
    "",
    ...(report.residualClassifications?.length
      ? report.residualClassifications.map((source) =>
          `- ${source.path}: ${source.classification}; impact ${source.impact}; ledger status ${source.ledgerStatus ?? "n/a"}; ledger ${source.ledgerEntry ?? "n/a"}; reviewed migration ${source.reviewedMigration ?? "n/a"}; expires ${source.expiresOn ?? "n/a"}`,
        )
      : ["- None."]),
    "",
    "## Machine Residual Statuses",
    "",
    ...(report.residualMachineStatuses?.length
      ? report.residualMachineStatuses.map((source) =>
          `- ${source.path}: ${source.classification}; status ${source.status}; ledger status ${source.ledgerStatus ?? "n/a"}; ledger ${source.ledgerEntry ?? "n/a"}`,
        )
      : ["- None."]),
    "",
    "## Converted Reviewed Runtime Ensure Residuals",
    "",
    ...(report.convertedRuntimeResiduals.length
      ? report.convertedRuntimeResiduals.map((source) => `- [${source.impact}] ${source.path}: ${source.reviewedMigration}`)
      : ["- None."]),
    "",
    "## Machine-Governed Runtime Ensure Residuals",
    "",
    ...(report.governedRuntimeResiduals.length
      ? report.governedRuntimeResiduals.map((source) => `- [${source.impact}] ${source.path}: ${source.ledgerEntry}; ledger status ${source.ledgerStatus}`)
      : ["- None."]),
    "",
    "## Temporary Runtime Ensure Allowlist",
    "",
    ...(report.temporaryAllowlistResiduals.length
      ? report.temporaryAllowlistResiduals.map((source) =>
          `- [release-blocking/CERTIFYING:false] ${source.path}: expires ${source.expiresOn}; owner ${source.ownerRole}; classification ${source.classification}; reason ${source.reason}`,
        )
      : ["- None."]),
    "",
    "## Gate Findings",
    "",
    ...(report.findings.length
      ? report.findings.map((item) => `- [${item.impact}] ${item.category}: ${item.sourcePath ?? "policy"} (${item.status}) - ${item.recommendation}`)
      : ["- None."]),
    "",
    "## Future Cutover Procedure",
    "",
    ...(report.futureCutoverProcedure.length ? report.futureCutoverProcedure.map((item) => `- ${item}`) : ["- Not recorded."]),
  ];
  return `${lines.join("\n")}\n`;
}

export function writeMigrationGateEvidence(report, {
  rootDir = process.cwd(),
  evidenceDir = DEFAULT_MIGRATION_EVIDENCE_DIR,
} = {}) {
  const validation = validateMigrationGateReport(report);
  if (!validation.ok) {
    throw new Error(`Migration gate report validation failed: ${validation.errors.join("; ")}`);
  }
  const markdownPath = normalizeRelativePath(path.join(evidenceDir, MIGRATION_GATE_MARKDOWN));
  const jsonPath = normalizeRelativePath(path.join(evidenceDir, MIGRATION_GATE_JSON));
  writeText(rootDir, markdownPath, renderMigrationGateReport(report));
  writeText(rootDir, jsonPath, `${JSON.stringify({ ...report, validation }, null, 2)}\n`);
  return { markdownPath, jsonPath };
}

function nextValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(args) {
  const options = {
    rootDir: process.cwd(),
    policyPath: MIGRATION_GATE_POLICY_PATH,
    evidenceDir: DEFAULT_MIGRATION_EVIDENCE_DIR,
    json: false,
    writeEvidence: true,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (REFUSED_FLAGS.has(arg)) {
      throw new Error(`${arg} is refused. Migration gate is static and non-mutating.`);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-write-evidence") {
      options.writeEvidence = false;
      continue;
    }
    if (arg === "--write-evidence") {
      options.writeEvidence = true;
      continue;
    }
    if (arg === "--root") {
      options.rootDir = path.resolve(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--policy") {
      options.policyPath = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--evidence-dir") {
      options.evidenceDir = normalizeRelativePath(nextValue(args, index, arg));
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    "Usage: pnpm run migrations:gate -- [options]",
    "",
    "Static, non-mutating migration governance release gate.",
    "Writes docs/production-scale/evidence/latest-migration-gate.{md,json}.",
    "",
    "Options:",
    "  --json                    Print JSON report instead of Markdown.",
    "  --write-evidence          Write evidence outputs. Default.",
    "  --no-write-evidence       Do not write evidence outputs.",
    "  --root <path>             Project root. Defaults to current working directory.",
    "  --policy <path>           Policy path. Defaults to docs/production-scale/migration-governance-policy.json.",
    "  --evidence-dir <path>     Output directory. Defaults to docs/production-scale/evidence.",
    "",
    "Refused:",
    "  --apply, --execute, --run-ddl, --ddl, --mutate, --write-db",
  ].join("\n"));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = buildMigrationGateReport({
    rootDir: options.rootDir,
    policyPath: options.policyPath,
  });
  const validation = validateMigrationGateReport(report);
  if (!validation.ok) {
    throw new Error(`Migration gate report validation failed: ${validation.errors.join("; ")}`);
  }
  let outputs = null;
  if (options.writeEvidence) {
    outputs = writeMigrationGateEvidence(report, {
      rootDir: options.rootDir,
      evidenceDir: options.evidenceDir,
    });
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMigrationGateReport(report));
  }
  if (outputs) {
    console.log(`Evidence Markdown: ${outputs.markdownPath}`);
    console.log(`Evidence JSON: ${outputs.jsonPath}`);
  }
  if (report.status === "failed") process.exitCode = 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
