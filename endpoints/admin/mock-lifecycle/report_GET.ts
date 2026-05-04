import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { getMockLifecycleReport } from "./jobRunner";
import { schema, OutputType } from "./report_GET.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const input = schema.parse(params);

    const report = await getMockLifecycleReport(input.jobId);
    if (!report) {
      throw new BusinessRuleError(
        `Lifecycle report not found or not ready for job: ${input.jobId}`,
        404
      );
    }

    return new Response(JSON.stringify({ report } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}

