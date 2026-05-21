import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowSource = () =>
  readFileSync(join(process.cwd(), ".github", "workflows", "deploy-staging.yml"), "utf8");

describe("staging deploy workflow health gate", () => {
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

    expect(source).toContain("Check out repository for target validation");
    expect(source).toContain("fetch-depth: 0");
    expect(source).toContain("ROLLBACK_SHA_INPUT: ${{ github.event_name == 'workflow_dispatch' && inputs.rollback_sha || '' }}");
    expect(source).toContain('if ! printf \'%s\' "$rollback_sha" | grep -Eq \'^[0-9a-fA-F]{40}$\'; then');
    expect(source).toContain('target_sha="$(printf \'%s\' "$rollback_sha" | tr \'[:upper:]\' \'[:lower:]\')"');
    expect(source).toContain('git cat-file -e "$target_sha^{commit}"');
    expect(source).toContain('Refusing staging deploy: TARGET_SHA must be a validated lowercase full commit SHA.');
    expect(source).toContain('Refusing staging deploy: remote TARGET_SHA is invalid.');
    expect(source).toContain('bash -s -- \\');
    expect(source).not.toContain("TARGET_SHA='$TARGET_SHA'");
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
