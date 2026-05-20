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
    expect(source).toContain('wait_for_status "report artifact list denial" "GET" "/_api/report-artifact/list?limit=1"');
    expect(source).toContain('wait_for_status "packet list denial" "GET" "/_api/packet/list?limit=1"');
    expect(source).toContain('wait_for_status "evidence event list denial" "GET" "/_api/evidence/list?limit=1"');
    expect(source).toContain('wait_for_status "response document list denial" "GET" "/_api/responses/list?limit=1"');
    expect(source).toContain('wait_for_status "support ticket list denial" "GET" "/_api/support-ticket/list?limit=1"');
    expect(source).toContain("'^(401|403)$'");
    expect(source).not.toContain("/_api/auth/login_with_password");
  });

  it("checks production-safe invalid-session denial without creating production data", () => {
    const source = workflowSource();

    expect(source).toContain('invalid_session_cookie="floot_built_app_session=invalid-production-readiness-probe"');
    expect(source).toContain('wait_for_status "invalid session auth denial" "GET" "/_api/auth/session"');
    expect(source).toContain('wait_for_status "invalid session report artifact list denial" "GET" "/_api/report-artifact/list?limit=1"');
    expect(source).toContain('wait_for_status "invalid session packet list denial" "GET" "/_api/packet/list?limit=1"');
    expect(source).toContain('wait_for_status "invalid session evidence event list denial" "GET" "/_api/evidence/list?limit=1"');
    expect(source).toContain('wait_for_status "invalid session response document list denial" "GET" "/_api/responses/list?limit=1"');
    expect(source).toContain('wait_for_status "invalid session support ticket list denial" "GET" "/_api/support-ticket/list?limit=1"');
    expect(source).toContain('"Cookie: ${invalid_session_cookie}"');
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

  it("keeps production ingest worker execution default-off and manual only", () => {
    const source = workflowSource();

    expect(source).toContain("run_ingest_worker_dry_run:");
    expect(source).toContain("run_ingest_worker_apply:");
    expect(source).toContain("default: false");
    expect(source).toContain("Skipping production ingest worker. Manual workflow_dispatch input is required.");
    expect(source).toContain('RUN_PRODUCTION_INGEST_WORKER_DRY_RUN: ${{ github.event_name == \'workflow_dispatch\' && inputs.run_ingest_worker_dry_run || false }}');
    expect(source).toContain('RUN_PRODUCTION_INGEST_WORKER_APPLY: ${{ github.event_name == \'workflow_dispatch\' && inputs.run_ingest_worker_apply || false }}');
    expect(source).not.toContain("docker compose up -d --build ingest");
    expect(source).not.toContain("restart: unless-stopped ingest");
  });

  it("supports only read-only dry-run or guarded bounded one-shot production worker apply", () => {
    const source = workflowSource();

    expect(source).toContain("run_production_ingest_worker_plan() {");
    expect(source).toContain("choose dry-run or apply, not both");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_max_jobs must be 1-5.");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_operator must be a safe token.");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_apply_ack is invalid.");
    expect(source).toContain("ingest_worker_max_jobs must be 1-5");
    expect(source).toContain("Running read-only bounded production ingest worker dry-run.");
    expect(source).toContain(
      "pnpm run ingest:worker -- --dry-run --max-jobs \"$PRODUCTION_INGEST_WORKER_MAX_JOBS\" --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process",
    );
    expect(source).toContain("explicit-bounded-production-ingest-worker-apply");
    expect(source).toContain("CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true");
    expect(source).toContain("CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS=\"$PRODUCTION_INGEST_WORKER_MAX_JOBS\"");
    expect(source).toContain("CRP_PRODUCTION_INGEST_WORKER_OPERATOR=\"$PRODUCTION_INGEST_WORKER_OPERATOR\"");
    expect(source).toContain(
      "pnpm run ingest:worker -- --apply --max-jobs \"$CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS\" --concurrency 1 --worker-id production-bounded-ingest-worker --source authenticated_ingest_process",
    );
    expect(source).not.toContain("--max-jobs 100");
    expect(source).not.toContain("--concurrency 2");
  });

  it("does not run staging-only ingest worker commands in production deploys", () => {
    const source = workflowSource();

    expect(source).not.toContain("CRP_ENV=staging");
    expect(source).not.toContain("creditregulatorpro-staging");
    expect(source).not.toContain("staging-deploy-ingest-worker");
  });
});
