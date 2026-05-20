import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowSource = () =>
  readFileSync(join(process.cwd(), ".github", "workflows", "deploy-staging.yml"), "utf8");

describe("staging deploy workflow health gate", () => {
  it("removes only unsupported Vite NODE_ENV production entries before building", () => {
    const source = workflowSource();
    const cleanupBlock = source.match(/remove_unsupported_vite_node_env\(\) \{[\s\S]*?\n            \}/)?.[0] ?? "";

    expect(source).toContain("remove_unsupported_vite_node_env() {");
    expect(source).toContain("remove_unsupported_vite_node_env");
    expect(cleanupBlock).toContain("NODE_ENV[[:space:]]*=[[:space:]]*production");
    expect(cleanupBlock).toContain("Removed unsupported NODE_ENV=production");
    expect(cleanupBlock).not.toMatch(/DATABASE_URL|FLOOT_DATABASE_URL|STAGING_DATABASE_URL/);
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
    expect(source).toContain("RUN_INGEST_WORKER");
    expect(source).toContain("run_staging_ingest_worker_orchestration() {");
    expect(source).toContain(
      "Skipping bounded staging ingest worker orchestration. Manual workflow_dispatch run_ingest_worker=true is required.",
    );
    expect(source).toContain("docker exec -e CRP_ENV=staging creditregulatorpro-staging bash -lc");
    expect(source).toContain('if [ "${CRP_ENV:-}" != "staging" ]; then');
    expect(source).toContain("database environment is missing");
    expect(source).toContain(
      "pnpm run ingest:worker -- --apply --max-jobs 5 --concurrency 1 --worker-id staging-deploy-ingest-worker",
    );
    expect(source).not.toContain("--max-jobs 100 --concurrency 1 --worker-id staging-deploy-ingest-worker");
  });
});
