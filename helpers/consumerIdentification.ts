import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import jpeg from "jpeg-js";
import { sql } from "kysely";
import { PNG } from "pngjs";

import { db } from "./db";
import { BusinessRuleError } from "./endpointErrorHandler";
import { deleteStoredFile, readStoredFile, uploadFile } from "./gcsStorage";
import {
  CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
  CONSUMER_IDENTIFICATION_UPLOAD_MIME_TYPES,
  cleanUploadBase64Payload,
  normalizeUploadMimeType,
  validateBase64UploadPayload,
} from "./uploadPayloadValidation";

const ACCEPTED_ID_FILE_TYPES: ReadonlySet<string> = new Set(CONSUMER_IDENTIFICATION_UPLOAD_MIME_TYPES);

let ensurePromise: Promise<void> | null = null;

export type ConsumerIdentificationMetadata = {
  id: number;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  updatedAt: string;
  fileUrl: string;
};

export type ConsumerIdentificationUploadInput = {
  userId: number;
  fileName: string;
  fileType: string;
  fileDataBase64: string;
};

type IdentificationRecord = {
  id: number;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  storageUrl: string;
  uploadedAt: Date | string;
  updatedAt: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMetadata(row: IdentificationRecord): ConsumerIdentificationMetadata {
  return {
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSizeBytes: row.fileSizeBytes,
    uploadedAt: toIsoString(row.uploadedAt),
    updatedAt: toIsoString(row.updatedAt),
    fileUrl: "/_api/user/identification/file",
  };
}

function decodeBase64File(base64File: string): Buffer {
  const base64Data = cleanUploadBase64Payload(base64File);

  if (!base64Data.trim()) {
    throw new BusinessRuleError("Identification image is empty");
  }

  return Buffer.from(base64Data, "base64");
}

function assertDataUrlMimeMatches(input: ConsumerIdentificationUploadInput): void {
  const match = input.fileDataBase64.match(/^data:([^;]+);base64,/i);
  if (match && match[1].toLowerCase() !== input.fileType.toLowerCase()) {
    throw new BusinessRuleError("Identification image type does not match the uploaded file");
  }
}

function sanitizeFileName(fileName: string): string {
  const baseName = path.basename(fileName).replace(/[^A-Za-z0-9._-]/g, "_");
  return baseName || "identification.png";
}

function validateIdentificationUpload(input: ConsumerIdentificationUploadInput) {
  const fileType = normalizeUploadMimeType(input.fileType);
  if (!ACCEPTED_ID_FILE_TYPES.has(fileType)) {
    throw new BusinessRuleError("Upload a PNG or JPEG image of your identification");
  }

  assertDataUrlMimeMatches(input);
  const payloadValidation = validateBase64UploadPayload(
    input.fileDataBase64,
    CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES,
    "Identification image"
  );
  if (payloadValidation.ok === false) {
    throw new BusinessRuleError(payloadValidation.message);
  }

  const bytes = decodeBase64File(input.fileDataBase64);
  assertRenderableConsumerIdentificationImage(fileType, bytes);

  return {
    fileType,
    fileSizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    safeFileName: sanitizeFileName(input.fileName),
  };
}

export function assertRenderableConsumerIdentificationImage(fileType: string, bytes: Buffer): void {
  try {
    if (fileType === "image/png") {
      PNG.sync.read(bytes);
      return;
    }

    if (fileType === "image/jpeg") {
      jpeg.decode(bytes, { useTArray: true });
      return;
    }
  } catch {
    throw new BusinessRuleError("Identification image must be a readable PNG or JPEG file");
  }

  throw new BusinessRuleError("Upload a PNG or JPEG image of your identification");
}

export function ensureConsumerIdentificationSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await sql`
        create table if not exists public.consumer_identification_document (
          id bigserial primary key,
          user_id bigint not null unique references public.users(id) on delete cascade,
          file_name text not null,
          file_type text not null,
          file_size_bytes integer not null,
          storage_url text not null,
          sha256 text not null,
          region text not null default 'CA',
          uploaded_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `.execute(db);

      await sql`
        create index if not exists idx_consumer_identification_document_user_id
          on public.consumer_identification_document(user_id)
      `.execute(db);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}

export async function getConsumerIdentificationMetadata(
  userId: number
): Promise<ConsumerIdentificationMetadata | null> {
  await ensureConsumerIdentificationSchema();

  const row = await db
    .selectFrom("consumerIdentificationDocument")
    .select([
      "id",
      "fileName",
      "fileType",
      "fileSizeBytes",
      "storageUrl",
      "uploadedAt",
      "updatedAt",
    ])
    .where("userId", "=", userId)
    .executeTakeFirst();

  return row ? toMetadata(row) : null;
}

export async function hasConsumerIdentification(userId: number): Promise<boolean> {
  await ensureConsumerIdentificationSchema();

  const row = await db
    .selectFrom("consumerIdentificationDocument")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst();

  return Boolean(row);
}

export async function saveConsumerIdentificationDocument(
  input: ConsumerIdentificationUploadInput
): Promise<ConsumerIdentificationMetadata> {
  const validated = validateIdentificationUpload(input);
  await ensureConsumerIdentificationSchema();
  const timestamp = Date.now();
  const objectName = `identification/${input.userId}/${timestamp}-${randomUUID()}-${validated.safeFileName}`;
  const storageUrl = await uploadFile(input.fileDataBase64, objectName, validated.fileType);
  const now = new Date();

  let previousStorageUrl: string | null = null;

  const saved = await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("consumerIdentificationDocument")
      .select(["id", "storageUrl"])
      .where("userId", "=", input.userId)
      .executeTakeFirst();

    previousStorageUrl = existing?.storageUrl ?? null;

    if (existing) {
      return trx
        .updateTable("consumerIdentificationDocument")
        .set({
          fileName: validated.safeFileName,
          fileType: validated.fileType,
          fileSizeBytes: validated.fileSizeBytes,
          storageUrl,
          sha256: validated.sha256,
          updatedAt: now,
        })
        .where("id", "=", existing.id)
        .returning([
          "id",
          "fileName",
          "fileType",
          "fileSizeBytes",
          "storageUrl",
          "uploadedAt",
          "updatedAt",
        ])
        .executeTakeFirstOrThrow();
    }

    return trx
      .insertInto("consumerIdentificationDocument")
      .values({
        userId: input.userId,
        fileName: validated.safeFileName,
        fileType: validated.fileType,
        fileSizeBytes: validated.fileSizeBytes,
        storageUrl,
        sha256: validated.sha256,
        uploadedAt: now,
        updatedAt: now,
        region: "CA",
      })
      .returning([
        "id",
        "fileName",
        "fileType",
        "fileSizeBytes",
        "storageUrl",
        "uploadedAt",
        "updatedAt",
      ])
      .executeTakeFirstOrThrow();
  });

  if (previousStorageUrl && previousStorageUrl !== storageUrl) {
    await deleteStoredFile(previousStorageUrl).catch((error) => {
      console.warn("[consumer-identification] Failed to delete replaced ID file", error);
    });
  }

  return toMetadata(saved);
}

export async function deleteConsumerIdentificationDocument(userId: number): Promise<boolean> {
  await ensureConsumerIdentificationSchema();

  const existing = await db
    .selectFrom("consumerIdentificationDocument")
    .select(["id", "storageUrl"])
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!existing) return false;

  await db
    .deleteFrom("consumerIdentificationDocument")
    .where("id", "=", existing.id)
    .execute();

  await deleteStoredFile(existing.storageUrl).catch((error) => {
    console.warn("[consumer-identification] Failed to delete ID file", error);
  });

  return true;
}

export async function readConsumerIdentificationFile(userId: number): Promise<{
  fileName: string;
  fileType: string;
  bytes: Buffer;
} | null> {
  await ensureConsumerIdentificationSchema();

  const row = await db
    .selectFrom("consumerIdentificationDocument")
    .select(["fileName", "fileType", "storageUrl"])
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    fileName: row.fileName,
    fileType: row.fileType,
    bytes: await readStoredFile(row.storageUrl),
  };
}

export async function getConsumerIdentificationPdfAttachment(userId: number): Promise<{
  fileName: string;
  fileType: string;
  dataUrl: string;
} | null> {
  const file = await readConsumerIdentificationFile(userId);
  if (!file) return null;
  assertRenderableConsumerIdentificationImage(file.fileType, file.bytes);

  return {
    fileName: file.fileName,
    fileType: file.fileType,
    dataUrl: `data:${file.fileType};base64,${file.bytes.toString("base64")}`,
  };
}

export function attachConsumerIdentificationToLetterContent(
  letterContent: {
    supportingDocumentation?: string;
    consumerIdentificationImage?: string;
    consumerIdentificationFileName?: string;
  },
  identification: { fileName: string; dataUrl: string }
): void {
  const idNote = "A consumer identification image is attached to this package for identity verification.";
  letterContent.supportingDocumentation = letterContent.supportingDocumentation
    ? `${letterContent.supportingDocumentation}\n\n${idNote}`
    : idNote;
  letterContent.consumerIdentificationImage = identification.dataUrl;
  letterContent.consumerIdentificationFileName = identification.fileName;
}
