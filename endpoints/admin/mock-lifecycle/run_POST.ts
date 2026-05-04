import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { schema, OutputType } from "./run_POST.schema";
import {
  materializeUploadedFixture,
  resolveAndValidatePdfPath,
  startMockLifecycleJob,
} from "./jobRunner";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const raw = JSON.parse(await request.text());
    const input = schema.parse(raw);
    const requestUrl = new URL(request.url);
    const isLocalHost =
      requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
    const inferredBaseUrl = isLocalHost
      ? "http://localhost:3333"
      : `${requestUrl.protocol}//${requestUrl.host}`;
    const inferredOrigin = isLocalHost
      ? "http://localhost:5175"
      : `${requestUrl.protocol}//${requestUrl.host}`;

    const initialReportPath = input.initialReportUpload
      ? await materializeUploadedFixture(
          {
            fileName: input.initialReportUpload.fileName!,
            mimeType: input.initialReportUpload.mimeType,
            bytesBase64: input.initialReportUpload.bytesBase64!,
          },
          "initial"
        )
      : await resolveAndValidatePdfPath(input.initialReportPath!, "Initial report");

    let followupReportPath: string;
    if (input.followupReportUpload) {
      followupReportPath = await materializeUploadedFixture(
        {
          fileName: input.followupReportUpload.fileName!,
          mimeType: input.followupReportUpload.mimeType,
          bytesBase64: input.followupReportUpload.bytesBase64!,
        },
        "followup"
      );
    } else if (input.followupReportPath) {
      followupReportPath = await resolveAndValidatePdfPath(
        input.followupReportPath,
        "Follow-up report"
      );
    } else {
      followupReportPath = initialReportPath;
    }

    const job = await startMockLifecycleJob({
      runConfig: {
        initialReportPath,
        followupReportPath,
        simulateDays: input.simulateDays,
        packetCount: input.packetCount,
        strict: input.strict,
        useDbAssist: input.useDbAssist,
        baseUrl: input.baseUrl ?? inferredBaseUrl,
        origin: input.origin ?? inferredOrigin,
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
