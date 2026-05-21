import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildStorageDurabilityEvidence,
  evaluateStorageDurabilityContract,
  parseStorageDurabilityContractArgs,
  runStorageSentinelDurabilitySimulation,
  validateDeployWorkflowStoragePreflight,
} from "../../scripts/storage-durability-contract";

const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "crp-storage-contract-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("storage durability contract", () => {
  it("fails closed for unsafe ephemeral local storage in production mode", () => {
    const report = evaluateStorageDurabilityContract({
      targetEnvironment: "production",
      env: {
        LOCAL_DOCUMENT_STORAGE_PATH: "document-storage",
      } as NodeJS.ProcessEnv,
    });

    expect(report.status).toBe("failed");
    expect(report.mode).toBe("unsafe-local");
    expect(report.errors.join("\n")).toMatch(/no explicit durable mount\/volume/i);
  });

  it("passes durable local mount simulation", async () => {
    const root = tempRoot();
    const report = evaluateStorageDurabilityContract({
      targetEnvironment: "production",
      env: {
        LOCAL_DOCUMENT_STORAGE_PATH: root,
        CRP_DURABLE_LOCAL_STORAGE: "true",
      } as NodeJS.ProcessEnv,
    });
    const simulation = await runStorageSentinelDurabilitySimulation({ writeStorageRoot: root });

    expect(report.status).toBe("passed");
    expect(report.mode).toBe("durable-local-mount");
    expect(simulation.status).toBe("passed");
    expect(simulation.actualDigest).toBe(simulation.expectedDigest);
  });

  it("proves an ephemeral container-boundary read fails when the storage root changes", async () => {
    const writeRoot = tempRoot();
    const readRoot = tempRoot();

    const simulation = await runStorageSentinelDurabilitySimulation({
      writeStorageRoot: writeRoot,
      readStorageRoot: readRoot,
    });

    expect(simulation.status).toBe("failed");
    expect(simulation.error).toMatch(/ENOENT|no such file/i);
  });

  it("passes object-storage configuration without live network calls", () => {
    const report = evaluateStorageDurabilityContract({
      targetEnvironment: "production",
      env: {
        DOCUMENT_STORAGE_MODE: "object",
        DOCUMENT_STORAGE_PROVIDER: "gcs",
        DOCUMENT_STORAGE_BUCKET: "synthetic-durable-bucket",
      } as NodeJS.ProcessEnv,
    });

    expect(report.status).toBe("passed");
    expect(report.mode).toBe("object-storage");
    expect(report.objectStorage).toMatchObject({
      configured: true,
      provider: "gcs",
      bucketConfigured: true,
      liveNetworkCallsMade: false,
    });
  });

  it("fails closed when a production storage root is missing", () => {
    const report = evaluateStorageDurabilityContract({
      targetEnvironment: "production",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(report.status).toBe("failed");
    expect(report.mode).toBe("missing");
    expect(report.errors.join("\n")).toMatch(/storage root is missing/i);
  });

  it("validates compose durable mounts and deploy preflight wiring", async () => {
    const stagingWorkflow = readFileSync(path.join(process.cwd(), ".github/workflows/deploy-staging.yml"), "utf8");
    const productionWorkflow = readFileSync(path.join(process.cwd(), ".github/workflows/deploy-production.yml"), "utf8");

    expect(evaluateStorageDurabilityContract({
      targetEnvironment: "staging",
      composePath: "docker-compose.yml",
      serviceName: "creditregulatorpro-staging",
    })).toMatchObject({
      status: "passed",
      mode: "durable-local-mount",
      durableLocal: {
        source: "./document-storage",
        target: "/app/document-storage",
        type: "bind",
      },
    });

    expect(evaluateStorageDurabilityContract({
      targetEnvironment: "production",
      composePath: "docker-compose.production.yml",
      serviceName: "creditregulatorpro",
    })).toMatchObject({
      status: "passed",
      mode: "durable-local-mount",
    });

    expect(validateDeployWorkflowStoragePreflight({
      workflowText: stagingWorkflow,
      environment: "staging",
      composePath: "docker-compose.yml",
      serviceName: "creditregulatorpro-staging",
    }).status).toBe("passed");
    expect(validateDeployWorkflowStoragePreflight({
      workflowText: productionWorkflow,
      environment: "production",
      composePath: "docker-compose.production.yml",
      serviceName: "creditregulatorpro",
    }).status).toBe("passed");

    const evidence = await buildStorageDurabilityEvidence({ generatedAt: "2026-05-21T12:00:00.000Z" });
    expect(evidence.CERTIFYING).toBe(true);
    expect(evidence.liveExternalProviderCallsMade).toBe(0);
  });

  it("parses preflight arguments", () => {
    expect(parseStorageDurabilityContractArgs([
      "--environment",
      "staging",
      "--compose",
      "docker-compose.yml",
      "--service",
      "creditregulatorpro-staging",
      "--preflight",
      "--no-write-evidence",
      "--json",
    ])).toMatchObject({
      environment: "staging",
      composePath: "docker-compose.yml",
      serviceName: "creditregulatorpro-staging",
      preflight: true,
      writeEvidence: false,
      json: true,
    });
    expect(() => parseStorageDurabilityContractArgs(["--environment", "prod"])).toThrow(/local, staging, or production/);
  });
});
