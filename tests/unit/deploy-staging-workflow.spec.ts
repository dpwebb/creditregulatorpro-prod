import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowSource = () =>
  readFileSync(join(process.cwd(), ".github", "workflows", "deploy-staging.yml"), "utf8");

const composeSource = () => readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

describe("staging deploy workflow health gate", () => {
  it("scopes the staging compose project without removing unrelated orphan containers", () => {
    const workflow = workflowSource();
    const compose = composeSource();

    expect(compose).toMatch(/^name: creditregulatorpro-staging\s+services:/);
    expect(compose).toContain("container_name: creditregulatorpro-staging");
    expect(workflow).toContain("docker compose up -d --build --force-recreate creditregulatorpro-staging");
    expect(workflow).not.toContain("--remove-orphans");
  });

  it("fails fast on unsupported Vite NODE_ENV production entries without mutating env files", () => {
    const source = workflowSource();
    const driftBlock = source.match(/assert_no_unsupported_vite_node_env\(\) \{[\s\S]*?\n            \}/)?.[0] ?? "";

    expect(source).toContain("assert_no_unsupported_vite_node_env() {");
    expect(source).toContain("assert_no_unsupported_vite_node_env");
    expect(driftBlock).toContain("NODE_ENV[[:space:]]*=[[:space:]]*production");
    expect(driftBlock).toContain("Staging deploy refused: ${env_file} contains NODE_ENV=production.");
    expect(driftBlock).toContain("Fix the server config manually");
    expect(driftBlock).toContain("will not mutate persistent .env files");
    expect(driftBlock).not.toMatch(/mktemp|grep -Ev|cat "\$tmp_file" > "\$env_file"|Removed unsupported NODE_ENV=production/);
    expect(driftBlock).not.toMatch(/DATABASE_URL|FLOOT_DATABASE_URL|STAGING_DATABASE_URL/);
  });

  it("validates rollback SHA locally before staging deploy and avoids raw SSH env assignment", () => {
    const source = workflowSource();

    expect(source).toContain("resolve-target:");
    expect(source).toContain("Resolve and validate TARGET_SHA");
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
    expect(source).toContain('Refusing staging deploy: TARGET_SHA must be a validated lowercase full commit SHA.');
    expect(source).toContain('Refusing staging deploy: remote TARGET_SHA is invalid.');
    expect(source).toContain('bash -s -- \\');
    expect(source).not.toContain("TARGET_SHA='$TARGET_SHA'");
  });

  it("verifies the selected staging checkout SHA on the remote host", () => {
    const source = workflowSource();

    expect(source).toContain('git checkout --force "$TARGET_SHA"');
    expect(source).toContain('deployed_sha="$(git rev-parse HEAD)"');
    expect(source).toContain('target_sha="$(git rev-parse "$TARGET_SHA")"');
    expect(source).toContain('if [ "$deployed_sha" != "$target_sha" ]; then');
    expect(source).toContain("Staging checkout SHA mismatch");
    expect(source).toContain("Staging checkout verified");
    expect(source).toContain("Staging deploy evidence: target_sha=${TARGET_SHA} checked_out_sha=${deployed_sha} compose_file=docker-compose.yml.");
  });

  it("retries staging SSH host-key collection without falling back to unchecked deploy", () => {
    const source = workflowSource();
    const prepareSshBlock = source.match(/- name: Prepare SSH[\s\S]*?\n      - name: Deploy selected commit/)?.[0] ?? "";

    expect(prepareSshBlock).toContain("scan_staging_known_hosts() {");
    expect(prepareSshBlock).toContain('ssh-keyscan -4 -T 15 -p "$STAGING_SSH_PORT" "$STAGING_HOST"');
    expect(prepareSshBlock).toContain('ssh-keyscan -T 15 -p "$STAGING_SSH_PORT" "$STAGING_HOST"');
    expect(prepareSshBlock).toContain("for attempt in 1 2 3 4 5 6 7 8; do");
    expect(prepareSshBlock).toContain("Staging SSH host key scan attempt ${attempt}/8 failed; retrying.");
    expect(prepareSshBlock).toContain("Failed to collect staging SSH host key after retries.");
    expect(prepareSshBlock).toContain("deploy did not start");
    expect(prepareSshBlock).not.toMatch(/StrictHostKeyChecking=(?:no|accept-new)/);
    expect(prepareSshBlock).not.toMatch(/ssh .* \|\| true/);
  });

  it("documents transient 404 readiness retries without weakening the response-auth gate", () => {
    const source = workflowSource();

    expect(source).toContain("wait_for_staging_health() {");
    expect(source).toContain('local health_url="https://staging.creditregulatorpro.com/login"');
    expect(source).toContain(
      "Staging health check ${label} response auth smokes retry ${attempt}/30 returned HTTP ${status_code}; retrying until the public login route is ready.",
    );
    expect(source).toContain("Staging health check failed ${label} response auth smokes after 30 attempts.");
    expect(source).toContain("wait_for_staging_health \"before\"");
    expect(source).toContain("wait_for_staging_health \"after\"");

    expect(source).toContain("grep -Eq '^[23][0-9][0-9]$'");
    expect(source).toContain("return 1");
    expect(source).not.toMatch(/wait_for_staging_health\s+"(?:before|after)"\s+\|\|\s+true/);
    expect(source).not.toContain("curl -k -fsS -o /dev/null https://staging.creditregulatorpro.com/login");
  });

  it("provides an opt-in bounded staging ingest worker orchestration path", () => {
    const source = workflowSource();

    expect(source).toContain("run_ingest_worker:");
    expect(source).toContain("ingest_worker_mode:");
    expect(source).toContain("ingest_worker_max_jobs:");
    expect(source).toContain("ingest_worker_source:");
    expect(source).toContain("ingest_worker_staging_ack:");
    expect(source).toContain("RUN_INGEST_WORKER");
    expect(source).toContain("STAGING_INGEST_WORKER_MAX_JOBS");
    expect(source).toContain("staging-safe-ingest-worker-evidence");
    expect(source).toContain("run_staging_ingest_worker_orchestration() {");
    expect(source).toContain(
      "Skipping bounded staging ingest worker orchestration. Manual workflow_dispatch run_ingest_worker=true is required.",
    );
    expect(source).toContain("-e CRP_ENV=staging");
    expect(source).toContain("-e STAGING_INGEST_WORKER_SOURCE=\"$STAGING_INGEST_WORKER_SOURCE\"");
    expect(source).toContain("creditregulatorpro-staging bash -lc");
    expect(source).toContain('if [ "${CRP_ENV:-}" != "staging" ]; then');
    expect(source).toContain("database environment is missing");
    expect(source).toContain("ingest_worker_max_jobs must be explicitly set to 1-10");
    expect(source).toContain("ingest_worker_source must be explicitly staging-safe");
    expect(source).toContain(
      'pnpm run ingest:worker -- "$mode_flag" --max-jobs "$STAGING_INGEST_WORKER_MAX_JOBS" --concurrency 1 --worker-id staging-deploy-ingest-worker --source "$STAGING_INGEST_WORKER_SOURCE"',
    );
    expect(source).not.toContain("--max-jobs 100 --concurrency 1 --worker-id staging-deploy-ingest-worker");
  });
});
