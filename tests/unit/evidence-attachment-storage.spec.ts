import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BUREAU_COMMUNICATION_LOCAL_STORAGE_PREFIX,
  buildBureauCommunicationStorageMetadata,
  resolveEvidenceAttachmentBase64,
  storeBureauCommunicationAttachment,
} from "../../helpers/evidenceAttachmentStorage";
import { cleanBase64Payload } from "../../helpers/reportBinaryUtils";

const pdfBase64 = Buffer.from("%PDF-1.4\nsynthetic bureau response\n%%EOF", "utf8").toString("base64");

let storageDir: string;
let previousLocalStoragePath: string | undefined;
let previousDocumentStoragePath: string | undefined;

async function cleanupStorageDir() {
  if (storageDir) {
    await rm(storageDir, { recursive: true, force: true });
  }
}

describe("evidence attachment storage adapter", () => {
  beforeEach(async () => {
    previousLocalStoragePath = process.env.LOCAL_DOCUMENT_STORAGE_PATH;
    previousDocumentStoragePath = process.env.DOCUMENT_STORAGE_PATH;
    storageDir = await mkdtemp(path.join(os.tmpdir(), "crp-evidence-attachment-storage-"));
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

  it("stores new bureau communication bytes as a storage reference and resolves the reference", async () => {
    const stored = await storeBureauCommunicationAttachment({
      bytesBase64: pdfBase64,
      userId: 123,
      fileName: "Synthetic Bureau Response.pdf",
      mimeType: "application/pdf",
    });

    expect(stored.storageUrl).toMatch(/^local:evidence\/bureau-communications\/123\/[a-f0-9-]+-[a-f0-9]{16}-Synthetic-Bureau-Response\.pdf$/);
    expect(stored.storageUrl).not.toContain(pdfBase64);
    expect(stored.storageUrl.startsWith(BUREAU_COMMUNICATION_LOCAL_STORAGE_PREFIX)).toBe(true);

    const relativePath = stored.storageUrl.slice("local:".length);
    await expect(readFile(path.join(storageDir, relativePath), "utf8")).resolves.toContain("%PDF-1.4");
    await expect(resolveEvidenceAttachmentBase64(stored.storageUrl)).resolves.toBe(cleanBase64Payload(pdfBase64));
  });

  it("keeps legacy inline evidence attachment records readable without rewriting them", async () => {
    await expect(resolveEvidenceAttachmentBase64(`data:application/pdf;base64,${pdfBase64}`)).resolves.toBe(pdfBase64);
    await expect(resolveEvidenceAttachmentBase64(pdfBase64)).resolves.toBe(pdfBase64);
  });

  it("describes bureau communication storage without exposing object names or signed URLs", async () => {
    const stored = await storeBureauCommunicationAttachment({
      bytesBase64: pdfBase64,
      userId: 456,
      fileName: "bureau-response.pdf",
      mimeType: "application/pdf",
    });
    const metadata = buildBureauCommunicationStorageMetadata(stored);
    const text = JSON.stringify(metadata);

    expect(metadata).toMatchObject({
      bureauCommunicationStorage: {
        provider: "local",
        referenceFormat: "local:evidence/bureau-communications/<user-id>/<uuid>-<sha256-prefix>-<filename>",
        storageReferencePrefix: BUREAU_COMMUNICATION_LOCAL_STORAGE_PREFIX,
        inlineBase64StoredInDatabase: false,
        signedUrlExposed: false,
      },
    });
    expect(text).not.toContain(pdfBase64);
    expect(text).not.toContain(stored.objectName);
    expect(text).not.toMatch(/X-Goog-|AWSAccessKeyId|Signature=|token|secret/i);
  });
});
