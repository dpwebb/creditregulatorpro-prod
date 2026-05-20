import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  normalizeReportArtifactStorageUrlForWrite,
  REPORT_ARTIFACT_LOCAL_STORAGE_PREFIX,
  resolveReportArtifactPdfBase64,
  storeReportArtifactPdf,
} from "../../helpers/reportArtifactStorage";
import { cleanBase64Payload } from "../../helpers/reportBinaryUtils";

const pdfBase64 = Buffer.from("%PDF-1.4\nsynthetic report bytes\n%%EOF", "utf8").toString("base64");

let storageDir: string;
let previousLocalStoragePath: string | undefined;
let previousDocumentStoragePath: string | undefined;

async function cleanupStorageDir() {
  if (storageDir) {
    await rm(storageDir, { recursive: true, force: true });
  }
}

describe("report artifact storage adapter", () => {
  beforeEach(async () => {
    previousLocalStoragePath = process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    previousDocumentStoragePath = process.env.DOCUMENT_STORAGE_PATH;
    storageDir = await mkdtemp(path.join(os.tmpdir(), "crp-report-artifact-storage-"));
    process.env.LOCAL_DOCUMENT_STORAGE_PATH = storageDir;
    delete process.env.DOCUMENT_STORAGE_PATH;
  });

  afterEach(async () => {
    if (previousLocalStoragePath === undefined) {
      delete process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    } else {
      process.env.LOCAL_DOCUMENT_STORAGE_PATH = previousLocalStoragePath;
    }
    if (previousDocumentStoragePath === undefined) {
      delete process.env.DOCUMENT_STORAGE_PATH;
    } else {
      process.env.DOCUMENT_STORAGE_PATH = previousDocumentStoragePath;
    }
    await cleanupStorageDir();
  });

  it("stores new report PDF bytes as a local storage reference and resolves them for ingest compatibility", async () => {
    const stored = await storeReportArtifactPdf({
      bytesBase64: pdfBase64,
      userId: 123,
      fileName: "Synthetic Report.pdf",
      mimeType: "application/pdf",
    });

    expect(stored.storageUrl).toMatch(/^local:report-artifacts\/123\/[a-f0-9-]+-[a-f0-9]{16}-Synthetic-Report\.pdf$/);
    expect(stored.storageUrl).not.toContain(pdfBase64);
    expect(stored.storageUrl.startsWith(REPORT_ARTIFACT_LOCAL_STORAGE_PREFIX)).toBe(true);

    const relativePath = stored.storageUrl.slice("local:".length);
    await expect(readFile(path.join(storageDir, relativePath), "utf8")).resolves.toContain("%PDF-1.4");
    await expect(resolveReportArtifactPdfBase64(stored.storageUrl)).resolves.toBe(cleanBase64Payload(pdfBase64));
  });

  it("keeps legacy inline base64 records readable without rewriting them", async () => {
    await expect(resolveReportArtifactPdfBase64(pdfBase64)).resolves.toBe(pdfBase64);
  });

  it("normalizes direct report-artifact PDF writes but preserves non-PDF metadata values", async () => {
    const normalized = await normalizeReportArtifactStorageUrlForWrite({
      storageUrl: `data:application/pdf;base64,${pdfBase64}`,
      userId: 456,
      fileName: "direct-upload.pdf",
      mimeType: "application/pdf",
    });
    expect(normalized).toMatch(/^local:report-artifacts\/456\//);
    expect(normalized).not.toContain(pdfBase64);

    await expect(normalizeReportArtifactStorageUrlForWrite({
      storageUrl: "701",
      userId: 456,
    })).resolves.toBe("701");
  });
});
