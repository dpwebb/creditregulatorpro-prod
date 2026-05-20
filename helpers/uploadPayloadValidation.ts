import { z } from "zod";

export const AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
export const ANONYMOUS_REPORT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const EVIDENCE_ATTACHMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const BUREAU_COMMUNICATION_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const REPORT_ARTIFACT_UPLOAD_MAX_BYTES = AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES;
export const REVIEW_APPROVE_REPORT_UPLOAD_MAX_BYTES = AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES;
export const CONSUMER_IDENTIFICATION_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const PARSER_LAB_UPLOAD_MAX_BYTES = AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES;
export const PARSER_TEST_CASE_UPLOAD_MAX_BYTES = AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES;
export const PARSER_TEST_CASE_IMPORT_MAX_FILES = 25;
export const PARSER_TEST_CASE_IMPORT_TOTAL_UPLOAD_MAX_BYTES =
  PARSER_TEST_CASE_UPLOAD_MAX_BYTES * PARSER_TEST_CASE_IMPORT_MAX_FILES;
export const ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES = AUTHENTICATED_REPORT_UPLOAD_MAX_BYTES;
export const ADMIN_MOCK_LIFECYCLE_TOTAL_UPLOAD_MAX_BYTES =
  ADMIN_MOCK_LIFECYCLE_UPLOAD_MAX_BYTES * 2;

export const CREDIT_REPORT_UPLOAD_MIME_TYPES = ["application/pdf"] as const;
export const EVIDENCE_UPLOAD_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"] as const;
export const CONSUMER_IDENTIFICATION_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png"] as const;

export const MAX_UPLOAD_FILE_NAME_LENGTH = 180;
export const MAX_UPLOAD_DESCRIPTION_LENGTH = 1000;
export const UPLOAD_REQUEST_BODY_OVERHEAD_BYTES = 8 * 1024;

const MAX_MIME_TYPE_LENGTH = 100;
const DATA_URL_PREFIX_PATTERN = /^data:([^;,]+);base64,/i;
const BASE64_PAYLOAD_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const INVALID_FILE_NAME_PATTERN = /[<>:"/\\|?*\x00-\x1F]/;

type Base64UploadIssueConfig = {
  base64Field: string;
  mimeTypeField: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  fileLabel: string;
};

type Base64PayloadValidationResult =
  | { ok: true; payload: string; decodedByteLength: number }
  | { ok: false; message: string };

export function formatUploadLimit(maxBytes: number): string {
  const mb = maxBytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} MB` : `${maxBytes} bytes`;
}

function maxBase64PayloadLength(maxBytes: number): number {
  return Math.ceil(maxBytes / 3) * 4;
}

export function getUploadRequestBodyMaxBytes(maxDecodedBytes: number): number {
  return maxBase64PayloadLength(maxDecodedBytes) + UPLOAD_REQUEST_BODY_OVERHEAD_BYTES;
}

export function isUploadRequestContentLengthTooLarge(request: Request, maxDecodedBytes: number): boolean {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return false;
  const parsedLength = Number(contentLength);
  return Number.isFinite(parsedLength) && parsedLength > getUploadRequestBodyMaxBytes(maxDecodedBytes);
}

export function isUploadRequestTextTooLarge(text: string, maxDecodedBytes: number): boolean {
  return new TextEncoder().encode(text).byteLength > getUploadRequestBodyMaxBytes(maxDecodedBytes);
}

export function uploadRequestTooLargeResponse(fileLabel: string, maxDecodedBytes: number): Response {
  return new Response(
    JSON.stringify({
      error: `${fileLabel} request body exceeds the ${formatUploadLimit(maxDecodedBytes)} upload limit`,
    }),
    {
      status: 413,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function getPayloadDecodedByteLength(payload: string): number {
  if (payload.length === 0) return 0;
  const paddingCount = (payload.match(/=+$/) ?? [""])[0].length;
  return Math.floor((payload.length * 3) / 4) - paddingCount;
}

export function normalizeUploadMimeType(value: string): string {
  return value.trim().toLowerCase();
}

export function cleanUploadBase64Payload(base64Data: string): string {
  const trimmed = base64Data.trim();
  const dataUrlMatch = trimmed.match(DATA_URL_PREFIX_PATTERN);
  const payload = dataUrlMatch ? trimmed.slice(dataUrlMatch[0].length) : trimmed;
  return payload.replace(/\s+/g, "");
}

export function getBase64DecodedByteLength(base64Data: string): number {
  return getPayloadDecodedByteLength(cleanUploadBase64Payload(base64Data));
}

export function validateBase64UploadPayload(
  base64Data: string,
  maxBytes: number,
  fileLabel: string
): Base64PayloadValidationResult {
  const limitLabel = formatUploadLimit(maxBytes);
  const payload = cleanUploadBase64Payload(base64Data);

  if (payload.length === 0) {
    return { ok: false, message: `${fileLabel} data is required` };
  }

  if (payload.length % 4 === 1 || !BASE64_PAYLOAD_PATTERN.test(payload)) {
    return { ok: false, message: `${fileLabel} data must be valid base64` };
  }

  const decodedByteLength = getPayloadDecodedByteLength(payload);
  if (decodedByteLength > maxBytes) {
    return { ok: false, message: `${fileLabel} exceeds the ${limitLabel} upload limit` };
  }

  return { ok: true, payload, decodedByteLength };
}

export function uploadFileNameSchema(label = "File name") {
  return z
    .string()
    .min(1, `${label} is required`)
    .max(MAX_UPLOAD_FILE_NAME_LENGTH, `${label} must be ${MAX_UPLOAD_FILE_NAME_LENGTH} characters or fewer`)
    .refine((value) => value.trim().length > 0, `${label} is required`)
    .refine((value) => value !== "." && value !== "..", `${label} is invalid`)
    .refine((value) => !INVALID_FILE_NAME_PATTERN.test(value), `${label} contains unsupported characters`);
}

export function uploadMimeTypeSchema(
  allowedMimeTypes: readonly string[],
  message = "Unsupported file type"
) {
  return z
    .string()
    .min(1, "File type is required")
    .max(MAX_MIME_TYPE_LENGTH, `File type must be ${MAX_MIME_TYPE_LENGTH} characters or fewer`)
    .transform(normalizeUploadMimeType)
    .refine((value) => allowedMimeTypes.includes(value), message);
}

export function uploadBase64PayloadSchema(maxBytes: number, label: string) {
  return z
    .string()
    .min(1, `${label} data is required`)
    .max(
      maxBase64PayloadLength(maxBytes) + 128,
      `${label} exceeds the ${formatUploadLimit(maxBytes)} upload limit`
    );
}

export function uploadDescriptionSchema(label = "Description") {
  return z
    .string()
    .max(MAX_UPLOAD_DESCRIPTION_LENGTH, `${label} must be ${MAX_UPLOAD_DESCRIPTION_LENGTH} characters or fewer`);
}

export function addBase64UploadValidationIssues(
  data: Record<string, unknown>,
  ctx: z.RefinementCtx,
  config: Base64UploadIssueConfig
) {
  const base64Data = data[config.base64Field];
  const declaredMimeType = data[config.mimeTypeField];

  if (typeof base64Data !== "string" || typeof declaredMimeType !== "string") {
    return;
  }

  const dataUrlMatch = base64Data.trim().match(DATA_URL_PREFIX_PATTERN);
  const dataUrlMimeType = dataUrlMatch ? normalizeUploadMimeType(dataUrlMatch[1]) : null;
  const mimeType = normalizeUploadMimeType(declaredMimeType);

  if (!config.allowedMimeTypes.includes(mimeType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [config.mimeTypeField],
      message: "Unsupported file type",
    });
  }

  if (dataUrlMimeType && dataUrlMimeType !== mimeType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [config.base64Field],
      message: "File data MIME type must match the declared file type",
    });
  }

  const validation = validateBase64UploadPayload(base64Data, config.maxBytes, config.fileLabel);
  if (validation.ok === false) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [config.base64Field],
      message: validation.message,
    });
  }
}
