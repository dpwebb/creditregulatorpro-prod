import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { schema, OutputType } from "./run_POST.schema";
import { resolveAndValidatePdfPath, startMockLifecycleJob } from "./jobRunner";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const raw = JSON.parse(await request.text());
    const input = schema.parse(raw);

    const initialReportPath = await resolveAndValidatePdfPath(
      input.initialReportPath,
      "Initial report"
    );
    const followupInputPath = input.followupReportPath || input.initialReportPath;
    const followupReportPath = await resolveAndValidatePdfPath(
      followupInputPath,
      "Follow-up report"
    );

    const job = await startMockLifecycleJob({
      runConfig: {
        initialReportPath,
        followupReportPath,
        simulateDays: input.simulateDays,
        packetCount: input.packetCount,
        strict: input.strict,
        useDbAssist: input.useDbAssist,
        baseUrl: input.baseUrl,
        origin: input.origin,
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        legalNameSignature: input.legalNameSignature,
      },
      initiatedByUserId: user.id,
      initiatedByEmail: user.email,
    });

    return new Response(JSON.stringify({ job } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}

