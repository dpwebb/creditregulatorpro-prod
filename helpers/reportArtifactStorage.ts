import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  checkStoredFileAvailability,
  checkStoredObjectAvailability,
  classifyStorageFailureReason,
  getStoredFileObjectName,
  readStoredFile,
  uploadFile,
} from "./gcsStorage";
import { base64PayloadToBuffer, cleanBase64Payload, sha256HexOfBase64Payload } from "./reportBinaryUtils";

export const REPORT_ARTIFACT_STORAGE_OBJECT_PREFIX = "report-artifacts";
export const REPORT_ARTIFACT_LOCAL_STORAGE_PREFIX = `local:${REPORT_ARTIFACT_STORAGE_OBJECT_PREFIX}/`;

export type StoredReportArtifactPdf = {
  storageUrl: string;
  sha256: string;
  storageProvider: "local";
  objectName: string;
  referenceFormat: "local:report-artifacts/<user-id>/<uuid>-<sha256-prefix>-<filename>";
};

export type ReportArtifactStorageStatus = "available" | "missing" | "unavailable";

export type ReportArtifactStorageAvailability = {
  status: ReportArtifactStorageStatus;
  objectName: string | null;
  failureReason: string | null;
};

function safeFileName(fileName: string | null | undefined): string {
  const baseName = path.basename((fileName ?? "credit-report.pdf").replace(/\\/g, "/"));
  const cleaned = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "credit-report.pdf";
}

function buildObjectName(input: {
  userId: number;
  fileName: string | null | undefined;
  sha256: string;
}): string {
  const userSegment = Number.isFinite(input.userId) && input.userId > 0
    ? String(Math.trunc(input.userId))
    : "unknown-user";
  const name = safeFileName(input.fileName);
  return `${REPORT_ARTIFACT_STORAGE_OBJECT_PREFIX}/${userSegment}/${randomUUID()}-${input.sha256.slice(0, 16)}-${name}`;
}

export function isReportArtifactStorageReference(storageUrl: string | null | undefined): boolean {
  return typeof storageUrl === "string" && storageUrl.startsWith(REPORT_ARTIFACT_LOCAL_STORAGE_PREFIX);
}

export function isSupportedStoredFileReference(storageUrl: string | null | undefined): boolean {
  if (typeof storageUrl !== "string") return false;
  return storageUrl.startsWith("local:");
}

export async function getReportArtifactStorageAvailability(
  storageUrl: string | null | undefined
): Promise<ReportArtifactStorageAvailability> {
  if (!storageUrl) {
    return {
      status: "missing",
      objectName: null,
      failureReason: "missing_storage_reference",
    };
  }

  const availability = await checkStoredFileAvailability(storageUrl);
  if (availability.available) {
    return {
      status: "available",
      objectName: availability.objectName,
      failureReason: null,
    };
  }

  return {
    status: availability.failureReason === "not_found" ? "missing" : "unavailable",
    objectName: availability.objectName,
    failureReason: availability.failureReason,
  };
}

export async function getReportArtifactListStorageAvailability(input: {
  hasStorageReference: boolean | null | undefined;
  storageObjectName: string | null | undefined;
}): Promise<ReportArtifactStorageAvailability> {
  if (!input.hasStorageReference) {
    return {
      status: "missing",
      objectName: null,
      failureReason: "missing_storage_reference",
    };
  }

  if (!input.storageObjectName) {
    return {
      status: "available",
      objectName: null,
      failureReason: null,
    };
  }

  const availability = await checkStoredObjectAvailability(input.storageObjectName);
  if (availability.available) {
    return {
      status: "available",
      objectName: availability.objectName,
      failureReason: null,
    };
  }

  return {
    status: availability.failureReason === "not_found" ? "missing" : "unavailable",
    objectName: availability.objectName,
    failureReason: availability.failureReason,
  };
}

export function getReportArtifactStorageFailureContext(
  storageUrl: string | null | undefined,
  error: unknown
): ReportArtifactStorageAvailability {
  const failureReason = classifyStorageFailureReason(error);
  return {
    status: failureReason === "not_found" ? "missing" : "unavailable",
    objectName: getStoredFileObjectName(storageUrl),
    failureReason,
  };
}

function isPdfBase64Payload(value: string): boolean {
  try {
    return base64PayloadToBuffer(value).subarray(0, 4).toString("utf8") === "%PDF";
  } catch {
    return false;
  }
}

export async function storeReportArtifactPdf(input: {
  bytesBase64: string;
  userId: number;
  fileName: string;
  mimeType: string;
  sha256?: string | null;
}): Promise<StoredReportArtifactPdf> {
  const sha256 = input.sha256 || sha256HexOfBase64Payload(input.bytesBase64);
  const objectName = buildObjectName({
    userId: input.userId,
    fileName: input.fileName,
    sha256,
  });
  const storageUrl = await uploadFile(input.bytesBase64, objectName, input.mimeType);
  return {
    storageUrl,
    sha256,
    storageProvider: "local",
    objectName,
    referenceFormat: "local:report-artifacts/<user-id>/<uuid>-<sha256-prefix>-<filename>",
  };
}

export async function resolveReportArtifactPdfBase64(
  storageUrl: string | null | undefined
): Promise<string | null> {
  if (!storageUrl) return null;
  if (isSupportedStoredFileReference(storageUrl)) {
    const bytes = await readStoredFile(storageUrl);
    return bytes.toString("base64");
  }
  return storageUrl;
}

export async function normalizeReportArtifactStorageUrlForWrite(input: {
  storageUrl: string | null | undefined;
  userId: number;
  fileName?: string | null;
  mimeType?: string | null;
  sha256?: string | null;
}): Promise<string | null | undefined> {
  if (input.storageUrl == null) return input.storageUrl;
  const trimmed = input.storageUrl.trim();
  if (!trimmed) return input.storageUrl;
  if (isSupportedStoredFileReference(trimmed)) return trimmed;
  if (!isPdfBase64Payload(trimmed)) return input.storageUrl;

  const stored = await storeReportArtifactPdf({
    bytesBase64: cleanBase64Payload(trimmed),
    userId: input.userId,
    fileName: input.fileName || "credit-report.pdf",
    mimeType: input.mimeType || "application/pdf",
    sha256: input.sha256,
  });
  return stored.storageUrl;
}

export function buildReportArtifactStorageMetadata(stored: StoredReportArtifactPdf): Record<string, unknown> {
  return {
    rawPdfStorage: {
      provider: stored.storageProvider,
      referenceFormat: stored.referenceFormat,
      storageReferencePrefix: REPORT_ARTIFACT_LOCAL_STORAGE_PREFIX,
      inlineBase64StoredInDatabase: false,
      signedUrlExposed: false,
    },
  };
}
