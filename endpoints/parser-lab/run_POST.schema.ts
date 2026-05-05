import { z } from "zod";

export const schema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().default("application/pdf"),
  bytesBase64: z.string().min(1),
  allowAiFallback: z.boolean().optional(),
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
  };
  provenance: Record<string, unknown>;
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
    const errorObject = JSON.parse(await result.text());
    throw new Error(errorObject.error);
  }

  return JSON.parse(await result.text());
};
