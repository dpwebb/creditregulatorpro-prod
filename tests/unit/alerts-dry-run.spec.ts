import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildAlertsDryRunReport,
  REQUIRED_ALERT_DRY_RUN_CATEGORIES,
  scanAlertPayloadSensitiveContent,
  validateAlertsDryRunReport,
  writeAlertsDryRunEvidence,
} from "../../scripts/alerts-dry-run.mjs";

const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "crp-alerts-dry-run-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("alerts dry-run evidence", () => {
  it("creates SIMULATED DRY RUN evidence with all required alert categories", () => {
    const rootDir = tempRoot();
    const report = buildAlertsDryRunReport({
      rootDir,
      generatedAt: "2026-05-20T12:00:00.000Z",
      env: {},
    });
    const outputs = writeAlertsDryRunEvidence(report, { rootDir });
    const markdown = readFileSync(join(rootDir, outputs.markdownPath), "utf8");
    const json = JSON.parse(readFileSync(join(rootDir, outputs.jsonPath), "utf8"));

    expect(existsSync(join(rootDir, outputs.markdownPath))).toBe(true);
    expect(existsSync(join(rootDir, outputs.jsonPath))).toBe(true);
    expect(report.evidenceType).toBe("SIMULATED");
    expect(report.deliveryMode).toBe("DRY RUN");
    expect(report.safety.liveExternalAlertsSent).toBe(0);
    expect(report.safety.liveExternalProviderCallsMade).toBe(0);
    expect(report.safety.responseQueueSemanticsChanged).toBe(false);
    expect(report.alerts.map((alert) => alert.category)).toEqual(REQUIRED_ALERT_DRY_RUN_CATEGORIES);
    expect(markdown).toContain("SIMULATED DRY RUN");
    expect(markdown).toContain("Live external alerts sent: 0");
    expect(json.alerts).toHaveLength(REQUIRED_ALERT_DRY_RUN_CATEGORIES.length);
  });

  it("sends no external alert and keeps payloads sanitized", () => {
    const report = buildAlertsDryRunReport({ env: {} });
    const serializedPayloads = JSON.stringify(report.alerts);

    expect(report.alerts.every((alert) => alert.liveExternalCallMade === false)).toBe(true);
    expect(report.alerts.every((alert) => alert.payloadSanitized === true)).toBe(true);
    expect(scanAlertPayloadSensitiveContent(serializedPayloads)).toEqual([]);
    expect(serializedPayloads).not.toMatch(/%PDF|JVBERi0|bytesBase64|fileDataBase64|@|Bearer|session=|cookie=/i);
  });

  it("scanner rejects obvious PII, secrets, raw report data, and signed URLs", () => {
    const findings = scanAlertPayloadSensitiveContent({
      email: "person@example.com",
      ssn: "123-45-6789",
      rawPdf: "JVBERi0xLjQ=",
      token: "Bearer abcdefghijklm",
      signedUrl: "https://storage.example/object?X-Goog-Signature=abc",
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        "email_address",
        "ssn_or_sin",
        "raw_pdf_or_base64_pdf",
        "api_secret_token_or_private_key",
        "signed_url_signature",
      ]),
    );
  });

  it("refuses production-like environments and live alert flags", () => {
    expect(() => buildAlertsDryRunReport({ env: { NODE_ENV: "production" } })).toThrow(/production-like environment/i);
    expect(() => buildAlertsDryRunReport({ env: { SLACK_LIVE_ALERTS_ENABLED: "true" } })).toThrow(/live alert\/provider flag/i);
  });

  it("fails validation if simulated output is promoted to live proof", () => {
    const report = buildAlertsDryRunReport({ env: {} });
    const validation = validateAlertsDryRunReport({
      ...report,
      deliveryMode: "LIVE",
      safety: {
        ...report.safety,
        liveExternalAlertsSent: 1,
        liveExternalProviderCallsMade: 1,
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors.join("\n")).toContain("report deliveryMode must be DRY RUN");
    expect(validation.errors.join("\n")).toContain("live external alerts sent must be zero");
  });

  it("exposes the package command", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    expect(packageJson.scripts["alerts:dry-run"]).toBe("node scripts/alerts-dry-run.mjs");
  });
});
