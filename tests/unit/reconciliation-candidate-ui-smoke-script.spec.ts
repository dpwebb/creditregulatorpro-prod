import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  buildSmokeConfig,
  FORBIDDEN_ACTIVATION_TERMS,
  redactSecretText,
  REFUSED_PRODUCTION_HOSTS,
  runCli,
  SKIPPED_EXIT_CODE,
  SMOKE_GATE_ENV,
  SYNTHETIC_RECONCILIATION_CANDIDATE,
  validateSmokeHost,
} from "../../scripts/staging-reconciliation-candidates-ui-smoke";

describe("reconciliation candidate UI smoke harness gating", () => {
  it("refuses to run without the explicit smoke gate", () => {
    const config = buildSmokeConfig({
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
    });

    expect(config).toEqual({
      status: "skipped",
      reason: `SKIPPED: ${SMOKE_GATE_ENV}=true is required.`,
    });
  });

  it("refuses production hosts", () => {
    for (const host of REFUSED_PRODUCTION_HOSTS) {
      expect(validateSmokeHost(`https://${host}`)).toEqual({
        ok: false,
        reason: `Refusing to run against production host ${host}.`,
      });
    }

    const config = buildSmokeConfig({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://creditregulatorpro.com",
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
    });

    expect(config.status).toBe("error");
    expect(config.reason).toContain("Refusing to run against production host");
  });

  it("allows the staging host when required authenticated admin env is present", () => {
    const config = buildSmokeConfig({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
      CRP_RECONCILIATION_CANDIDATE_UI_SMOKE_RUN_ID: "unit-run",
    });

    expect(config).toEqual(
      expect.objectContaining({
        status: "ready",
        baseUrl: "https://staging.creditregulatorpro.com",
        host: "staging.creditregulatorpro.com",
        authMode: "credentials",
        runId: "unit-run",
      }),
    );
  });

  it("exits skipped when no safe authenticated context exists", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const code = await runCli({
      [SMOKE_GATE_ENV]: "true",
    });

    expect(code).toBe(SKIPPED_EXIT_CODE);
    expect(logSpy).toHaveBeenCalledWith("SKIPPED: no safe authenticated admin context configured.");
  });

  it("does not print configured secrets or session cookies", () => {
    const redacted = redactSecretText(
      "password=SecretAdminPass123 cookie=floot_built_app_session=abc123xyz",
      {
        STAGING_ADMIN_PASSWORD: "SecretAdminPass123",
        STAGING_ADMIN_SESSION_COOKIE: "floot_built_app_session=abc123xyz",
      },
    );

    expect(redacted).not.toContain("SecretAdminPass123");
    expect(redacted).not.toContain("abc123xyz");
    expect(redacted).toContain("[REDACTED]");
  });

  it("does not mark success when authentication is missing", () => {
    const config = buildSmokeConfig({
      [SMOKE_GATE_ENV]: "true",
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    });

    expect(config.status).toBe("skipped");
    expect(config.status).not.toBe("ready");
  });

  it("contains forbidden runtime activation-control checks", () => {
    expect(FORBIDDEN_ACTIVATION_TERMS).toEqual(
      expect.arrayContaining(["Activate", "Make Runtime Truth", "Apply to Runtime", "Enforce", "Legal Violation"]),
    );

    const source = readFileSync(
      join(process.cwd(), "scripts", "staging-reconciliation-candidates-ui-smoke.ts"),
      "utf8",
    );
    expect(source).toContain("getByRole(\"button\"");
    expect(source).toContain("FORBIDDEN_ACTIVATION_TERMS");
    expect(source).toContain("FORBIDDEN_MUTATION_ENDPOINTS");
  });

  it("scopes candidate card and detail assertions to avoid ambiguous UI text", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts", "staging-reconciliation-candidates-ui-smoke.ts"),
      "utf8",
    );

    expect(source).toContain("const candidateCard = page.getByRole(\"article\").filter");
    expect(source).toContain("const detailPanel = page.getByLabel(\"Reconciliation candidate detail\")");
    expect(source).toContain("await candidateCard.getByRole(\"button\", { name: /View Details/i }).click()");
    expect(source).toContain("detailPanel.getByText(\"source url missing candidate\", { exact: true })");
    expect(source).not.toContain("page.getByText(\"source url missing candidate\")");
  });

  it("uses synthetic-only reconciliation candidate values", () => {
    expect(SYNTHETIC_RECONCILIATION_CANDIDATE).toEqual(
      expect.objectContaining({
        candidateType: "source_url_missing_candidate",
        staticReferenceId: "UI_SMOKE_STATIC_REF",
        dbRegulationId: "UI_SMOKE_DB_REF",
        deterministicRuleId: "UI_SMOKE_RULE",
        mismatchType: "source_url_missing",
        severity: "low",
        message: "Synthetic UI smoke candidate only",
      }),
    );
    expect(JSON.stringify(SYNTHETIC_RECONCILIATION_CANDIDATE)).not.toMatch(
      /accountNumber|rawExtractedText|creditReport|customer|fullSin|socialInsurance|packetContent/i,
    );
  });
});
