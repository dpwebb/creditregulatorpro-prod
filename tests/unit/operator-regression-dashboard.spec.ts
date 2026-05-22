import { describe, expect, it } from "vitest";

import {
  applyRunResults,
  buildDashboardReleaseEvidenceSemantics,
  buildOperatorDashboard,
  DASHBOARD_SAFETY_BOUNDARIES,
  filterDashboard,
  GATED_SMOKE_CHECKS,
  KNOWN_SCALE_GAPS,
  listChecks,
  parseArgs,
  renderDashboard,
  SAFE_RUN_CHECK_COMMANDS,
} from "../../scripts/operator-regression-dashboard";

function fakeGit(statusShort = "") {
  return (args: string[]) => {
    const key = args.join(" ");
    if (key === "status --short") return statusShort;
    if (key === "branch --show-current") return "staging";
    if (key === "rev-parse HEAD") return "b52ca35406e5a4c51c39efc515897a6a082da616";
    if (key === "log -1 --pretty=%s") return "Add production readiness checklist";
    return "";
  };
}

function fakeIngestMetrics(
  overrides: Partial<NonNullable<Parameters<typeof buildOperatorDashboard>[0]["ingestQueueMetrics"]>> = {},
) {
  return {
    generatedAt: "2026-05-20T00:00:00.000Z",
    totalJobs: 5,
    queuedJobs: 1,
    runningJobs: 1,
    failedJobs: 1,
    deadLetteredJobs: 2,
    canceledJobs: 0,
    staleRunningJobs: 1,
    retryBacklogJobs: 1,
    oldestQueuedAgeSeconds: 120,
    cleanupAttemptedEvents: 3,
    cleanupFailedEvents: 2,
    cleanupFailedJobs: 2,
    operatorRemediationEvents: 4,
    deadLetterReviewedJobs: 1,
    staleRunningReviewedJobs: 1,
    lastRemediationStatus: "operator_remediation_action",
    lastRemediationAt: "2026-05-20T00:01:00.000Z",
    ...overrides,
  };
}

function fakePacketPdfMetrics(
  overrides: Partial<NonNullable<Parameters<typeof buildOperatorDashboard>[0]["packetPdfMetrics"]>> = {},
) {
  return {
    generatedAt: "2026-05-20T00:00:00.000Z",
    renderAttemptEvents: 4,
    renderSucceededEvents: 3,
    renderFailedEvents: 1,
    cacheHitEvents: 2,
    latestFailureAt: "2026-05-20T00:02:00.000Z",
    ...overrides,
  };
}

function fakeProductionObservabilityMetrics(
  overrides: Partial<NonNullable<Parameters<typeof buildOperatorDashboard>[0]["productionObservabilityMetrics"]>> = {},
) {
  const metrics = {
    generatedAt: "2026-05-20T00:00:00.000Z",
    lookbackHours: 24,
    ingest: {
      available: true,
      queuedJobs: 20,
      runningJobs: 1,
      succeededJobs: 30,
      failedJobs: 3,
      deadLetteredJobs: 1,
      staleRunningJobs: 0,
      retryBacklogJobs: 2,
      oldestQueuedAgeSeconds: 1200,
      ocrParsingStartedEvents: 10,
      complianceScanStartedEvents: 9,
      averageOcrParsingDurationMs: 2000,
      totalOcrPageCount: 45,
    },
    ocrParser: {
      artifactsObserved: 40,
      ocrSucceededArtifacts: 6,
      ocrFailureCount: 1,
      parserFailureCount: 0,
      parserUncertaintyCount: 6,
      parserIssueCount: 8,
    },
    packetPdf: {
      renderAttemptEvents: 5,
      renderSucceededEvents: 4,
      renderFailedEvents: 1,
      cacheHitEvents: 7,
    },
    storage: {
      failureEvents: 1,
      readFailures: 1,
      writeFailures: 0,
      deleteFailures: 0,
      latestFailureAt: "2026-05-20T00:03:00.000Z",
    },
    auth: {
      loginSuccessEvents: 12,
      loginFailureEvents: 8,
      loginAttemptFailures: 3,
    },
    db: {
      poolMax: 3,
      idleTimeoutSeconds: 10,
      latencyMs: 300,
      activeConnections: 4,
    },
    rateLimit: {
      activeEntries: 51,
      maxObservedCount: 120,
    },
    boundaries: {
      noRawPdfBytes: true,
      noRawExtractedText: true,
      noFullConsumerPii: true,
      noSecretsTokensOrCookies: true,
      aggregateCountsOnly: true,
      storageObjectNamesHashed: true,
      businessLogicMutated: false,
      parserOutputMutated: false,
      violationTruthMutated: false,
      packetReadinessMutated: false,
      responseQueueSemanticsMutated: false,
    },
  };
  return {
    ...metrics,
    thresholds: [
      { key: "ingest_queued_jobs", label: "Ingest queued jobs", status: "OK" as const, value: 20, warning: 25, critical: 100 },
      { key: "ingest_failed_jobs", label: "Ingest failed jobs", status: "Warning" as const, value: 3, warning: 3, critical: 10 },
      { key: "ingest_dead_letters", label: "Ingest dead letters", status: "Critical" as const, value: 1, warning: 1, critical: 1 },
      { key: "ingest_stale_running", label: "Ingest stale running jobs", status: "OK" as const, value: 0, warning: 1, critical: 1 },
      { key: "ingest_oldest_queued_age", label: "Oldest queued ingest age seconds", status: "OK" as const, value: 1200, warning: 3600, critical: 14400 },
      { key: "ocr_failures", label: "OCR failures", status: "Warning" as const, value: 1, warning: 1, critical: 3 },
      { key: "parser_failures", label: "Parser failures", status: "OK" as const, value: 0, warning: 1, critical: 3 },
      { key: "parser_uncertainty", label: "Parser uncertainty/manual review", status: "Warning" as const, value: 6, warning: 5, critical: 20 },
      { key: "packet_pdf_failures", label: "Packet PDF failures", status: "Warning" as const, value: 1, warning: 1, critical: 3 },
      { key: "storage_failures", label: "Storage failures", status: "Warning" as const, value: 1, warning: 1, critical: 3 },
      { key: "auth_failures", label: "Auth failures", status: "Warning" as const, value: 11, warning: 10, critical: 25 },
      { key: "rate_limit_active_entries", label: "Rate-limit active entries", status: "Warning" as const, value: 51, warning: 50, critical: 200 },
      { key: "rate_limit_max_count", label: "Rate-limit max observed count", status: "Warning" as const, value: 120, warning: 100, critical: 500 },
      { key: "db_latency_ms", label: "DB latency proxy ms", status: "Warning" as const, value: 300, warning: 250, critical: 1000 },
      { key: "db_active_connections", label: "DB active connections", status: "OK" as const, value: 4, warning: 20, critical: 50 },
    ],
    ...overrides,
  };
}

describe("operator regression dashboard", () => {
  it("prints the required dashboard categories", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const output = renderDashboard(report);

    expect(output).toContain("Repository / Release State");
    expect(output).toContain("Limited beta operator policy exists");
    expect(output).toContain("Core Logical Regression");
    expect(output).toContain("Auth / Session Lifecycle");
    expect(output).toContain("Admin Audit / Activity Logs");
    expect(output).toContain("Production Observability");
    expect(output).toContain("Packet Reliability");
    expect(output).toContain("Outcome Tracking");
    expect(output).toContain("Report Ingest / Retrieval");
    expect(output).toContain("Ingest queue health");
    expect(output).toContain("Violation Search / Status");
    expect(output).toContain("Evidence / Coordinate Coverage");
    expect(output).toContain("Regulation / Governance");
    expect(output).toContain("Public / Internal Exposure");
    expect(output).toContain("Manual / Gated Smoke");
    expect(output).toContain("Known Coverage Gaps");
  });

  it("supports json-shaped reports and category filtering", () => {
    const report = filterDashboard(
      buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true }),
      "packet",
    );

    expect(report.branch).toBe("staging");
    expect(report.commit).toBe("b52ca35406e5a4c51c39efc515897a6a082da616");
    expect(report.workingTreeClean).toBe(true);
    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].name).toBe("Packet Reliability");
    expect(report.summary.skip).toBeGreaterThan(0);
  });

  it("supports list-checks output data", () => {
    const checks = listChecks(buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true }));

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "Repository / Release State",
          name: "Limited beta operator policy exists",
        }),
        expect.objectContaining({
          category: "Core Logical Regression",
          name: "Golden Path",
          command: "pnpm run test:golden-path",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Manual / Gated Smoke",
          name: "Runtime Bridge Mapping smoke",
          requiresCredentials: true,
        }),
        expect.objectContaining({
          category: "Packet Reliability",
          name: "Packet PDF render health",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Production Observability",
          name: "Production observability metrics",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Packet Reliability",
          name: "Packet PDF cache",
          command: "pnpm exec vitest run tests/unit/packet-pdf-cache.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Packet Reliability",
          name: "Packet delivery/status endpoint",
          command: "pnpm exec vitest run tests/api/packet-delivery-status-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Outcome comparison helper",
          command: "pnpm exec vitest run tests/unit/outcome-comparison.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Persisted outcome tracking endpoint",
          command: "pnpm exec vitest run tests/api/outcome-tracking-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Outcome admin-review endpoint",
          command: "pnpm exec vitest run tests/api/outcome-admin-review-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Outcome admin-review UI",
          command: "pnpm exec vitest run tests/unit/outcome-admin-review-ui.spec.tsx",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response document capture endpoint",
          command: "pnpm exec vitest run tests/api/response-document-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response document admin-review endpoint",
          command: "pnpm exec vitest run tests/api/response-document-admin-review-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response classification engine",
          command: "pnpm exec vitest run tests/unit/response-classification-engine.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response replay/backfill dry-run",
          command: "pnpm run response:replay -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response processing worker dry-run",
          command: "pnpm run response:worker -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response worker orchestration dry-run",
          command: "pnpm run response:worker-orchestrate -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response scheduler activation conditions",
          command: "pnpm run response:worker-orchestrate -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response external alert dry-run boundary",
          command: "pnpm run alerts:dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response queue service",
          command: "pnpm exec vitest run tests/api/response-processing-queue.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response queue remediation endpoint",
          command: "pnpm exec vitest run tests/api/response-processing-queue-remediation-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response worker orchestration service",
          command: "pnpm exec vitest run tests/api/response-worker-orchestration.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response lifecycle retention and drift",
          command: "pnpm exec vitest run tests/api/response-processing-lifecycle.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response worker orchestration CLI",
          command: "pnpm exec vitest run tests/unit/response-processing-worker-orchestrator-script.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response lifecycle CLI",
          command: "pnpm exec vitest run tests/unit/response-processing-lifecycle-script.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response queue synthetic load",
          command: "pnpm run response:queue-load-check",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response worker orchestration synthetic check",
          command: "pnpm run response:orchestration-check",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response lifecycle retention dry-run",
          command: "pnpm run response:lifecycle -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response purge/archive readiness",
          command: "pnpm run response:lifecycle -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response historical backfill plan",
          command: "pnpm run response:replay -- --dry-run",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response remediation operator controls",
          command: "pnpm exec vitest run tests/api/response-processing-queue-remediation-endpoint.spec.ts",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response processing soak check",
          command: "pnpm run response:soak-check",
          runByDefault: false,
        }),
        expect.objectContaining({
          category: "Outcome Tracking",
          name: "Response document admin UI",
          command: "pnpm exec vitest run tests/unit/response-document-ui.spec.tsx",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Auth / Session Lifecycle",
          name: "Auth session lifecycle endpoint",
          command: "pnpm exec vitest run tests/api/auth-session-lifecycle-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Admin Audit / Activity Logs",
          name: "Admin audit log endpoint",
          command: "pnpm exec vitest run tests/api/admin-audit-log-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Violation Search / Status",
          name: "Violation search/status endpoint",
          command: "pnpm exec vitest run tests/api/violation-search-status-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Report Ingest / Retrieval",
          name: "Report ingest lifecycle endpoint",
          command: "pnpm exec vitest run tests/api/report-ingest-lifecycle-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Report Ingest / Retrieval",
          name: "Ingest lifecycle remediation endpoint",
          command: "pnpm exec vitest run tests/api/ingest-processing-lifecycle-remediation-endpoint.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Report Ingest / Retrieval",
          name: "Ingest cleanup lifecycle events",
          command: "pnpm exec vitest run tests/unit/ingest-cleanup-lifecycle.spec.ts",
          runByDefault: true,
        }),
        expect.objectContaining({
          category: "Evidence / Coordinate Coverage",
          name: "Evidence privacy endpoint",
          command: "pnpm exec vitest run tests/api/evidence-privacy-endpoint.spec.ts",
          runByDefault: true,
        }),
      ]),
    );
  });

  it("does not call production endpoints, create data, promote, or activate runtime truth", () => {
    expect(DASHBOARD_SAFETY_BOUNDARIES).toMatchObject({
      modifiesFiles: false,
      callsProductionWithCredentials: false,
      touchesProductionDb: false,
      createsData: false,
      promotesProduction: false,
      activatesRuntimeBridgeMappings: false,
      generatesPackets: false,
      usesRealConsumerData: false,
      runsAuthenticatedSmokeByDefault: false,
    });

    const commands = SAFE_RUN_CHECK_COMMANDS.join("\n");
    expect(commands).not.toMatch(/creditregulatorpro\.com|DATABASE_URL|promote:production|packet\/create|activate/i);
  });

  it("surfaces ingest dead-letter, stale-running, and failed-cleanup counts", () => {
    const report = buildOperatorDashboard({
      runGit: fakeGit(),
      fileExists: () => true,
      ingestQueueMetrics: fakeIngestMetrics(),
    });
    const rendered = renderDashboard(report);

    expect(rendered).toContain("[OPEN] Ingest queue health");
    expect(rendered).toContain("dead-letter jobs: 2");
    expect(rendered).toContain("stale running jobs: 1");
    expect(rendered).toContain("failed cleanup events: 2");
    expect(rendered).toContain("cleanup-failed jobs: 2");
    expect(rendered).toContain("operator remediation events: 4");
  });

  it("surfaces packet PDF render failures", () => {
    const report = buildOperatorDashboard({
      runGit: fakeGit(),
      fileExists: () => true,
      packetPdfMetrics: fakePacketPdfMetrics(),
    });
    const rendered = renderDashboard(report);

    expect(rendered).toContain("[OPEN] Packet PDF render health");
    expect(rendered).toContain("render attempts: 4");
    expect(rendered).toContain("render successes: 3");
    expect(rendered).toContain("render failures: 1");
    expect(rendered).toContain("cache hits: 2");
    expect(rendered).toContain("latest failure: 2026-05-20T00:02:00.000Z");
  });

  it("surfaces production observability thresholds without sensitive payloads", () => {
    const report = buildOperatorDashboard({
      runGit: fakeGit(),
      fileExists: () => true,
      productionObservabilityMetrics: fakeProductionObservabilityMetrics(),
    });
    const rendered = renderDashboard(report);

    expect(rendered).toContain("Production Observability");
    expect(rendered).toContain("[FAIL] Ingest health threshold");
    expect(rendered).toContain("Ingest dead letters: 1 (threshold status: Critical; warning 1; critical 1)");
    expect(rendered).toContain("[OPEN] OCR/parser health threshold");
    expect(rendered).toContain("raw extracted text stored in metrics: false");
    expect(rendered).toContain("[OPEN] Packet PDF health threshold");
    expect(rendered).toContain("cache hits: 7");
    expect(rendered).toContain("[OPEN] Storage health threshold");
    expect(rendered).toContain("object names stored as hashes only");
    expect(rendered).toContain("[OPEN] Auth/rate-limit threshold");
    expect(rendered).toContain("emails, IP addresses, cookies, and session IDs are not emitted");
    expect(rendered).toContain("[OPEN] DB config/pool threshold");
    expect(rendered).toContain("configured pool max: 3");

    expect(rendered).not.toMatch(/%PDF|JVBERi0|raw report text|full credit report|Bearer|session=|cookie=|@example\.test/i);
  });

  it("lists gated smoke checks as manual and credential-gated", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const smoke = report.categories.find((category) => category.name === "Manual / Gated Smoke");

    expect(GATED_SMOKE_CHECKS.map((check) => check.command)).toEqual(
      expect.arrayContaining([
        "pnpm run smoke:reconciliation-candidates-ui",
        "pnpm run smoke:runtime-bridge-mapping",
        "pnpm run smoke:runtime-bridge-mapping-ui",
        "pnpm run smoke:advisory-bridge-report",
        "pnpm run smoke:auth-workflow",
        "pnpm run smoke:outcome-tracking",
        "pnpm run smoke:outcome-admin-review",
        "pnpm run smoke:outcome-admin-review-ui",
        "pnpm run smoke:response-document",
        "pnpm run smoke:response-document-ui",
        "pnpm run smoke:response-document-admin-review",
        "pnpm run smoke:response-document-admin-review-ui",
      ]),
    );
    expect(smoke?.checks.every((check) => check.status === "MANUAL")).toBe(true);
    expect(smoke?.checks.every((check) => check.requiresCredentials === true)).toBe(true);
  });

  it("includes known scale gaps and non-runtime governance warnings", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const rendered = renderDashboard(report);

    expect(KNOWN_SCALE_GAPS).toEqual(
      expect.arrayContaining([
        "Persisted outcome tracking backend has passed authenticated staging smoke for a synthetic response-only path, authenticated outcome admin-review smoke has passed for a synthetic metadata-only review path, authenticated admin-only Outcome Reviews UI smoke has passed for a metadata-only UI review path, response-document capture backend coverage plus authenticated admin/user-owned staging smoke now exist for immutable response records with append-only deterministic processing and append-only response admin-review event logging, response replay/backfill dry-run/apply tooling now exists with append-only apply events and no raw response text storage, durable response-processing queue/backpressure/dead-letter tooling now exists with bounded operator worker dry-run support, explicit operator remediation events, dead-letter replacement retry, stale-running review without auto-reclaim, deterministic synthetic queue/load coverage, bounded scheduled worker orchestration with overlap skipping, internal operator alert surfacing, append-only lifecycle retention marking, deterministic operational drift detection, and bounded synthetic soak coverage, authenticated admin-only Response Documents UI smoke covers response list/detail processing visibility plus the non-mutating manual intake surface, response-document admin-review backend coverage plus authenticated admin-review smoke now exist for metadata-only review actions, authenticated response admin-review UI smoke has passed for one metadata-only review action, and the staging deploy workflow now runs scope-gated autonomous seeded response auth smokes after deploy and health checks: runtime/app/workflow/Docker/backend/UI/script changes run the full suite, docs/readiness/operator-dashboard-only changes skip it by design, and unknown changed-file scope runs it fail-closed; live mailbox integration, live scheduled daemon operation, physical purge/archival, historical production backfill strategy for records without stored response summaries, non-owner smoke, repeated production-scale smoke/load coverage, and external alert delivery remain future work.",
        "Backup/restore verification remains future work.",
        "External alert delivery remains future work; internal dashboard alert surfacing and deterministic drift visibility now exist.",
        "No admin override exists and it should remain absent.",
        "DB registry remains non-runtime governance metadata.",
      ]),
    );
    expect(rendered).toContain("Autonomous response auth smokes");
    expect(rendered).toContain("Response replay/backfill dry-run");
    expect(rendered).toContain("Response processing worker dry-run");
    expect(rendered).toContain("Response worker orchestration dry-run");
    expect(rendered).toContain("Response scheduler activation conditions");
    expect(rendered).toContain("Response external alert dry-run boundary");
    expect(rendered).toContain("Response worker orchestration synthetic check");
    expect(rendered).toContain("Response lifecycle retention dry-run");
    expect(rendered).toContain("Response purge/archive readiness");
    expect(rendered).toContain("Response historical backfill plan");
    expect(rendered).toContain("Response remediation operator controls");
    expect(rendered).toContain("Response processing soak check");
    expect(rendered).toContain("not live mailbox integration or production-load proof");
    expect(rendered).toContain("live daemon activation is not automatic");
    expect(rendered).toContain("SIMULATED DRY RUN alert payload proof exists with zero live external delivery");
    expect(rendered).toContain("Real email, Slack, webhook, SMS, push, or pager delivery remains intentionally absent");
    expect(rendered).toContain("does not physically purge or archive response-processing history");
    expect(rendered).toContain("records without sanitized stored summaries remain non-replayable");
    expect(rendered).toContain("durable response-processing queue/backpressure/dead-letter tooling now exists");
    expect(rendered).toContain("explicit operator remediation events");
    expect(rendered).toContain("bounded scheduled worker orchestration with overlap skipping");
    expect(rendered).toContain("internal operator alert surfacing");
    expect(rendered).toContain("append-only lifecycle retention marking");
    expect(rendered).toContain("deterministic operational drift detection");
    expect(rendered).toContain("Response queue remediation endpoint");
    expect(rendered).toContain("Response queue synthetic load");
    expect(rendered).toContain("scope-gated seeded/authenticated response auth smokes");
    expect(rendered).toContain("docs/readiness/operator-dashboard-only changes skip it by design");
    expect(rendered).toContain("unknown changed-file scope runs it fail-closed");
    expect(rendered).toContain("App image apt-utils cleanup");
    expect(rendered).toContain("filtered deploy logs no longer show the apt-utils package-install warning");
    expect(rendered).toContain("DB registry remains non-runtime governance metadata.");
    expect(rendered).toContain("No admin override exists and it should remain absent.");
    expect(rendered).toContain("static runtime mappings remain active truth");
  });

  it("can run without credentials", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });

    expect(report.categories.find((category) => category.name === "Manual / Gated Smoke")?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "MANUAL", requiresCredentials: true }),
      ]),
    );
    expect(report.summary.manual).toBeGreaterThan(0);
  });

  it("keeps dashboard SKIP, SIMULATED, and MACHINE_REQUIRED evidence states visible", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const rendered = renderDashboard(report);

    expect(report.summary.skip).toBeGreaterThan(0);
    expect(report.summary.simulated).toBeGreaterThan(0);
    expect(report.summary.machineRequired).toBeGreaterThan(0);
    expect(rendered).toContain("[SKIP] Golden Path");
    expect(rendered).toContain("[SIMULATED] Response external alert dry-run boundary");
    expect(rendered).toContain("[MACHINE_REQUIRED] Response scheduler activation conditions");
    expect(rendered).toContain("- SIMULATED: synthetic or dry-run proof exists, but it is not production proof");
    expect(rendered).toContain("- MACHINE_REQUIRED: non-interactive machine-attested proof is required outside this dashboard");
  });

  it("does not allow dashboard PASS semantics to hide skipped critical proof", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const semantics = buildDashboardReleaseEvidenceSemantics(report.categories);

    expect(report.releaseEvidenceSemantics).toMatchObject(semantics);
    expect(semantics.dashboardPassAloneIsReleaseEvidence).toBe(false);
    expect(semantics.passImpliesSkippedChecksPassed).toBe(false);
    expect(semantics.exactCommandsRequired).toBe(true);
    expect(semantics.skippedChecksVisible).toBe(true);
    expect(semantics.simulatedProofVisible).toBe(true);
    expect(semantics.machineRequiredProofVisible).toBe(true);
    expect(semantics.exactCommands).toContain("pnpm run alerts:dry-run");
    expect(semantics.exactCommands).toContain("pnpm run production-worker:readiness-evidence");
  });

  it("supports run-checks through bounded command result mapping", () => {
    const report = buildOperatorDashboard({ runGit: fakeGit(), fileExists: () => true });
    const executed: string[] = [];
    const checked = applyRunResults(report, (command) => {
      executed.push(command);
      return 0;
    });

    expect(executed).toEqual(SAFE_RUN_CHECK_COMMANDS);
    expect(
      checked.categories
        .flatMap((category) => category.checks)
        .filter((item) => SAFE_RUN_CHECK_COMMANDS.includes(item.command ?? ""))
        .every((item) => item.status === "PASS"),
    ).toBe(true);
  });

  it("parses json, run-checks, list-checks, and category flags", () => {
    expect(parseArgs(["--json", "--run-checks", "--list-checks", "--category", "Evidence"])).toEqual({
      json: true,
      runChecks: true,
      listChecks: true,
      category: "Evidence",
    });
  });
});
