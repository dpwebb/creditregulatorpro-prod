import { schema, type OutputType } from "./queue-remediation_POST.schema";

import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import {
  remediateResponseProcessingJob,
  ResponseProcessingQueueError,
} from "../../helpers/responseProcessingQueueService";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Admin privileges required", 403);
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    const remediation = await remediateResponseProcessingJob({
      jobId: input.jobId,
      action: input.action,
      actorUserId: user.id,
      confirmRetry: input.confirmRetry,
      confirmReview: input.confirmReview,
      reviewNote: input.reviewNote ?? null,
    });

    return new Response(JSON.stringify({ remediation } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof ResponseProcessingQueueError) {
      return handleEndpointError(new BusinessRuleError(error.message, error.code === "JOB_NOT_FOUND" ? 404 : 400));
    }
    return handleEndpointError(error);
  }
}
