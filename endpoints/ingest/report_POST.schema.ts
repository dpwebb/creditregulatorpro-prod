import { z } from "zod";
import { UploadReportInput } from "../../helpers/schemas";
import { ParsedTradeline } from "../../helpers/reportParser";
import { ParserQualityAssessment } from "../../helpers/parserQuality";
import type { DeterministicNormalizedReport } from "../../helpers/deterministicCreditReportPipeline";
import type { DeterministicReplayValidation } from "../../helpers/deterministicReplayValidator";
import type {
  IngestUploadNextAction,
  IngestUploadStatus,
} from "../../helpers/ingestUploadStatusPresenter";


export const schema = UploadReportInput;

export type InputType = z.infer<typeof schema>;

/**
 * Phase 1 response type: quick submission result with artifact ID and extraction status.
 */
export type Phase1OutputType = {
  artifactId: number;
  extractionStatus: "extracted" | "pending" | "failed";
  error?: string;
};

export type QueuedProcessingOutputType = {
  ok: boolean;
  queued: boolean;
  artifactId: number;
  storageUrl: string;
  jobId: number;
  queueStatus: "queued" | "running" | "failed" | "dead_lettered" | "canceled" | "succeeded" | string;
  processingStatus: string;
  uploadStatus?: IngestUploadStatus;
  nextAction?: IngestUploadNextAction;
  userMessage?: string;
  diagnosticCode?: string;
  workerRequired: boolean;
  duplicate: boolean;
  retryAt: string | null;
  errorCode: string | null;
  errorReason: string | null;
  message: string;
};

/**
 * Final output type returned after worker-backed processing completes.
 */
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
  parserQuality?: ParserQualityAssessment;
  canonicalOutput?: DeterministicNormalizedReport;
  replayHash?: string;
  replayValidation?: DeterministicReplayValidation;
};

export type OutputType = CompletedProcessingOutputType | QueuedProcessingOutputType;

export function isQueuedProcessingOutput(output: OutputType): output is QueuedProcessingOutputType {
  return typeof (output as QueuedProcessingOutputType).jobId === "number";
}

/**
 * Handles Phase 2 SSE stream from /_api/ingest/process.
 * Reads the SSE stream, fires progress callbacks, and returns the final OutputType.
 */
async function handlePhase2SSEStream(
  response: Response,
  onProgress?: (stage: string, percent: number, message?: string) => void
): Promise<OutputType> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("Failed to get response reader for Phase 2 stream");
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
        // Already received a complete event before the connection dropped
        return finalResult;
      }
      throw new Error(
        "Connection lost during processing. The report may still be processing — please check your artifacts list."
      );
    }

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep incomplete line in buffer

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
          jobId?: number;
          queueStatus?: string;
          processingStatus?: string;
          retryAt?: string | null;
          errorCode?: string | null;
          errorReason?: string | null;
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
}

/**
 * Client function for posting a report using the two-phase approach:
 *
 * Phase 1: POST /_api/ingest/report
 *   - Validates input, resolves session, submits to DocStrange
 *   - Returns { artifactId, extractionStatus } quickly
 *
 * Phase 2: POST /_api/ingest/process
 *   - Enqueues or attaches to a durable ingest job
 *   - Returns SSE stream with queued/running/completed/failure status events
 *
 * The function signature is unchanged; callers should handle either a completed result or queued status.
 */
export const postReport = async (
  body: InputType,
  onProgress?: (stage: string, percent: number, message?: string) => void,
  init?: RequestInit
): Promise<OutputType> => {
  const validatedInput = schema.parse(body);

  // ─── Phase 1: Submit ────────────────────────────────────────────────────────
  onProgress?.("submitting", 5, "Submitting report...");

  const phase1Response = await fetch(`/_api/ingest/report`, {
    method: "POST",
    body: JSON.stringify(validatedInput),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!phase1Response.ok) {
    let errorMessage = `Phase 1 failed with status ${phase1Response.status}`;
    try {
      const errorBody = JSON.parse(await phase1Response.text());
      if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      // Ignore parse errors for error response body
    }
    throw new Error(errorMessage);
  }

  const phase1Result = JSON.parse(await phase1Response.text());

  if (phase1Result.extractionStatus === "failed") {
    throw new Error(phase1Result.error ?? "Phase 1 extraction failed. Please try again.");
  }

  onProgress?.("submitted", 10, "Report submitted, starting processing...");

  // ─── Phase 2: Process (SSE) with retry for retryable timeouts ───────────────
  const MAX_PHASE2_ATTEMPTS = 4; // 1 initial + 3 retries (~10 minutes of polling total)
  const RETRY_DELAY_MS = 2000;

  const isRetryableError = (message: string): boolean =>
    message.includes("retryable") || message.includes("EXTRACTION_TIMEOUT");

  let lastPhase2Error: Error | null = null;

  for (let attempt = 1; attempt <= MAX_PHASE2_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const retryMessage = `Phase 2 timed out. Retrying (attempt ${attempt}/${MAX_PHASE2_ATTEMPTS})...`;
      console.log(`[postReport] ${retryMessage}`);
      onProgress?.("retrying_phase2", 10 + attempt * 2, retryMessage);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    const phase2Response = await fetch(`/_api/ingest/process`, {
      method: "POST",
      body: JSON.stringify({ artifactId: phase1Result.artifactId }),
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    if (!phase2Response.ok) {
      let errorMessage = `Phase 2 failed with status ${phase2Response.status}`;
      try {
        const errorBody = JSON.parse(await phase2Response.text());
        if (errorBody.error) {
          errorMessage = errorBody.error;
        }
      } catch {
        // Ignore parse errors for error response body
      }
      throw new Error(errorMessage);
    }

    // Check if response is SSE (text/event-stream) or regular JSON
    const contentType = phase2Response.headers.get("content-type");

    try {
      if (contentType?.includes("text/event-stream")) {
        return await handlePhase2SSEStream(phase2Response, onProgress);
      } else {
        // Fallback to regular JSON response (for backward compatibility)
        const result = JSON.parse(await phase2Response.text());
        return result;
      }
    } catch (phase2Error) {
      const errorMessage = phase2Error instanceof Error ? phase2Error.message : String(phase2Error);
      lastPhase2Error = phase2Error instanceof Error ? phase2Error : new Error(errorMessage);

      if (isRetryableError(errorMessage) && attempt < MAX_PHASE2_ATTEMPTS) {
        console.warn(`[postReport] Phase 2 attempt ${attempt} timed out (retryable). Will retry.`);
        continue;
      }

      // Non-retryable error or exhausted retries — rethrow
      throw lastPhase2Error;
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw lastPhase2Error ?? new Error("Phase 2 failed after all retry attempts.");
};
