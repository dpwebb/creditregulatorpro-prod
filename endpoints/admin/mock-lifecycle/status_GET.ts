import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { getMockLifecycleJob } from "./jobRunner";
import { schema, OutputType } from "./status_GET.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const input = schema.parse(params);

    const job = await getMockLifecycleJob(input.jobId);
    if (!job) {
      throw new BusinessRuleError(`Lifecycle run not found: ${input.jobId}`, 404);
    }

    return new Response(JSON.stringify({ job } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}

