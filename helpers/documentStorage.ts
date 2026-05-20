import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordStorageFailureMetric } from "./productionObservabilityMetrics";

const LOCAL_STORAGE_PREFIX = "local:";

async function recordStorageFailureMetricBestEffort(input: Parameters<typeof recordStorageFailureMetric>[0]): Promise<void> {
  const isTestRun = process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.VITEST_WORKER_ID;
  if (isTestRun && process.env.CRP_RECORD_TEST_STORAGE_FAILURE_METRICS !== "true") {
    return;
  }
  await recordStorageFailureMetric(input).catch(() => undefined);
}

function getStorageRoot(): string {
  const configuredPath =
    process.env.LOCAL_DOCUMENT_STORAGE_PATH ||
    process.env.DOCUMENT_STORAGE_PATH ||
    "document-storage";

  return path.resolve(process.cwd(), configuredPath);
}

function getSafeObjectPath(objectName: string): string {
  const normalizedName = objectName.replace(/\\/g, "/");
  const relativePath = path.normalize(normalizedName);

  if (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Invalid document storage path");
  }

  const storageRoot = getStorageRoot();
  const fullPath = path.resolve(storageRoot, relativePath);

  if (fullPath !== storageRoot && !fullPath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Invalid document storage path");
  }

  return fullPath;
}

function decodeBase64File(base64File: string): Buffer {
  const base64Data = base64File.includes(",")
    ? base64File.split(",")[1]
    : base64File;

  return Buffer.from(base64Data, "base64");
}

export async function uploadPdf(base64Pdf: string, objectName: string): Promise<string> {
  try {
    const filePath = getSafeObjectPath(objectName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, decodeBase64File(base64Pdf));

    return `${LOCAL_STORAGE_PREFIX}${objectName}`;
  } catch (error) {
    await recordStorageFailureMetricBestEffort({
      operation: "write",
      provider: "local_document_storage",
      storageArea: "packet_pdf",
      objectName,
      error,
    });
    throw error;
  }
}

export async function readStoredPdf(pdfStorageUrl: string): Promise<Buffer> {
  if (pdfStorageUrl.startsWith(LOCAL_STORAGE_PREFIX)) {
    const objectName = pdfStorageUrl.substring(LOCAL_STORAGE_PREFIX.length);
    try {
      return await readFile(getSafeObjectPath(objectName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        await recordStorageFailureMetricBestEffort({
          operation: "read",
          provider: "local_document_storage",
          storageArea: "packet_pdf",
          objectName,
          error,
        });
      }
      throw error;
    }
  }

  if (pdfStorageUrl.startsWith("gcs:")) {
    const error = new Error("GCS packet PDF storage is no longer supported");
    await recordStorageFailureMetricBestEffort({
      operation: "read",
      provider: "gcs_document_storage",
      storageArea: "packet_pdf",
      storageUrl: pdfStorageUrl,
      error,
    });
    throw error;
  }

  return decodeBase64File(pdfStorageUrl);
}

export function resolvePdfStorageUrl(pdfStorageUrl: string | null): string | null {
  return pdfStorageUrl;
}
