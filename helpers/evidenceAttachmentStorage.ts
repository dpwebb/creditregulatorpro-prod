import path from "node:path";
import { randomUUID } from "node:crypto";

import { readStoredFile, uploadFile } from "./gcsStorage";
import { cleanBase64Payload, sha256HexOfBase64Payload } from "./reportBinaryUtils";
import { isSupportedStoredFileReference } from "./reportArtifactStorage";

export const EVIDENCE_ATTACHMENT_STORAGE_OBJECT_PREFIX = "evidence";
export const BUREAU_COMMUNICATION_STORAGE_OBJECT_PREFIX = `${EVIDENCE_ATTACHMENT_STORAGE_OBJECT_PREFIX}/bureau-communications`;
export const BUREAU_COMMUNICATION_LOCAL_STORAGE_PREFIX = `local:${BUREAU_COMMUNICATION_STORAGE_OBJECT_PREFIX}/`;

export type StoredBureauCommunicationAttachment = {
  storageUrl: string;
  sha256: string;
  storageProvider: "local";
  objectName: string;
  referenceFormat: "local:evidence/bureau-communications/<user-id>/<uuid>-<sha256-prefix>-<filename>";
};

function safeFileName(fileName: string | null | undefined): string {
  const baseName = path.basename((fileName ?? "bureau-communication.pdf").replace(/\\/g, "/"));
  const cleaned = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "bureau-communication.pdf";
}

function buildBureauCommunicationObjectName(input: {
  userId: number;
  fileName: string | null | undefined;
  sha256: string;
}): string {
  const userSegment = Number.isFinite(input.userId) && input.userId > 0
    ? String(Math.trunc(input.userId))
    : "unknown-user";
  return `${BUREAU_COMMUNICATION_STORAGE_OBJECT_PREFIX}/${userSegment}/${randomUUID()}-${input.sha256.slice(0, 16)}-${safeFileName(input.fileName)}`;
}

export async function storeBureauCommunicationAttachment(input: {
  bytesBase64: string;
  userId: number;
  fileName: string;
  mimeType: string;
  sha256?: string | null;
}): Promise<StoredBureauCommunicationAttachment> {
  const sha256 = input.sha256 || sha256HexOfBase64Payload(input.bytesBase64);
  const objectName = buildBureauCommunicationObjectName({
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
    referenceFormat: "local:evidence/bureau-communications/<user-id>/<uuid>-<sha256-prefix>-<filename>",
  };
}

export async function resolveEvidenceAttachmentBase64(storageUrl: string | null | undefined): Promise<string | null> {
  if (!storageUrl) return null;
  if (isSupportedStoredFileReference(storageUrl)) {
    const bytes = await readStoredFile(storageUrl);
    return bytes.toString("base64");
  }
  return cleanBase64Payload(storageUrl);
}

export function buildBureauCommunicationStorageMetadata(
  stored: StoredBureauCommunicationAttachment
): Record<string, unknown> {
  return {
    bureauCommunicationStorage: {
      provider: stored.storageProvider,
      referenceFormat: stored.referenceFormat,
      storageReferencePrefix: BUREAU_COMMUNICATION_LOCAL_STORAGE_PREFIX,
      inlineBase64StoredInDatabase: false,
      signedUrlExposed: false,
    },
  };
}
