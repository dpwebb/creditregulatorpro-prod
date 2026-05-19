import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowSource = () =>
  readFileSync(join(process.cwd(), ".github", "workflows", "deploy-production.yml"), "utf8");

describe("production deploy workflow verification", () => {
  it("runs full internal checks before production deploy while preserving rollback selection", () => {
    const source = workflowSource();

    expect(source).toContain("rollback_sha:");
    expect(source).toContain('if [ -n "${{ inputs.rollback_sha }}" ]; then');
    expect(source).toContain('echo "sha=${{ inputs.rollback_sha }}" >> "$GITHUB_OUTPUT"');
    expect(source).toContain("Build + internal regression checks");
    expect(source).toContain("run: pnpm run check");
    expect(source).toContain("pnpm run build");
    expect(source).toContain("needs: check");
  });

  it("verifies the selected production checkout SHA before building the container", () => {
    const source = workflowSource();

    expect(source).toContain('deployed_sha="$(git rev-parse HEAD)"');
    expect(source).toContain('target_sha="$(git rev-parse "$TARGET_SHA")"');
    expect(source).toContain('if [ "$deployed_sha" != "$target_sha" ]; then');
    expect(source).toContain("Production checkout SHA mismatch");
    expect(source).toContain("Production checkout verified");
  });

  it("performs production-safe public route and login health checks after deploy", () => {
    const source = workflowSource();

    expect(source).toContain("Verify production health");
    expect(source).toContain("PRODUCTION_APP_URL");
    expect(source).toContain("https://creditregulatorpro.com");
    expect(source).toContain('wait_for_status "root route" "HEAD" "/"');
    expect(source).toContain('wait_for_status "login route" "GET" "/login"');
    expect(source).toContain("'^[23][0-9][0-9]$'");
    expect(source).toContain("curl -sS -L");
    expect(source).toContain("creditregulatorpro-production-deploy-health/1.0");
  });

  it("checks production-safe unauthenticated auth-session denial", () => {
    const source = workflowSource();

    expect(source).toContain('wait_for_status "auth session denial" "GET" "/_api/auth/session"');
    expect(source).toContain("'^(401|403)$'");
    expect(source).not.toContain("/_api/auth/login_with_password");
  });

  it("does not run staging-only synthetic admin response smokes in production", () => {
    const source = workflowSource();

    expect(source).not.toContain("run_response_auth_smokes");
    expect(source).not.toContain("SMOKE_ADMIN_EMAIL");
    expect(source).not.toContain("SMOKE_ADMIN_PASSWORD");
    expect(source).not.toContain("smoke:outcome-fixture-setup");
    expect(source).not.toContain("smoke:response-document");
    expect(source).not.toContain("response-auth-smoke");
  });
});
