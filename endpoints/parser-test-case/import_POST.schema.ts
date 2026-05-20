import { z } from "zod";

import {
  addBase64UploadValidationIssues,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  PARSER_TEST_CASE_IMPORT_MAX_FILES,
  PARSER_TEST_CASE_UPLOAD_MAX_BYTES,
  uploadBase64PayloadSchema,
} from "../../helpers/uploadPayloadValidation";

// Reusing the structure from export, but defining it here for schema validation
const importedTestCaseSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    pdfBase64: uploadBase64PayloadSchema(PARSER_TEST_CASE_UPLOAD_MAX_BYTES, "Parser test PDF"),
    expectedConsumerInfo: z.any().nullable().optional(),
    expectedTradelines: z.any().nullable().optional(),
    rawExtractedText: z.string().nullable().optional(),
    bureau: z.string().nullable().optional(),
    parserMode: z.string().nullable().optional(),
    allowAiFallback: z.boolean().nullable().optional(),
    stageVersion: z.string().nullable().optional(),
    extractionSource: z.string().nullable().optional(),
    parserContext: z.any().nullable().optional(),
    adminReviewStatus: z.string().nullable().optional(),
    approvedConsumerInfo: z.any().nullable().optional(),
    approvedTradelines: z.any().nullable().optional(),
    adjudicationDecisions: z.any().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    addBase64UploadValidationIssues(
      { pdfBase64: data.pdfBase64, mimeType: "application/pdf" },
      ctx,
      {
        base64Field: "pdfBase64",
        mimeTypeField: "mimeType",
        maxBytes: PARSER_TEST_CASE_UPLOAD_MAX_BYTES,
        allowedMimeTypes: CREDIT_REPORT_UPLOAD_MIME_TYPES,
        fileLabel: "Parser test PDF",
      }
    );
  });

export const schema = z.object({
  testCases: z
    .array(importedTestCaseSchema)
    .max(
      PARSER_TEST_CASE_IMPORT_MAX_FILES,
      `Parser test import supports at most ${PARSER_TEST_CASE_IMPORT_MAX_FILES} files per request`
    ),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  importedCount: number;
};

export const importParserTestCases = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/import`, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!result.ok) {
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }
  return JSON.parse(await result.text());
};
