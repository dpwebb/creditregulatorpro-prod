import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowSource = () =>
  readFileSync(join(process.cwd(), ".github", "workflows", "deploy-production.yml"), "utf8");

describe("production deploy workflow verification", () => {
  it("runs full internal checks before production deploy while preserving rollback selection", () => {
    const source = workflowSource();

    expect(source).toContain("resolve-target:");
    expect(source).toContain("Resolve and validate TARGET_SHA");
    expect(source).toContain("rollback_sha:");
    expect(source).toContain("Check out repository for target resolution");
    expect(source).toContain("Check out target repository");
    expect(source).toContain("Verify validation checkout target SHA");
    expect(source).toContain("fetch-depth: 0");
    expect(source).toContain("ROLLBACK_SHA_INPUT: ${{ github.event_name == 'workflow_dispatch' && inputs.rollback_sha || '' }}");
    expect(source).toContain('if ! printf \'%s\' "$rollback_sha" | grep -Eq \'^[0-9a-fA-F]{40}$\'; then');
    expect(source).toContain('target_sha="$(printf \'%s\' "$rollback_sha" | tr \'[:upper:]\' \'[:lower:]\')"');
    expect(source).toContain('git cat-file -e "$target_sha^{commit}"');
    expect(source).toContain('git merge-base --is-ancestor "$target_sha" "origin/${APPROVED_BRANCH}"');
    expect(source).toContain("ref: ${{ needs.resolve-target.outputs.target_sha }}");
    expect(source).toContain('validation_sha="$(git rev-parse HEAD)"');
    expect(source).toContain("Build + internal regression checks");
    expect(source).toContain("run: pnpm run check");
    expect(source).toContain("pnpm run build");
    expect(source).toContain("needs: resolve-target");
    expect(source).toContain("- resolve-target");
    expect(source).toContain("- check");
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

  it("keeps all production health probes read-only", () => {
    const source = workflowSource();
    const methods = [...source.matchAll(/wait_for_status\s+"[^"]+"\s+"([^"]+)"/g)].map((match) => match[1]);

    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(["HEAD", "GET"]));
    expect(source).not.toMatch(/wait_for_status\s+"[^"]+"\s+"(?:POST|PUT|PATCH|DELETE)"/);
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

  it("pins the production SSH host key before writing known_hosts", () => {
    const source = workflowSource();
    const prepareSshBlock = source.match(/- name: Prepare SSH[\s\S]*?\n      - name: Deploy selected commit/)?.[0] ?? "";

    expect(prepareSshBlock).toContain("PRODUCTION_SSH_HOST_KEY_SHA256");
    expect(prepareSshBlock).toContain("Refusing production deploy: PRODUCTION_SSH_HOST_KEY_SHA256 is required");
    expect(prepareSshBlock).toContain("scan_production_known_hosts() {");
    expect(prepareSshBlock).toContain("verify_production_ssh_host_key() {");
    expect(prepareSshBlock).toContain('ssh-keygen -lf "$target_file" -E sha256');
    expect(prepareSshBlock).toContain('grep -Fx -f "$expected_fingerprints_tmp" "$scanned_fingerprints_tmp"');
    expect(prepareSshBlock).toContain('ssh-keyscan -4 -T 15 -p "$PRODUCTION_SSH_PORT" "$PRODUCTION_HOST"');
    expect(prepareSshBlock).toContain('ssh-keyscan -T 15 -p "$PRODUCTION_SSH_PORT" "$PRODUCTION_HOST"');
    expect(prepareSshBlock.indexOf('verify_production_ssh_host_key "$known_hosts_tmp"')).toBeLessThan(
      prepareSshBlock.indexOf('cat "$known_hosts_tmp" >> ~/.ssh/known_hosts'),
    );
    expect(prepareSshBlock).not.toContain('ssh-keyscan -p "$PRODUCTION_SSH_PORT" "$PRODUCTION_HOST" >> ~/.ssh/known_hosts');
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

  it("requires rollback SHA selection and post-rollback health checks to share the normal deploy path", () => {
    const source = workflowSource();
    const deployStepIndex = source.indexOf("- name: Deploy selected commit");
    const verifyStepIndex = source.indexOf("- name: Verify production health");

    expect(source).toContain("rollback_sha:");
    expect(source).toContain('TARGET_SHA: ${{ needs.resolve-target.outputs.target_sha }}');
    expect(source).toContain('Refusing production deploy: TARGET_SHA must be a validated lowercase full commit SHA.');
    expect(source).toContain('Refusing production deploy: remote TARGET_SHA is invalid.');
    expect(source).toContain('bash -s -- \\');
    expect(source).toContain('git checkout --force "$TARGET_SHA"');
    expect(source).toContain('target_sha="$(git rev-parse "$TARGET_SHA")"');
    expect(source).toContain("Production checkout SHA mismatch");
    expect(source).not.toContain("TARGET_SHA='$TARGET_SHA'");
    expect(deployStepIndex).toBeGreaterThan(-1);
    expect(verifyStepIndex).toBeGreaterThan(deployStepIndex);
  });

  it("passes the production compose file explicitly without mutating the remote checkout", () => {
    const source = workflowSource();

    expect(source).toContain("Production deploy evidence: target_sha=${TARGET_SHA} checked_out_sha=${deployed_sha} compose_file=docker-compose.production.yml.");
    expect(source).toContain("docker compose -f docker-compose.production.yml up -d --build creditregulatorpro creditregulatorpro-ingest-worker");
    expect(source).not.toContain("cp docker-compose.production.yml docker-compose.yml");
  });

  it("keeps production ingest worker execution default-off and manual only", () => {
    const source = workflowSource();

    expect(source).toContain("run_ingest_worker:");
    expect(source).toContain("run_ingest_worker_dry_run:");
    expect(source).toContain("run_ingest_worker_apply:");
    expect(source).toContain("default: false");
    expect(source).toContain("run_ingest_worker=true is required before dry-run or apply.");
    expect(source).toContain("choose dry-run or apply when run_ingest_worker=true.");
    expect(source).toContain("ingest_worker_max_jobs must be explicitly set to 1-5 when a worker run is requested.");
    expect(source).toContain("Skipping production ingest worker. Manual workflow_dispatch input is required.");
    expect(source).toContain('RUN_PRODUCTION_INGEST_WORKER: ${{ github.event_name == \'workflow_dispatch\' && inputs.run_ingest_worker || false }}');
    expect(source).toContain('RUN_PRODUCTION_INGEST_WORKER_DRY_RUN: ${{ github.event_name == \'workflow_dispatch\' && inputs.run_ingest_worker_dry_run || false }}');
    expect(source).toContain('RUN_PRODUCTION_INGEST_WORKER_APPLY: ${{ github.event_name == \'workflow_dispatch\' && inputs.run_ingest_worker_apply || false }}');
    expect(source).toContain("production_worker_requested=\"false\"");
    expect(source).not.toContain("docker compose up -d --build ingest");
    expect(source).not.toContain("restart: unless-stopped ingest");
  });

  it("supports only read-only dry-run or guarded bounded one-shot production worker apply", () => {
    const source = workflowSource();

    expect(source).toContain("run_production_ingest_worker_plan() {");
    expect(source).toContain("choose dry-run or apply, not both");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_max_jobs must be explicitly set to 1-5 when a worker run is requested.");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_operator must be a safe token.");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_apply_ack is invalid.");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_apply_ack is required for apply.");
    expect(source).toContain("Refusing production ingest worker input: ingest_worker_operator is required for apply and must be a safe token.");
    expect(source).toContain("ingest_worker_max_jobs must be 1-5");
    expect(source).toContain("Running read-only bounded production ingest worker dry-run.");
    expect(source).toContain("Production ingest worker evidence: mode=dry-run max_jobs=${PRODUCTION_INGEST_WORKER_MAX_JOBS} mutates_queue=false.");
    expect(source).toContain(
      "pnpm run ingest:worker -- --dry-run --max-jobs \"$PRODUCTION_INGEST_WORKER_MAX_JOBS\" --concurrency 1 --worker-id production-ingest-worker-dry-run --source authenticated_ingest_process",
    );
    expect(source).toContain("explicit-bounded-production-ingest-worker-apply");
    expect(source).toContain("CRP_PRODUCTION_INGEST_WORKER_ONE_SHOT=true");
    expect(source).toContain("CRP_PRODUCTION_INGEST_WORKER_MAX_JOBS=\"$PRODUCTION_INGEST_WORKER_MAX_JOBS\"");
    expect(source).toContain("CRP_PRODUCTION_INGEST_WORKER_OPERATOR=\"$PRODUCTION_INGEST_WORKER_OPERATOR\"");
    expect(source).toContain("Production ingest worker evidence: mode=apply max_jobs=${PRODUCTION_INGEST_WORKER_MAX_JOBS} failure_stops_workflow=true.");
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
