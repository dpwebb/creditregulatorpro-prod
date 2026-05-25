import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordStorageFailureMetric } from "./productionObservabilityMetrics";

const STORAGE_PREFIX = "local:";

async function recordStorageFailureMetricBestEffort(input: Parameters<typeof recordStorageFailureMetric>[0]): Promise<void> {
  const isTestRun = process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST_WORKER_ID;
  if (isTestRun && process.env.CRP_RECORD_TEST_STORAGE_FAILURE_METRICS !== "true") {
    return;
  }
  await recordStorageFailureMetric(input).catch(() => undefined);
}

function getStorageRoot(): string {
  return path.resolve(
    process.cwd(),
    process.env.LOCAL_DOCUMENT_STORAGE_PATH ||
      process.env.DOCUMENT_STORAGE_PATH ||
      "document-storage"
  );
}

function getSafeObjectPath(objectName: string): string {
  const normalizedName = objectName.replace(/\\/g, "/");
  const relativePath = path.normalize(normalizedName);

  if (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Invalid storage object path");
  }

  const storageRoot = getStorageRoot();
  const fullPath = path.resolve(storageRoot, relativePath);

  if (fullPath !== storageRoot && !fullPath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Invalid storage object path");
  }

  return fullPath;
}

function decodeBase64File(base64File: string): Buffer {
  const base64Data = base64File.includes(",")
    ? base64File.split(",")[1]
    : base64File;

  return Buffer.from(base64Data, "base64");
}

function getObjectNameFromStorageUrl(storageUrl: string): string | null {
  if (!storageUrl.startsWith(STORAGE_PREFIX)) {
    return null;
  }

  return storageUrl.substring(STORAGE_PREFIX.length);
}

export type StoredFileAvailability =
  | {
      available: true;
      storageProvider: "inline";
      objectName: null;
      failureReason: null;
    }
  | {
      available: true;
      storageProvider: "local_file_storage";
      objectName: string;
      failureReason: null;
    }
  | {
      available: false;
      storageProvider: "local_file_storage";
      objectName: string;
      failureReason: string;
    };

export function classifyStorageFailureReason(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") return "not_found";
  if (typeof code === "string" && code.trim()) return code.toLowerCase();
  if (error instanceof Error && error.name) return error.name;
  return "unknown";
}

export function getStoredFileObjectName(storageUrl: string | null | undefined): string | null {
  return typeof storageUrl === "string" ? getObjectNameFromStorageUrl(storageUrl) : null;
}

export async function checkStoredFileAvailability(storageUrl: string): Promise<StoredFileAvailability> {
  const objectName = getObjectNameFromStorageUrl(storageUrl);

  if (!objectName) {
    return {
      available: true,
      storageProvider: "inline",
      objectName: null,
      failureReason: null,
    };
  }

  return checkStoredObjectAvailability(objectName);
}

export async function checkStoredObjectAvailability(objectName: string): Promise<StoredFileAvailability> {
  try {
    await stat(getSafeObjectPath(objectName));
    return {
      available: true,
      storageProvider: "local_file_storage",
      objectName,
      failureReason: null,
    };
  } catch (error) {
    await recordStorageFailureMetricBestEffort({
      operation: "read",
      provider: "local_file_storage",
      storageArea: "report_artifact",
      objectName,
      error,
    });

    return {
      available: false,
      storageProvider: "local_file_storage",
      objectName,
      failureReason: classifyStorageFailureReason(error),
    };
  }
}

export async function uploadFile(
  base64File: string,
  objectName: string,
  _mimeType: string
): Promise<string> {
  try {
    const filePath = getSafeObjectPath(objectName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, decodeBase64File(base64File));

    return `${STORAGE_PREFIX}${objectName}`;
  } catch (error) {
    await recordStorageFailureMetricBestEffort({
      operation: "write",
      provider: "local_file_storage",
      storageArea: "report_artifact",
      objectName,
      error,
    });
    throw error;
  }
}

export async function readStoredFile(storageUrl: string): Promise<Buffer> {
  const objectName = getObjectNameFromStorageUrl(storageUrl);

  if (objectName) {
    try {
      return await readFile(getSafeObjectPath(objectName));
    } catch (error) {
      await recordStorageFailureMetricBestEffort({
        operation: "read",
        provider: "local_file_storage",
        storageArea: "report_artifact",
        objectName,
        error,
      });
      throw error;
    }
  }

  return decodeBase64File(storageUrl);
}

export async function deleteStoredFile(storageUrl: string): Promise<void> {
  const objectName = getObjectNameFromStorageUrl(storageUrl);
  if (!objectName) return;

  try {
    await unlink(getSafeObjectPath(objectName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await recordStorageFailureMetricBestEffort({
        operation: "delete",
        provider: "local_file_storage",
        storageArea: "report_artifact",
        objectName,
        error,
      });
      throw error;
    }
  }
}
