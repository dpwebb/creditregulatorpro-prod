import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DOCUMENT_STORAGE_REQUIRED_DIRS,
  ensureRequiredDocumentStorageDirectories,
  getRequiredDocumentStorageDirectories,
  resolveDocumentStorageRoot,
} from "../../helpers/documentStoragePreflight";

const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "crp-document-storage-preflight-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    await rm(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("document storage startup preflight", () => {
  it("creates all required document storage directories idempotently", async () => {
    const storageRoot = path.join(tempRoot(), "document-storage");
    const env = { LOCAL_DOCUMENT_STORAGE_PATH: storageRoot } as NodeJS.ProcessEnv;

    const first = await ensureRequiredDocumentStorageDirectories({ env });
    const second = await ensureRequiredDocumentStorageDirectories({ env });

    expect(first.storageRoot).toBe(storageRoot);
    expect(second.directories.map((entry) => entry.id)).toEqual([...DOCUMENT_STORAGE_REQUIRED_DIRS]);

    for (const required of getRequiredDocumentStorageDirectories({ env })) {
      const entry = await stat(required.path);
      expect(entry.isDirectory()).toBe(true);
    }
  });

  it("does not delete existing packet PDF files when re-run", async () => {
    const storageRoot = path.join(tempRoot(), "document-storage");
    const env = { LOCAL_DOCUMENT_STORAGE_PATH: storageRoot } as NodeJS.ProcessEnv;
    const existingPacketPath = path.join(storageRoot, "packet-pdfs", "existing-packet.pdf");

    await mkdir(path.dirname(existingPacketPath), { recursive: true });
    await writeFile(existingPacketPath, "%PDF-1.4\nexisting packet\n%%EOF\n");

    await ensureRequiredDocumentStorageDirectories({ env });

    await expect(readFile(existingPacketPath, "utf8")).resolves.toContain("existing packet");
  });

  it("resolves DOCUMENT_STORAGE_PATH when LOCAL_DOCUMENT_STORAGE_PATH is absent", () => {
    const root = path.join(tempRoot(), "fallback-document-storage");
    const env = { DOCUMENT_STORAGE_PATH: root } as NodeJS.ProcessEnv;

    expect(resolveDocumentStorageRoot({ env })).toBe(root);
  });

  it("keeps runtime audit wired to the required storage directory inventory", () => {
    const source = readFileSync(path.join(process.cwd(), "scripts", "runtime-audit.mjs"), "utf8");

    for (const dir of DOCUMENT_STORAGE_REQUIRED_DIRS.filter(Boolean)) {
      expect(source).toContain(`"${dir}"`);
    }
    expect(source).toContain("Required storage directory");
    expect(source).toContain('await access(path.join(root, "packet-pdfs"), constants.W_OK)');
  });

  it("runs the preflight before the server starts listening", () => {
    const source = readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
    const preflightIndex = source.indexOf("ensureRequiredDocumentStorageDirectories");
    const listenIndex = source.indexOf("serve({ fetch: app.fetch, port })");

    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(listenIndex).toBeGreaterThan(preflightIndex);
  });
});
