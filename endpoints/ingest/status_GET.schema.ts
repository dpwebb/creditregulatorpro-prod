import { z } from "zod";
import type {
  IngestUploadNextAction,
  IngestUploadQueueStatus,
  IngestUploadStatus,
} from "../../helpers/ingestUploadStatusPresenter";
import type { ReportFindingDiagnosticSummary } from "../../helpers/reportFindingDiagnostics";

export const schema = z.object({
  artifactId: z.coerce.number().int().positive(),
});

export type InputType = z.infer<typeof schema>;

export type OutputType = {
  ok: boolean;
  artifactId: number;
  jobId: number | null;
  status: IngestUploadStatus;
  queueStatus: IngestUploadQueueStatus | null;
  processingStatus: string;
  nextAction: IngestUploadNextAction;
  userMessage: string;
  diagnosticCode: string;
  workerRequired: boolean;
  canLeavePage: boolean;
  canCheckStatus: boolean;
  retryAt: string | null;
  checkedAt: string;
  diagnosticSummary?: ReportFindingDiagnosticSummary;
};

export const getIngestProcessingStatus = async (
  input: InputType,
  init?: RequestInit,
): Promise<OutputType> => {
  const validatedInput = schema.parse(input);
  const params = new URLSearchParams({ artifactId: String(validatedInput.artifactId) });
  const result = await fetch(`/_api/ingest/status?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await result.text();
  if (!result.ok) {
    const errorObject = text ? JSON.parse(text) : { error: `Request failed with status ${result.status}` };
    throw new Error(errorObject.error);
  }

  return JSON.parse(text) as OutputType;
};
