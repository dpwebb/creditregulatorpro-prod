import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function source(filePath: string): string {
  return readFileSync(path.join(projectRoot, filePath), "utf8");
}

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    return statSync(fullPath).isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function sourceFilesUnder(...roots: string[]): string[] {
  return roots
    .flatMap((root) => walkFiles(path.join(projectRoot, root)))
    .map((filePath) => toPosix(path.relative(projectRoot, filePath)))
    .filter((filePath) => /\.(ts|tsx)$/.test(filePath))
    .sort();
}

describe("platform continuity ADR characterization", () => {
  it("pins the top-level protected workflow map and no-consolidation gates", () => {
    const map = source("docs/architecture/platform-continuity-map.md");

    expect(map).toContain("upload PDF");
    expect(map).toContain("-> reportArtifact");
    expect(map).toContain("-> ingest process/worker");
    expect(map).toContain("-> canonical extractor");
    expect(map).toContain("-> deterministic parser package");
    expect(map).toContain("-> persisted tradelines");
    expect(map).toContain("-> compliance scan");
    expect(map).toContain("-> evidence location index / rule evidence");
    expect(map).toContain("-> packet readiness");
    expect(map).toContain("-> packet record");
    expect(map).toContain("-> packet PDF / cache / delivery");

    for (const gate of [
      "legacy DocStrange/diagnostic paths",
      "regulationInfractionScanner paths",
      "scanner manifest-driven execution",
      "readiness rule changes",
      "schema/cascade changes",
      "canonical field model changes",
      "admin truth-layer changes",
      "user deletion/reset cascade logic",
      "evidence hash-chain/event-ledger behavior",
    ]) {
      expect(map).toContain(gate);
    }
  });
});

describe("compliance scanner continuity characterization", () => {
  it("keeps canonical scan persistence on complianceScanner with rule evidence and packet gate metadata", () => {
    const adr = source("docs/architecture/adr-002-compliance-scanner-source-of-truth.md");
    const ingestCore = source("helpers/ingestCorePipeline.tsx");
    const scanner = source("helpers/complianceScanner.tsx");

    expect(adr).toContain("`helpers/complianceScanner.tsx` is the canonical scanner owner");
    expect(ingestCore).toContain("scanAndPersistViolations");
    expect(scanner).toContain("export async function scanAndPersistViolations");
    expect(scanner).toContain("const violations = await scanForViolations(tradelineId, context)");
    expect(scanner).toContain("const insertedIds = await persistViolations(violations, tradelineId");
    expect(scanner).toContain("enrichDetectedViolationsRuleEvidence");
    expect(scanner).toContain("filterViolationsWithLocalAuthorityLinks");
    expect(scanner).toContain("evaluateViolationPacketConfidenceGate");
    expect(scanner).toContain("enrichDetectedViolationDefensibilityMetadata");
    expect(scanner).toContain("getDeterministicViolationStatutoryBasis");
    expect(scanner).toContain("complianceFindingReplacement");
    expect(scanner).toContain("validationStatus");
  });

  it("characterizes overlapping scanner paths without allowing them to replace the canonical scanner", () => {
    const adr = source("docs/architecture/adr-002-compliance-scanner-source-of-truth.md");
    const detectors = source("helpers/complianceDetectors.tsx");
    const infractionScanner = source("helpers/regulationInfractionScanner.tsx");
    const rescanEndpoint = source("endpoints/tradeline/rescan-compliance_POST.ts");

    expect(adr).toContain("runAllTradelineDetectors");
    expect(adr).toContain("regulationInfractionScanner");
    expect(adr).toContain("endpoints/tradeline/rescan-compliance_POST.ts");
    expect(detectors).toContain("export async function runAllTradelineDetectors");
    expect(infractionScanner).toContain("export function scanForInfractions");

    expect(rescanEndpoint).toContain("scanForViolations");
    expect(rescanEndpoint).toContain("normalizeDetectedViolations");
    expect(rescanEndpoint).toContain("evaluateViolationPacketConfidenceGate");
    expect(rescanEndpoint).toContain("getDeterministicViolationStatutoryBasis");
    expect(rescanEndpoint).toContain("technicalDetails");
    expect(rescanEndpoint).toContain("statutoryBasis");
    expect(rescanEndpoint).toContain("validationStatus");
    expect(rescanEndpoint).not.toContain("runAllTradelineDetectors");
    expect(rescanEndpoint).not.toContain("scanForInfractions");
  });
});

describe("evidence location and ledger continuity characterization", () => {
  it("keeps source-location and violation evidence ownership split from ledger writing", () => {
    const adr = source("docs/architecture/adr-003-evidence-location-and-ledger-ownership.md");
    const locationIndex = source("helpers/evidenceLocationIndex.ts");
    const ruleEvidence = source("helpers/violationRuleEvidence.ts");
    const ledger = source("helpers/evidenceEventLedger.ts");

    expect(adr).toContain("`helpers/evidenceLocationIndex.ts` owns source-location indexing");
    expect(adr).toContain("`helpers/violationRuleEvidence.ts` owns violation-to-evidence enrichment");
    expect(adr).toContain("`helpers/evidenceEventLedger.ts` should be treated as the canonical evidence event ledger boundary");
    expect(locationIndex).toContain("export function buildEvidenceLocationIndex");
    expect(locationIndex).toContain("export function resolveEvidenceLocation");
    expect(ruleEvidence).toContain("enrichDetectedViolationRuleEvidence");
    expect(ruleEvidence).toContain("resolveEvidenceLocation");
    expect(ledger).toContain("export async function appendEvidenceEvent");
    expect(ledger).toContain(".forUpdate()");
    expect(ledger).toContain(".insertInto(\"evidenceEvent\")");
    expect(ledger).toContain("buildEvidenceEventHashPayload");
  });

  it("pins current direct evidence-event writers so migration cannot silently miss one", () => {
    const files = sourceFilesUnder("helpers", "endpoints")
      .filter((filePath) => source(filePath).includes('insertInto("evidenceEvent")'));

    expect(files).toEqual([
      "endpoints/clock/scan_POST.ts",
      "endpoints/evidence/bureau-communication_POST.ts",
      "endpoints/packet/delivery_POST.ts",
      "endpoints/packet/send-first-class_POST.ts",
      "endpoints/packet/send-registered_POST.ts",
      "endpoints/webhook/postgrid_POST.ts",
      "endpoints/webhook/tracking_POST.ts",
      "helpers/cronClockScan.tsx",
      "helpers/disputeOutcomeEvaluator.tsx",
      "helpers/evidenceEventLedger.ts",
      "helpers/ingestCorePipeline.tsx",
      "helpers/packetPdfCache.ts",
      "helpers/silentCorrectionDetector.tsx",
    ]);

    for (const filePath of files.filter((filePath) => filePath !== "helpers/evidenceEventLedger.ts")) {
      expect(source(filePath)).toContain("evidenceEvent");
    }
  });
});

describe("packet create/save and PDF continuity characterization", () => {
  it("keeps create canonical and save compatible through the same packet service", () => {
    const adr = source("docs/architecture/adr-004-packet-create-save-compatibility.md");
    const createEndpoint = source("endpoints/packet/create_POST.ts");
    const saveEndpoint = source("endpoints/packet/save_POST.ts");
    const packetQueries = source("helpers/packetQueries.tsx");
    const packetService = source("helpers/disputePacketService.ts");

    expect(adr).toContain("`_api/packet/create` is the canonical packet creation path");
    expect(adr).toContain("`_api/packet/save` appears to be a compatibility or duplicate route");
    expect(createEndpoint).toContain("createDisputePacketRecord");
    expect(saveEndpoint).toContain("createDisputePacketRecord");
    expect(createEndpoint).toContain("getServerUserSession");
    expect(saveEndpoint).toContain("getServerUserSession");
    expect(packetQueries).toContain("postPacketCreate");
    expect(packetQueries).not.toContain("postPacketSave");
    expect(packetService).toContain("export async function validateDisputePacketReadiness");
    expect(packetService).toContain("export async function buildDisputePacketPreview");
    expect(packetService).toContain("export async function createDisputePacketRecord");
    expect(packetService).toContain("assertPacketReadiness(readiness)");
    expect(packetService).toContain("appendEvidenceEvent");
    expect(packetService).toContain("PACKET_GENERATED");
  });

  it("keeps packet PDF rendering behind stored packet content parsing", () => {
    const pdfEndpoint = source("endpoints/packet/pdf_GET.ts");
    const packetPdfContent = source("helpers/packetPdfContent.ts");
    const disputePacketPdf = source("helpers/disputePacketPdf.ts");

    expect(pdfEndpoint).toContain("parseStoredPacketContent");
    expect(pdfEndpoint).toContain("generatePacketContentPdfBase64");
    expect(pdfEndpoint).toContain("getOrRenderPacketPdfBase64");
    expect(packetPdfContent).toContain("export function parseStoredPacketContent");
    expect(packetPdfContent).toContain("export async function generatePacketContentPdfBase64");
    expect(packetPdfContent).toContain("generateDisputePacketPDF");
    expect(disputePacketPdf).toContain("assertPacketNarrativesReadyForPdf");
    expect(disputePacketPdf).toContain("export async function generateDisputePacketPDF");
  });
});

describe("user deletion and reset continuity characterization", () => {
  it("keeps user-owned deletion, report cascade deletion, and platform reset separate", () => {
    const adr = source("docs/architecture/adr-005-user-deletion-reset-ownership.md");
    const userDeletion = source("helpers/userDataDeletion.ts");
    const reportCascade = source("helpers/deleteReportArtifactCascade.tsx");
    const platformReset = source("scripts/reset-platform.mjs");
    const platformResetEndpoint = source("endpoints/admin/platform-reset/confirm_POST.ts");

    expect(adr).toContain("`helpers/userDataDeletion.ts` should be treated as the intended canonical user-owned deletion/reset service");
    expect(adr).toContain("`helpers/deleteReportArtifactCascade.tsx` owns report-artifact cascade deletion");
    expect(adr).toContain("`scripts/reset-platform.mjs` is platform-level reset logic");
    expect(userDeletion).toContain("export async function deleteUserDataCategories");
    expect(userDeletion).toContain("export async function deleteUserAccountCascade");
    expect(userDeletion).toContain("deleteUserReportDataCascade");
    expect(userDeletion).toContain("deleteStoredFiles(storageUrls)");
    expect(userDeletion).toContain("runOptionalDeleteStep");
    expect(userDeletion).toContain("42P01");
    expect(userDeletion).toContain("42703");
    expect(userDeletion).toContain("runDynamicUserFkCleanup");
    expect(reportCascade).toContain("export async function deleteReportArtifactCascade");
    expect(reportCascade).toContain("export async function deleteUserReportDataCascade");
    expect(platformReset).toContain("export function buildResetPlan");
    expect(platformReset).toContain("export function detectResetRuntimeContext");
    expect(platformResetEndpoint).toContain("runReset");
    expect(platformResetEndpoint).not.toContain("deleteUserDataCategories");
    expect(platformResetEndpoint).not.toContain("deleteUserAccountCascade");
  });

  it("characterizes admin delete-user as separate overlapping cascade logic", () => {
    const adr = source("docs/architecture/adr-005-user-deletion-reset-ownership.md");
    const adminDelete = source("endpoints/admin/delete-user_POST.ts");
    const userDeletion = source("helpers/userDataDeletion.ts");

    expect(adr).toContain("`endpoints/admin/delete-user_POST.ts` currently appears to contain overlapping inline cascade logic");
    expect(adminDelete).toContain("deleteReportArtifactCascade");
    expect(adminDelete).toContain("deleteTradeline");
    expect(adminDelete).toContain("runDynamicUserFkCleanup");
    expect(userDeletion).toContain("runDynamicUserFkCleanup");
    expect(adminDelete).toContain("Cannot delete an admin account");
    expect(adminDelete).toContain("Cannot delete the current admin account");
    expect(adminDelete).toContain("Confirmation email does not match the target user's email");
  });
});

describe("admin authorization continuity characterization", () => {
  it("keeps client ProtectedRoute out of server authorization boundaries", () => {
    const adr = source("docs/architecture/adr-006-admin-authorization-policy.md");
    const protectedRoute = source("components/ProtectedRoute.tsx");

    expect(adr).toContain("`components/ProtectedRoute.tsx` is client-side route protection only");
    expect(adr).toContain("Server endpoints must not rely on client-side route protection");
    expect(protectedRoute).toContain("export const AdminRoute");
    expect(protectedRoute).toContain("MakeProtectedRoute([\"admin\"])");

    for (const filePath of sourceFilesUnder("endpoints/admin")) {
      expect(source(filePath)).not.toContain("ProtectedRoute");
      expect(source(filePath)).not.toContain("AdminRoute");
    }
  });

  it("keeps high-risk admin endpoints guarded by server session and role checks before migration", () => {
    const adminEndpoints = [
      "endpoints/admin/delete-user_POST.ts",
      "endpoints/admin/reset-user_POST.ts",
      "endpoints/admin/users_GET.ts",
      "endpoints/admin/audit-logs_GET.ts",
      "endpoints/admin/compliance-config_POST.ts",
    ];

    for (const filePath of adminEndpoints) {
      const handler = source(filePath);
      expect(handler).toContain("getServerUserSession");
      expect(handler).toMatch(/role\s*!==\s*["']admin["']|Admin (?:access|privileges) required|Only admins/i);
    }

    const platformResetShared = source("endpoints/admin/platform-reset/shared.ts");
    expect(platformResetShared).toContain("getServerUserSession");
    expect(platformResetShared).toContain("requirePlatformResetAdmin");
    expect(platformResetShared).toContain("admin");
    expect(platformResetShared).toContain("super_admin");
  });
});

