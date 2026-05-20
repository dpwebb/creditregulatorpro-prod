import { z } from "zod";

import { Json } from "../../helpers/schema";
import {
  addBase64UploadValidationIssues,
  CREDIT_REPORT_UPLOAD_MIME_TYPES,
  PARSER_TEST_CASE_UPLOAD_MAX_BYTES,
  uploadBase64PayloadSchema,
  uploadFileNameSchema,
} from "../../helpers/uploadPayloadValidation";

const SOURCE_FILE_NAME_SCHEMA = uploadFileNameSchema("Source file name");

export const schema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    pdfBase64: uploadBase64PayloadSchema(PARSER_TEST_CASE_UPLOAD_MAX_BYTES, "Parser test PDF"),
    expectedConsumerInfo: z.any().optional(),
    expectedTradelines: z.any().optional(),
    rawExtractedText: z.string().nullable().optional(),
    bureau: z.string().nullable().optional(),
    parserMode: z.string().nullable().optional(),
    allowAiFallback: z.boolean().nullable().optional(),
    stageVersion: z.string().nullable().optional(),
    extractionSource: z.string().nullable().optional(),
    parserContext: z.any().optional(),
    materializeForViolationCorrections: z.boolean().optional(),
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

    const parserContext =
      data.parserContext && typeof data.parserContext === "object" && !Array.isArray(data.parserContext)
        ? (data.parserContext as Record<string, unknown>)
        : null;
    const sourceFileName = parserContext?.sourceFileName;
    if (sourceFileName !== undefined) {
      const result = SOURCE_FILE_NAME_SCHEMA.safeParse(sourceFileName);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["parserContext", "sourceFileName"],
          message: result.error.errors[0]?.message ?? "Source file name is invalid",
        });
      }
    }
  });

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  testCase: {
    id: number;
    name: string;
    description: string | null;
    expectedConsumerInfo: Json | null;
    expectedTradelines: Json | null;
    rawExtractedText: string | null;
    bureau: string | null;
    parserMode: string | null;
    allowAiFallback: boolean | null;
    stageVersion: string | null;
    extractionSource: string | null;
    parserContext: Json | null;
    adminReviewStatus: string;
    materializedArtifactId?: number | null;
  };
};

export const createParserTestCase = async (
  body: InputType,
  init?: RequestInit
): Promise<OutputType> => {
  const result = await fetch(`/_api/parser-test-case/create`, {
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
