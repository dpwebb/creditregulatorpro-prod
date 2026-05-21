import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  SSH_HOST_KEY_PINNING_JSON_PATH,
  SSH_HOST_KEY_PINNING_MD_PATH,
  bashSyntaxCheckWorkflowRunBlocks,
  buildSshHostKeyPinningReport,
  simulateSshHostKeyPinning,
  validateSshHostKeyPinningWorkflowSafety,
  writeSshHostKeyPinningEvidence,
} from "../../scripts/deploy-ssh-host-key-pinning-evidence.mjs";

const MATCHING_FINGERPRINT = "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
const OTHER_FINGERPRINT = "SHA256:fedcba9876543210ZYXWVUTSRQPONMLKJIHGFED";

function workflowSource(name: "staging" | "production") {
  return readFileSync(join(process.cwd(), ".github", "workflows", `deploy-${name}.yml`), "utf8");
}

function tempRepoWithWorkflows() {
  const root = mkdtempSync(join(tmpdir(), "crp-ssh-host-key-pinning-"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "deploy-staging.yml"), workflowSource("staging"));
  writeFileSync(join(root, ".github", "workflows", "deploy-production.yml"), workflowSource("production"));
  return root;
}

describe("deploy SSH host key pinning", () => {
  it("fails production-mode simulation when the expected fingerprint is missing", () => {
    const result = simulateSshHostKeyPinning({
      environment: "production",
      expectedValue: "",
      scannedFingerprints: [MATCHING_FINGERPRINT],
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("missing-expected-fingerprint");
    expect(result.knownHostsWritten).toBe(false);
    expect(result.CERTIFYING).toBe(false);
  });

  it("fails simulation when scanned and expected fingerprints do not match", () => {
    const result = simulateSshHostKeyPinning({
      environment: "production",
      expectedValue: OTHER_FINGERPRINT,
      scannedFingerprints: [MATCHING_FINGERPRINT],
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("fingerprint-mismatch");
    expect(result.knownHostsWritten).toBe(false);
  });

  it("passes simulation only when a scanned fingerprint matches the expected value", () => {
    const result = simulateSshHostKeyPinning({
      environment: "production",
      expectedValue: `unused ${MATCHING_FINGERPRINT}`,
      scannedFingerprints: [MATCHING_FINGERPRINT, OTHER_FINGERPRINT],
    });

    expect(result.status).toBe("passed");
    expect(result.reason).toBe("fingerprint-matched");
    expect(result.knownHostsWritten).toBe(true);
    expect(result.events.map((event) => event.action)).toEqual(
      expect.arrayContaining(["verify-fingerprint", "write-known-hosts"]),
    );
  });

  it("requires deploy workflows to verify scanned host keys before writing known_hosts", () => {
    const validation = validateSshHostKeyPinningWorkflowSafety({
      stagingWorkflowText: workflowSource("staging"),
      productionWorkflowText: workflowSource("production"),
    });

    expect(validation.status).toBe("passed");
    expect(validation.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "production requires expected SSH host fingerprint", passed: true }),
        expect.objectContaining({ name: "production compares scanned key to expected fingerprint", passed: true }),
        expect.objectContaining({ name: "staging supports the same expected fingerprint verifier", passed: true }),
        expect.objectContaining({ name: "production known_hosts is written only after verification", passed: true }),
        expect.objectContaining({ name: "staging known_hosts is written only after verifier gate", passed: true }),
      ]),
    );
  });

  it("fails workflow validation when known_hosts is written directly from ssh-keyscan", () => {
    const production = workflowSource("production").replace(
      'if ssh-keyscan -4 -T 15 -p "$PRODUCTION_SSH_PORT" "$PRODUCTION_HOST" > "$target_file" 2>/dev/null && [ -s "$target_file" ]; then',
      'if ssh-keyscan -p "$PRODUCTION_SSH_PORT" "$PRODUCTION_HOST" >> ~/.ssh/known_hosts; then',
    );
    const validation = validateSshHostKeyPinningWorkflowSafety({
      stagingWorkflowText: workflowSource("staging"),
      productionWorkflowText: production,
    });

    expect(validation.status).toBe("failed");
    expect(validation.failedChecks.map((check) => check.name).join("\n")).toMatch(/ssh-keyscan remains collection only/i);
  });

  it("passes bash syntax for extracted workflow run blocks", () => {
    expect(bashSyntaxCheckWorkflowRunBlocks(workflowSource("staging")).status).toBe("passed");
    expect(bashSyntaxCheckWorkflowRunBlocks(workflowSource("production")).status).toBe("passed");
  });

  it("writes evidence without real host key values", () => {
    const root = tempRepoWithWorkflows();
    try {
      const report = buildSshHostKeyPinningReport({
        rootDir: root,
        generatedAt: "2026-05-21T12:00:00.000Z",
      });
      writeSshHostKeyPinningEvidence(report, { rootDir: root });

      const jsonPath = join(root, ...SSH_HOST_KEY_PINNING_JSON_PATH.split("/"));
      const mdPath = join(root, ...SSH_HOST_KEY_PINNING_MD_PATH.split("/"));
      const written = JSON.parse(readFileSync(jsonPath, "utf8"));
      const markdown = readFileSync(mdPath, "utf8");

      expect(existsSync(jsonPath)).toBe(true);
      expect(existsSync(mdPath)).toBe(true);
      expect(written.status).toBe("passed");
      expect(written.CERTIFYING).toBe(false);
      expect(written.requiredConfiguration.valuesIncluded).toBe(false);
      expect(markdown).toContain("This document intentionally does not include real values.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
