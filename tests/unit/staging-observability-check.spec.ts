import { describe, expect, it } from "vitest";

import {
  analyzeLogText,
  buildThresholds,
  OBSERVABILITY_CHECK_ENV,
  OBSERVABILITY_HTTP_CHECKS,
  parseArgs,
  parseDockerStatus,
  redactPotentialSecrets,
  REFUSED_PRODUCTION_HOSTS,
  shouldRunObservabilityCheck,
  validateObservabilityTarget,
  validateSshHost,
} from "../../scripts/staging-observability-check.mjs";

describe("staging observability check", () => {
  it("requires an explicit gate env var", () => {
    expect(shouldRunObservabilityCheck({})).toEqual({
      ok: false,
      reason: `SKIPPED: ${OBSERVABILITY_CHECK_ENV}=true is required.`,
    });
    expect(shouldRunObservabilityCheck({ [OBSERVABILITY_CHECK_ENV]: "true" })).toEqual({ ok: true });
  });

  it("refuses production and unapproved targets", () => {
    for (const host of REFUSED_PRODUCTION_HOSTS) {
      expect(validateObservabilityTarget(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing to run staging observability check against production host ${host}.`,
      });
      expect(validateSshHost(host)).toEqual({
        ok: false,
        reason: `Refusing to run staging observability check against production host ${host}.`,
      });
    }

    expect(validateObservabilityTarget("https://example.com").ok).toBe(false);
    expect(validateSshHost("example.com").ok).toBe(false);
  });

  it("allows staging by default and local only when explicit", () => {
    expect(validateObservabilityTarget("https://staging.creditregulatorpro.com")).toEqual({
      ok: true,
      host: "staging.creditregulatorpro.com",
    });
    expect(validateSshHost("staging.creditregulatorpro.com")).toEqual({
      ok: true,
      host: "staging.creditregulatorpro.com",
    });
    expect(validateObservabilityTarget("http://localhost:3333").ok).toBe(false);
    expect(validateObservabilityTarget("http://localhost:3333", { allowLocal: true })).toEqual({
      ok: true,
      host: "localhost",
    });
  });

  it("keeps HTTP checks read-only and focused on health/auth denial", () => {
    expect(OBSERVABILITY_HTTP_CHECKS).toEqual([
      { name: "app shell", method: "HEAD", path: "/", acceptedStatuses: [200] },
      { name: "login route", method: "GET", path: "/login", acceptedStatuses: [200] },
      { name: "auth session denied", method: "GET", path: "/_api/auth/session", acceptedStatuses: [401, 403] },
    ]);
  });

  it("parses args without defaulting to production and clamps log tail", () => {
    expect(
      parseArgs([
        "--json",
        "--source",
        "log-file",
        "--log-file",
        "observability.log",
        "--tail",
        "999999",
        "--timeout-ms",
        "999999",
      ], {}),
    ).toEqual({
      allowLocal: false,
      json: true,
      source: "log-file",
      baseUrl: "https://staging.creditregulatorpro.com",
      sshHost: "staging.creditregulatorpro.com",
      sshUser: "root",
      sshKey: null,
      logFile: "observability.log",
      containerName: "creditregulatorpro-staging",
      logTail: 5000,
      timeoutMs: 60000,
    });
  });

  it("summarizes alert categories and treats runtime activation rejection as controlled", () => {
    const report = analyzeLogText(
      [
        "HTTP 500 GET /_api/example",
        "parser failed while reading fixture",
        "packet generation error",
        "UnhandledPromiseRejection: unexpected",
        "Error: Runtime bridge activation is unavailable in this governance layer",
      ].join("\n"),
      buildThresholds({}),
    );

    expect(report.ok).toBe(false);
    expect(report.categories.http5xx.count).toBe(1);
    expect(report.categories.parserOcrFailures.count).toBe(1);
    expect(report.categories.packetFailures.count).toBe(1);
    expect(report.categories.backgroundJobErrors.count).toBe(1);
    expect(report.controlledNonAlertCount).toBe(1);
    expect(report.rawLogsIncluded).toBe(false);
  });

  it("supports thresholds for known nonzero alert windows", () => {
    const report = analyzeLogText("HTTP 500\nHTTP 502", { http5xx: 2 });
    expect(report.ok).toBe(true);
    expect(report.categories.http5xx.count).toBe(2);
    expect(report.categories.http5xx.maxAllowed).toBe(2);
  });

  it("parses docker status and detects non-running containers", () => {
    expect(parseDockerStatus("creditregulatorpro-staging Up 2 hours", "creditregulatorpro-staging")).toEqual({
      name: "creditregulatorpro-staging",
      status: "Up 2 hours",
      up: true,
    });
    expect(parseDockerStatus("creditregulatorpro-staging Exited (1) 1 minute ago", "creditregulatorpro-staging").up).toBe(false);
  });

  it("redacts secrets and connection strings from error output", () => {
    const redacted = redactPotentialSecrets(
      "Bearer abc.def token=secret session=abc password=pw postgres://user:pass@host/db",
    );
    expect(redacted).not.toContain("abc.def");
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("pw");
    expect(redacted).not.toContain("user:pass@host");
    expect(redacted).toContain("Bearer [REDACTED]");
  });
});
