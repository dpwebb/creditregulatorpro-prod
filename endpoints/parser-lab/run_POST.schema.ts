import { z } from "zod";

import {
  addBase64UploadValidationIssues,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  PARSER_LAB_UPLOAD_MAX_BYTES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
  uploadMimeTypeSchema,
} from "../../helpers/uploadPayloadValidation";

export const schema = z
  .object({
    fileName: uploadFileNameSchema("File name"),
    mimeType: uploadMimeTypeSchema(
      CREDIT_REPORT_UPLOAD_MIME_TYPES,
      "Unsupported file type. Please upload a PDF."
    ).default("application/pdf"),
    bytesBase64: uploadBase64PayloadSchema(PARSER_LAB_UPLOAD_MAX_BYTES, "Parser lab PDF"),
    allowAiFallback: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    addBase64UploadValidationIssues(data, ctx, {
      base64Field: "bytesBase64",
      mimeTypeField: "mimeType",
      maxBytes: PARSER_LAB_UPLOAD_MAX_BYTES,
      allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
      fileLabel: "Parser lab PDF",
    });
  });

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  stageVersion: string;
  sideEffects: "none";
  fileName: string;
  bureauName: string | null;
  extractionSource: string;
  quality: {
    confidenceScore: number;
    requiresManualReview: boolean;
    expectedAccountMarkers: number;
    parsedTradelineCount: number;
    issues: Array<{
      severity: string;
      code: string;
      message: string;
    }>;
    fieldCompleteness: {
      averageScore: number;
      lowCompletenessTradelines: number;
      missingCoreDates: number;
      missingReportedDates: number;
      missingOpenedDates: number;
    };
  };
  retention: {
    originalDocumentSha256: string;
    canonicalResultSha256: string;
    replayHash: string;
    rawTextCharacters: number;
    rawHtmlCharacters: number;
    tradelinesWithSourceText: number;
    sourceTextCoveragePercent: number;
    criticalFieldCompletenessPercent: number;
    reviewQueueCount: number;
    blockers: string[];
  };
  counts: {
    tradelines: number;
    inquiries: number;
    publicRecords: number;
    employments: number;
    scores: number;
    consumerStatements: number;
  };
  reviewQueue: Array<{
    kind: "report" | "tradeline";
    index: number | null;
    creditorName: string | null;
    accountNumber: string | null;
    reasons: string[];
    sourceTextPreview: string | null;
  }>;
  parsed: Record<string, unknown>;
  audit: {
    parsedResult: Record<string, unknown>;
    mappedResult: Record<string, unknown>;
    fieldReconciliation: Record<string, unknown>;
    deterministicPipeline: Record<string, unknown>;
  };
  provenance: Record<string, unknown>;
  rawExtractedText: string;
  rawTextPreview: string;
};

export const runParserLabStage = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-lab/run`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!result.ok) {
    const errorObject = JSON.parse(await result.text()) as {
      error?: unknown;
      message?: unknown;
    };
    const message =
      typeof errorObject.message === "string" && errorObject.message.trim()
        ? errorObject.message
        : typeof errorObject.error === "string" && errorObject.error.trim()
          ? errorObject.error
          : "Parser lab run failed";

    throw new Error(message);
  }

  return JSON.parse(await result.text());
};
