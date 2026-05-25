import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildResilienceAuditEnv,
  classifyResilienceExploitability,
  evaluateResilienceVectors,
} from "../../scripts/resilience-audit";

describe("resilience audit script", () => {
  it("defaults to staging and enables the resilience audit gate", () => {
    const env = buildResilienceAuditEnv({});

    expect(env.STAGING_BASE_URL).toBe("https://staging.creditregulatorpro.com");
    expect(env.CRP_RESILIENCE_AUDIT).toBe("true");
    expect(env.CRP_RESILIENCE_AUDIT_RUN_ID).toMatch(/^resilience-audit-/);
  });

  it("respects an explicit local smoke base URL", () => {
    const env = buildResilienceAuditEnv({
      LOCAL_SMOKE_BASE_URL: "http://localhost:3333",
      CRP_RESILIENCE_AUDIT_RUN_ID: "unit-run",
    });

    expect(env.STAGING_BASE_URL).toBeUndefined();
    expect(env.LOCAL_SMOKE_BASE_URL).toBe("http://localhost:3333");
    expect(env.CRP_RESILIENCE_AUDIT).toBe("true");
    expect(env.CRP_RESILIENCE_AUDIT_RUN_ID).toBe("unit-run");
  });

  it("classifies auth and readiness failures as high exploitability", () => {
    expect(
      classifyResilienceExploitability({
        category: "auth",
        status: "FAIL",
        details: "Non-owner packet PDF access returned 200.",
      }),
    ).toBe("high");

    expect(
      classifyResilienceExploitability({
        category: "readiness",
        status: "FAIL",
        details: "Missing finding bypassed packet readiness.",
      }),
    ).toBe("high");
  });

  it("keeps skipped infrastructure fault injection as a low-risk gap", () => {
    expect(
      classifyResilienceExploitability({
        category: "fault_injection_gap",
        status: "SKIP",
        details: "DB disconnect not executed.",
      }),
    ).toBe("none");
  });

  it("summarizes vector exploitability using the highest observed risk", () => {
    const summary = evaluateResilienceVectors([
      {
        id: "invalid_mime",
        category: "input_validation",
        status: "PASS",
        exploitability: "none",
        title: "Invalid MIME",
        expected: "Reject",
        observed: "HTTP 400",
        details: "Rejected.",
      },
      {
        id: "readiness_bypass",
        category: "readiness",
        status: "FAIL",
        exploitability: "high",
        title: "Readiness bypass",
        expected: "Reject",
        observed: "HTTP 200",
        details: "Bypass.",
      },
    ]);

    expect(summary).toEqual({
      overall: "high",
      summary: "HIGH exploitability risk observed or left as a required fault-injection gap.",
    });
  });

  it("wires pnpm audit:resilience and avoids destructive infrastructure mutation", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = readFileSync(join(process.cwd(), "scripts", "resilience-audit.ts"), "utf8");

    expect(pkg.scripts["audit:resilience"]).toBe("tsx scripts/resilience-audit.ts");
    expect(source).toContain("storage_outage_fault_injection");
    expect(source).toContain("db_disconnect_fault_injection");
    expect(source).toContain("Not executed by this command.");
    expect(source).not.toMatch(/docker\s+(stop|kill|rm)|DROP\s+DATABASE|TRUNCATE\s+TABLE|delete\s+from\s+public\.users/i);
  });
});
