import { mkdir } from "node:fs/promises";
import path from "node:path";

export const DOCUMENT_STORAGE_REQUIRED_DIRS = [
  "",
  "report-artifacts",
  "packet-pdfs",
  "evidence",
  "evidence/bureau-communications",
  "identification",
  "packets",
] as const;

export type DocumentStorageRequiredDir = typeof DOCUMENT_STORAGE_REQUIRED_DIRS[number];

export type DocumentStoragePreflightResult = {
  storageRoot: string;
  directories: Array<{
    id: DocumentStorageRequiredDir;
    path: string;
    createdOrPresent: boolean;
  }>;
};

export function resolveDocumentStorageRoot({
  env = process.env,
  cwd = process.cwd(),
}: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
} = {}): string {
  const configuredPath = env.LOCAL_DOCUMENT_STORAGE_PATH || env.DOCUMENT_STORAGE_PATH || "document-storage";
  return path.resolve(cwd, configuredPath);
}

function resolveRequiredDirectory(storageRoot: string, dir: DocumentStorageRequiredDir): string {
  return dir ? path.resolve(storageRoot, dir) : storageRoot;
}

export function getRequiredDocumentStorageDirectories({
  env = process.env,
  cwd = process.cwd(),
}: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
} = {}) {
  const storageRoot = resolveDocumentStorageRoot({ env, cwd });
  return DOCUMENT_STORAGE_REQUIRED_DIRS.map((dir) => ({
    id: dir,
    path: resolveRequiredDirectory(storageRoot, dir),
  }));
}

export async function ensureRequiredDocumentStorageDirectories({
  env = process.env,
  cwd = process.cwd(),
}: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
} = {}): Promise<DocumentStoragePreflightResult> {
  const storageRoot = resolveDocumentStorageRoot({ env, cwd });
  const directories = [];

  for (const dir of DOCUMENT_STORAGE_REQUIRED_DIRS) {
    const dirPath = resolveRequiredDirectory(storageRoot, dir);
    await mkdir(dirPath, { recursive: true });
    directories.push({
      id: dir,
      path: dirPath,
      createdOrPresent: true,
    });
  }

  return {
    storageRoot,
    directories,
  };
}
