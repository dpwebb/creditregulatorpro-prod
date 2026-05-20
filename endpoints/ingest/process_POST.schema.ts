import { z } from "zod";
import { ParsedTradeline } from "../../helpers/reportParser";
import type { DeterministicNormalizedReport } from "../../helpers/deterministicCreditReportPipeline";
import type { DeterministicReplayValidation } from "../../helpers/deterministicReplayValidator";

export const schema = z.object({
  artifactId: z.number()
});

export type InputType = z.infer<typeof schema>;

export type QueuedProcessingOutputType = {
  ok: boolean;
  queued: boolean;
  artifactId: number;
  storageUrl: string;
  jobId: number;
  queueStatus: "queued" | "running" | "failed" | "dead_lettered" | "canceled" | "succeeded" | string;
  processingStatus: string;
  workerRequired: boolean;
  duplicate: boolean;
  retryAt: string | null;
  errorCode: string | null;
  errorReason: string | null;
  message: string;
};

export type CompletedProcessingOutputType = {
  ok: boolean;
  queued?: false;
  storageUrl: string;
  tradelines: ParsedTradeline[];
  tradelinesCount: number;
  tradelineIds: number[];
  profileFieldsPopulated: string[];
  passAExtraction: {
    status: "completed";
    channelGuess: string | null;
    conflictsCount: number;
    qualityNotesCount: number;
    missingFieldsCount: number;
  };
  fullExtraction?: {
    status: "completed" | "failed";
    accountsCount?: number;
    creditInquiriesCount?: number;
    otherInquiriesCount?: number;
    publicRecordsPresent?: boolean;
    error?: string;
  };
  comprehensiveExtraction?: {
    creditScoresCount: number;
    inquiriesCount: number;
    publicRecordsCount: number;
    consumerStatementsCount: number;
    employmentInfoCount: number;
    paymentHistoriesCount: number;
  };
  consumerInfoComparison?: {
    isMatch: boolean;
    nameMismatch: boolean;
    addressMismatch: boolean;
    extractedInfo: {
      fullName: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      dateOfBirth: Date | null;
      phone: string | null;
    };
    profileInfo: {
      fullName: string | null;
      addressLine1: string | null;
      city: string | null;
      province: string | null;
      postalCode: string | null;
      dateOfBirth: Date | null;
      phone: string | null;
    };
  };
  canonicalOutput?: DeterministicNormalizedReport;
  replayHash?: string;
  replayValidation?: DeterministicReplayValidation;
};

export type OutputType = CompletedProcessingOutputType | QueuedProcessingOutputType;

export function isQueuedProcessingOutput(output: OutputType): output is QueuedProcessingOutputType {
  return typeof (output as QueuedProcessingOutputType).jobId === "number";
}

/**
 * Client function for processing a report with SSE streaming support.
 */
export const postProcess = async (
  body: InputType, 
  onProgress?: (stage: string, percent: number, message?: string) => void,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);
  const response = await fetch(`/_api/ingest/process`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.error) errorMsg = errorData.error;
    } catch {
      // ignore JSON parse error on non-JSON response
    }
    throw new Error(errorMsg);
  }

  const contentType = response.headers.get("content-type");
  
  if (contentType?.includes("text/event-stream")) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    let buffer = "";
    let finalResult: OutputType | null = null;

    while (true) {
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (networkError) {
        console.error("SSE stream network error:", networkError);
        if (finalResult) {
          return finalResult;
        }
        throw new Error(
          "Connection lost during processing. The report may still be processing — please check your artifacts list."
        );
      }
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data.trim() === "") continue;

          let event: {
            type: string;
            stage?: string;
            percent?: number;
            message?: string;
            data?: OutputType;
            error?: string;
            queueStatus?: string;
          } | null = null;
          try {
            event = JSON.parse(data);
          } catch (parseError) {
            console.error("Failed to parse SSE event:", parseError);
          }

          if (event !== null) {
            if (event.type === "progress") {
              onProgress?.(event.stage ?? "", event.percent ?? 0, event.message);
            } else if (event.type === "status") {
              onProgress?.(event.stage ?? event.queueStatus ?? "", event.percent ?? 0, event.message);
            } else if (event.type === "complete") {
              finalResult = event.data ?? null;
            } else if (event.type === "error") {
              throw new Error(event.error ?? "Unknown error");
            }
          }
        }
      }
    }

    if (!finalResult) {
      throw new Error(
        "Processing stream ended without a result. The report may still be processing — please check your artifacts list."
      );
    }

    return finalResult;
  } else {
    // Fallback to regular JSON response
    const result = await response.json();
    return result as OutputType;
  }
};
