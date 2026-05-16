import { describe, expect, it } from "vitest";

import {
  PROTECTED_UNAUTHENTICATED_ENDPOINT_CHECKS,
  PUBLIC_STAGING_CHECKS,
  REQUIRED_LOCAL_CHECKS,
  validateReadinessTarget,
  parseArgs,
  REFUSED_PRODUCTION_HOSTS,
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
      ]),
    );
  });

  it("parses gate flags without defaulting to production", () => {
    const options = parseArgs([
      "--skip-local-checks",
      "--skip-github-deploy-check",
      "--json",
      "--staging-url",
      "https://staging.creditregulatorpro.com",
      "--timeout-ms",
      "5000",
    ]);

    expect(options).toEqual({
      skipLocalChecks: true,
      skipGithubDeployCheck: true,
      allowLocal: false,
      json: true,
      stagingUrl: "https://staging.creditregulatorpro.com",
      timeoutMs: 5000,
    });
  });
});
