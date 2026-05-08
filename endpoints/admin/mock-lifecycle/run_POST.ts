import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { schema, OutputType } from "./run_POST.schema";
import {
  materializeUploadedFixture,
  resolveAndValidatePdfPath,
  startMockLifecycleJob,
} from "./jobRunner";

function firstForwardedHeader(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first || null;
}

function inferLifecycleUrls(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost =
    firstForwardedHeader(request.headers.get("x-forwarded-host")) ||
    firstForwardedHeader(request.headers.get("host")) ||
    requestUrl.host;
  const forwardedProto = firstForwardedHeader(request.headers.get("x-forwarded-proto"));
  const isLocalHost =
    requestUrl.hostname === "localhost" ||
    requestUrl.hostname === "127.0.0.1" ||
    forwardedHost.startsWith("localhost") ||
    forwardedHost.startsWith("127.0.0.1");

  if (isLocalHost) {
    return {
      baseUrl: "http://localhost:3333",
      origin: "http://localhost:5175",
    };
  }

  const inferredProtocol =
    forwardedProto ?? (forwardedHost.includes("staging.creditregulatorpro.com") ? "https" : requestUrl.protocol);
  const protocol = inferredProtocol.replace(/:$/, "");
  const origin = `${protocol}://${forwardedHost}`;
  return { baseUrl: origin, origin };
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required", 403);
    }

    const raw = JSON.parse(await request.text());
    const input = schema.parse(raw);
    const inferredUrls = inferLifecycleUrls(request);

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
        baseUrl: input.baseUrl ?? inferredUrls.baseUrl,
        origin: input.origin ?? inferredUrls.origin,
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        legalNameSignature: input.legalNameSignature,
      },
      initiatedByUserId: user.id,
      initiatedByEmail: user.email,
      adminSessionCookie: request.headers.get("cookie"),
    });

    return new Response(JSON.stringify({ job } satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
