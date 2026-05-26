import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyAdminAuthFailure, runAdminAuthAudit } from "../../scripts/admin-auth-audit";

describe("admin auth audit script", () => {
  it("is wired as a package script", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["audit:admin-auth"]).toBe("tsx scripts/admin-auth-audit.ts");
  });

  it("reports incomplete without admin credentials", async () => {
    const report = await runAdminAuthAudit({
      STAGING_BASE_URL: "https://staging.creditregulatorpro.com",
    }, []);

    expect(report).toMatchObject({
      status: "INCOMPLETE",
      code: "ADMIN_AUTH_INPUTS_MISSING",
      authMode: "missing",
      adminAccountExists: "unknown",
      adminRoleVerified: false,
    });
    expect(JSON.stringify(report)).not.toContain("password=");
  });

  it("classifies rejected credentials and session cookies without exposing secrets", () => {
    expect(classifyAdminAuthFailure("credentials", 401, "Invalid email or password")).toBe(
      "ADMIN_PASSWORD_LOGIN_REJECTED",
    );
    expect(classifyAdminAuthFailure("session_cookie", 403, "Unauthorized")).toBe(
      "ADMIN_SESSION_COOKIE_REJECTED",
    );
  });

  it("refuses production hosts", async () => {
    await expect(runAdminAuthAudit({
      STAGING_BASE_URL: "https://creditregulatorpro.com",
      STAGING_ADMIN_EMAIL: "admin@example.test",
      STAGING_ADMIN_PASSWORD: "super-secret-password",
    }, [])).rejects.toThrow(/Refusing to run admin auth diagnostics against production host/);
  });
});
