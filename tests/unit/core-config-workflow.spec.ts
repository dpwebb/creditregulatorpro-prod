import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const scriptText = fs.readFileSync(path.join(repoRoot, "scripts/core-config.mjs"), "utf8");

describe("core config promotion workflow", () => {
  it("exposes the localhost-to-staging core config commands", () => {
    expect(packageJson.scripts).toMatchObject({
      "core-config:export": "node scripts/core-config.mjs export",
      "core-config:diff": "node scripts/core-config.mjs diff",
      "core-config:apply:staging": "node scripts/core-config.mjs apply-staging",
      "core-config:verify": "node scripts/core-config.mjs verify",
    });
  });

  it("covers admin roles, parser config, legal references, rules, templates, and seeded settings", () => {
    for (const expectedSurface of [
      "privileged_user_roles",
      "system_settings",
      "feature_flag",
      "compliance_config",
      "parser_bureau_detection_config",
      "parser_field_mapping",
      "parser_extraction_rule",
      "parser_known_entity",
      "dynamic_scanning_rule",
      "letter_template",
      "statute",
      "statute_version",
      "disclosure_requirement",
      "federal_guidance",
      "industry_standard",
      "enforcement_mechanism",
      "obligation",
      "bureau",
    ]) {
      expect(scriptText).toContain(`name: "${expectedSurface}"`);
    }
  });

  it("keeps the staging mutation path dry-run first and auditable", () => {
    expect(scriptText).toContain("Dry run only. Re-run apply-staging with --confirm to modify staging.");
    expect(scriptText).toContain("CORE_CONFIG_APPLY_STAGING");
    expect(scriptText).toContain("remote-snapshot");
    expect(scriptText).toContain("remote-apply");
  });

  it("does not define operational or secret-bearing tables as promoted core config", () => {
    for (const excludedTable of [
      "sessions",
      "oauth_accounts",
      "password_reset_tokens",
      "email_verification_tokens",
      "login_attempts",
      "rate_limit_entry",
      "user_passwords",
      "report_artifact",
      "payment",
      "support_ticket",
      "audit_log",
    ]) {
      expect(scriptText).not.toContain(`name: "${excludedTable}"`);
    }
  });
});
