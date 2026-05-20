import { schema, type OutputType } from "./ingest-queue_GET.schema";

import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  IngestProcessingQueueError,
  listIngestProcessingJobsForRemediation,
} from "../../helpers/ingestProcessingQueueService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams.entries()));
    const result = await listIngestProcessingJobsForRemediation({
      jobId: input.jobId ?? null,
      status: input.status ?? null,
      limit: input.limit ?? 25,
      offset: input.offset ?? 0,
      includeEvents: input.includeEvents === true,
    });

    return new Response(JSON.stringify(result satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof IngestProcessingQueueError) {
      return handleEndpointError(new BusinessRuleError(error.message, error.code === "JOB_NOT_FOUND" ? 404 : 400));
    }
    return handleEndpointError(error);
  }
}
