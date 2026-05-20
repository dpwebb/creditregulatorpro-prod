import { describe, expect, it } from "vitest";

import {
  CRON_TOKEN_DENIAL_CONTRACTS,
  INVALID_SESSION_COOKIE,
  PROTECTED_INVALID_SESSION_ENDPOINT_CHECKS,
  PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS,
  PUBLIC_STAGING_CHECKS,
  REQUIRED_LOCAL_CHECKS,
  RETIRED_PUBLIC_ROUTE_CONTRACTS,
  WEBHOOK_REJECTION_CONTRACTS,
  assertProductionProbePlanReadOnly,
  evaluateStaticRejectionContracts,
  validateReadinessTarget,
  parseArgs,
  productionRuntimeHttpProbePlan,
  scanProbeBodyForSensitiveContent,
  REFUSED_PRODUCTION_HOSTS,
  renderProductionSafeProbeEvidenceMarkdown,
} from "../../scripts/production-readiness-gate.mjs";

describe("production readiness gate", () => {
  it("refuses production hosts", () => {
    for (const host of REFUSED_PRODUCTION_HOSTS) {
      expect(validateReadinessTarget(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing to run production readiness gate against production host ${host}.`,
      });
    }
  });

  it("allows staging host by default and local hosts only when explicitly allowed", () => {
    expect(validateReadinessTarget("https://staging.creditregulatorpro.com")).toEqual({
      ok: true,
      host: "staging.creditregulatorpro.com",
    });
    expect(validateReadinessTarget("http://localhost:5175").ok).toBe(false);
    expect(validateReadinessTarget("http://localhost:5175", { allowLocal: true })).toEqual({
      ok: true,
      host: "localhost",
    });
  });

  it("includes source-of-truth and core regression checks", () => {
    expect(REQUIRED_LOCAL_CHECKS.map((check) => check.label)).toEqual([
      "source of truth",
      "typecheck",
      "golden path",
      "contracts",
      "api",
      "deterministic ingestion",
      "credit regression",
      "tradeline internal",
      "violation corrections",
      "staging gate",
    ]);

    expect(REQUIRED_LOCAL_CHECKS).toEqual(
      expect.arrayContaining([
        { label: "golden path", command: "pnpm", args: ["run", "test:golden-path"] },
        { label: "api", command: "pnpm", args: ["run", "test:api"] },
        { label: "staging gate", command: "pnpm", args: ["run", "check:staging-gate"] },
      ]),
    );
  });

  it("checks public staging reachability and protected unauthenticated endpoint boundaries", () => {
    expect(PUBLIC_STAGING_CHECKS).toEqual(
      expect.arrayContaining([
        { name: "app shell", path: "/", method: "HEAD", acceptedStatuses: [200] },
        { name: "login route", path: "/login", method: "GET", acceptedStatuses: [200] },
      ]),
    );

    expect(PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS).toEqual(
      expect.arrayContaining([
        {
          name: "admin mock lifecycle endpoint",
          path: "/_api/admin/mock-lifecycle/list?limit=1",
          acceptedStatuses: [401, 403],
        },
        {
          name: "runtime bridge mapping list endpoint",
          path: "/_api/regulation-registry/runtime-bridge/list",
          acceptedStatuses: [401, 403],
        },
        {
          name: "advisory bridge report endpoint",
          path: "/_api/regulation-registry/advisory-bridge/report",
          acceptedStatuses: [401, 403],
        },
        {
          name: "report artifact list endpoint",
          path: "/_api/report-artifact/list?limit=1",
          acceptedStatuses: [401, 403],
        },
        {
          name: "packet list endpoint",
          path: "/_api/packet/list?limit=1",
          acceptedStatuses: [401, 403],
        },
        {
          name: "evidence event list endpoint",
          path: "/_api/evidence/list?limit=1",
          acceptedStatuses: [401, 403],
        },
        {
          name: "response document list endpoint",
          path: "/_api/responses/list?limit=1",
          acceptedStatuses: [401, 403],
        },
        {
          name: "support ticket list endpoint",
          path: "/_api/support-ticket/list?limit=1",
          acceptedStatuses: [401, 403],
        },
      ]),
    );

    expect(PROTECTED_INVALID_SESSION_ENDPOINT_CHECKS).toEqual(
      expect.arrayContaining([
        {
          name: "report artifact list endpoint invalid session",
          path: "/_api/report-artifact/list?limit=1",
          acceptedStatuses: [401, 403],
          headers: { Cookie: INVALID_SESSION_COOKIE },
        },
        {
          name: "packet list endpoint invalid session",
          path: "/_api/packet/list?limit=1",
          acceptedStatuses: [401, 403],
          headers: { Cookie: INVALID_SESSION_COOKIE },
        },
        {
          name: "response document list endpoint invalid session",
          path: "/_api/responses/list?limit=1",
          acceptedStatuses: [401, 403],
          headers: { Cookie: INVALID_SESSION_COOKIE },
        },
      ]),
    );
  });

  it("keeps production runtime probes read-only and non-mutating", () => {
    const plan = productionRuntimeHttpProbePlan();

    expect(plan.length).toBeGreaterThan(0);
    expect(assertProductionProbePlanReadOnly(plan)).toEqual({ ok: true, unsafe: [] });
    for (const check of plan) {
      expect(["GET", "HEAD"]).toContain(check.method);
      expect(check.readOnly).toBe(true);
      expect(check.mutationExpected).toBe(false);
    }
  });

  it("covers cron token, webhook, and retired public routes without executing POSTs against production", () => {
    expect(CRON_TOKEN_DENIAL_CONTRACTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "missing cron token denial - clock scan", method: "POST", productionExecution: "static-contract-only" }),
        expect.objectContaining({ name: "invalid cron token denial - retention auto purge", method: "POST", productionExecution: "static-contract-only" }),
      ]),
    );
    expect(WEBHOOK_REJECTION_CONTRACTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "unsigned Stripe webhook rejection", method: "POST", productionExecution: "static-contract-only" }),
        expect.objectContaining({ name: "invalid tracking webhook bearer rejection", method: "POST", productionExecution: "static-contract-only" }),
      ]),
    );
    expect(RETIRED_PUBLIC_ROUTE_CONTRACTS.length).toBeGreaterThan(0);
    expect(RETIRED_PUBLIC_ROUTE_CONTRACTS.every((contract) => contract.productionExecution === "static-contract-only")).toBe(true);

    const evaluated = evaluateStaticRejectionContracts();
    expect(evaluated.every((contract) => contract.productionHttpRequestExecuted === false)).toBe(true);
    expect(evaluated.every((contract) => contract.productionMutationExpected === false)).toBe(true);
    expect(evaluated.every((contract) => contract.status === "passed")).toBe(true);
  });

  it("detects PII, raw report, and credential markers in unauthenticated probe bodies", () => {
    expect(scanProbeBodyForSensitiveContent("plain unauthorized response")).toEqual([]);
    expect(scanProbeBodyForSensitiveContent("error 123-45-6789")).toContain("ssn");
    expect(scanProbeBodyForSensitiveContent("pdf=JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmo")).toContain("raw-pdf-base64");
    expect(scanProbeBodyForSensitiveContent("postgres://user:password@example.invalid/db")).toContain("credential-url");
  });

  it("renders evidence with explicit read-only and static-contract semantics", () => {
    const report = {
      status: "passed",
      startedAt: "2026-05-20T00:00:00.000Z",
      completedAt: "2026-05-20T00:00:01.000Z",
      branch: "staging",
      commit: "abc123",
      targetHost: "staging.creditregulatorpro.com",
      planOnly: true,
      runtimeProbePlan: [
        {
          name: "auth session endpoint",
          path: "/_api/auth/session",
          method: "GET",
          acceptedStatuses: [401, 403],
          readOnly: true,
          mutationExpected: false,
        },
      ],
      publicChecks: [],
      protectedUnauthenticatedChecks: [],
      protectedInvalidSessionChecks: [],
      staticRejectionContracts: [
        {
          name: "missing cron token denial - clock scan",
          route: "/_api/clock/scan",
          method: "POST",
          expectedStatus: 401,
          expectedStatuses: null,
          productionExecution: "static-contract-only",
          status: "passed",
        },
      ],
      safety: {
        runtimeProbesReadOnly: true,
        runtimeProbeMethods: [],
        runtimeProbePlanReadOnly: true,
        runtimeProbePlanMethods: ["GET"],
        cronTokenDenialCovered: true,
        webhookRejectionCovered: false,
        retiredPublicRoutesCovered: false,
        unauthenticatedSensitiveFindings: [],
        productionDataMutated: false,
        productionFixturesCreated: false,
        productionWorkerActivated: false,
        liveExternalProvidersConnected: false,
      },
    };

    const markdown = renderProductionSafeProbeEvidenceMarkdown(report);
    expect(markdown).toContain("Production runtime probes are read-only");
    expect(markdown).toContain("auth session endpoint: GET /_api/auth/session");
    expect(markdown).toContain("static contract evidence");
    expect(markdown).toContain("Production data mutated: no");
    expect(markdown).toContain("Production fixtures created: no");
  });

  it("parses gate flags without defaulting to production", () => {
    const options = parseArgs([
      "--skip-local-checks",
      "--skip-github-deploy-check",
      "--json",
      "--plan-only",
      "--write-evidence",
      "--staging-url",
      "https://staging.creditregulatorpro.com",
      "--timeout-ms",
      "5000",
      "--evidence-dir",
      "docs/production-scale/evidence",
    ]);

    expect(options).toEqual({
      skipLocalChecks: true,
      skipGithubDeployCheck: true,
      allowLocal: false,
      json: true,
      planOnly: true,
      writeEvidence: true,
      stagingUrl: "https://staging.creditregulatorpro.com",
      timeoutMs: 5000,
      evidenceDir: "docs/production-scale/evidence",
    });
  });
});
