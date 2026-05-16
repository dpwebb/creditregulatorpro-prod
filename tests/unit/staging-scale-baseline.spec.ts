import { describe, expect, it } from "vitest";

import {
  assertSafeScenarioSet,
  FORBIDDEN_SCALE_BASELINE_ENDPOINTS,
  parseArgs,
  REFUSED_PRODUCTION_HOSTS,
  SCALE_BASELINE_GATE_ENV,
  SCALE_BASELINE_SCENARIOS,
  shouldRunScaleBaseline,
  summarizeSamples,
  validateScaleBaselineTarget,
} from "../../scripts/staging-scale-baseline.mjs";

describe("staging scale baseline harness", () => {
  it("requires an explicit gate env var", () => {
    expect(shouldRunScaleBaseline({})).toEqual({
      ok: false,
      reason: `SKIPPED: ${SCALE_BASELINE_GATE_ENV}=true is required.`,
    });
    expect(shouldRunScaleBaseline({ [SCALE_BASELINE_GATE_ENV]: "true" })).toEqual({ ok: true });
  });

  it("refuses production hosts and unapproved hosts", () => {
    for (const host of REFUSED_PRODUCTION_HOSTS) {
      expect(validateScaleBaselineTarget(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing to run staging scale baseline against production host ${host}.`,
      });
    }

    expect(validateScaleBaselineTarget("https://example.com").ok).toBe(false);
  });

  it("allows staging by default and local hosts only when explicitly allowed", () => {
    expect(validateScaleBaselineTarget("https://staging.creditregulatorpro.com")).toEqual({
      ok: true,
      host: "staging.creditregulatorpro.com",
    });
    expect(validateScaleBaselineTarget("http://localhost:5175").ok).toBe(false);
    expect(validateScaleBaselineTarget("http://localhost:5175", { allowLocal: true })).toEqual({
      ok: true,
      host: "localhost",
    });
  });

  it("keeps the baseline bounded and defaults to staging", () => {
    expect(
      parseArgs([
        "--json",
        "--iterations",
        "999",
        "--concurrency",
        "999",
        "--delay-ms",
        "999999",
        "--timeout-ms",
        "999999",
      ], {}),
    ).toEqual({
      allowLocal: false,
      json: true,
      baseUrl: "https://staging.creditregulatorpro.com",
      timeoutMs: 60000,
      iterations: 10,
      concurrency: 5,
      delayMs: 5000,
    });
  });

  it("covers public, auth-denied, upload-contract, and admin-denied scenarios", () => {
    expect(SCALE_BASELINE_SCENARIOS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "public app shell", method: "HEAD", path: "/", acceptedStatuses: [200] }),
        expect.objectContaining({ name: "public login route", method: "GET", path: "/login", acceptedStatuses: [200] }),
        expect.objectContaining({
          name: "auth session denial",
          method: "GET",
          path: "/_api/auth/session",
          acceptedStatuses: [401, 403],
        }),
        expect.objectContaining({
          name: "upload contract invalid payload",
          method: "POST",
          path: "/_api/ingest/report",
          acceptedStatuses: [400, 401, 403],
          body: {},
        }),
        expect.objectContaining({
          name: "admin mock lifecycle denial",
          method: "GET",
          path: "/_api/admin/mock-lifecycle/list?limit=1",
          acceptedStatuses: [401, 403],
        }),
        expect.objectContaining({
          name: "runtime bridge mapping denial",
          method: "GET",
          path: "/_api/regulation-registry/runtime-bridge/list",
          acceptedStatuses: [401, 403],
        }),
        expect.objectContaining({
          name: "advisory bridge report denial",
          method: "GET",
          path: "/_api/regulation-registry/advisory-bridge/report",
          acceptedStatuses: [401, 403],
        }),
      ]),
    );
  });

  it("does not include runtime activation, packet, violation, parser, or OCR endpoints", () => {
    assertSafeScenarioSet(SCALE_BASELINE_SCENARIOS);
    for (const forbiddenPath of FORBIDDEN_SCALE_BASELINE_ENDPOINTS) {
      expect(SCALE_BASELINE_SCENARIOS.some((scenario) => scenario.path === forbiddenPath)).toBe(false);
    }
  });

  it("summarizes baseline samples without hiding failures", () => {
    expect(
      summarizeSamples([
        { ok: true, status: 200, durationMs: 10 },
        { ok: true, status: 200, durationMs: 20 },
        { ok: false, status: 500, durationMs: 30 },
      ]),
    ).toEqual({
      requests: 3,
      failures: 1,
      statusCounts: { "200": 2, "500": 1 },
      minMs: 10,
      p50Ms: 20,
      p95Ms: 30,
      maxMs: 30,
      avgMs: 20,
    });
  });
});
