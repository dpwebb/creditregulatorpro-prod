import { UploadReportInput } from "../../helpers/schemas";
import { handleIngestSubmit } from "../../helpers/ingestReportHandler";
import { resolveUserSession } from "../../helpers/ingestSessionResolver";
import { handleEndpointError, OriginNotAllowedError } from "../../helpers/endpointErrorHandler";
import { validateOrigin } from "../../helpers/domainGuard";


export async function handle(request: Request) {
  const guardResult = await validateOrigin(request);
  if (!guardResult.valid && guardResult.mode === "enforce") {
    throw new OriginNotAllowedError();
  }

  let input;
  try {
    const json = JSON.parse(await request.text());
    input = UploadReportInput.parse(json);
  } catch (error) {
    console.error("Error parsing input:", error);
    return handleEndpointError(error);
  }

  // CRITICAL: Verify session/user BEFORE proceeding
  // This prevents jwtVerify from hanging inside async callbacks
  let resolvedSession;
  try {
    resolvedSession = await resolveUserSession(request, input.region);
  } catch (error) {
    console.error("Error resolving session:", error);
    return handleEndpointError(error);
  }

  // Phase 1: Submit extraction request (quick synchronous response)
  try {
    const submitResult = await handleIngestSubmit(resolvedSession, input, request);

    if (!submitResult.success) {
      const statusCode = submitResult.code === "RATE_LIMITED" ? 429 : 400;
      return new Response(
        JSON.stringify({
          artifactId: submitResult.artifactId ?? null,
          extractionStatus: "failed" as const,
          error: submitResult.error ?? "Submission failed",
        }),
        {
          status: statusCode,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[report_POST] Phase 1 complete. artifactId=${submitResult.artifactId}, extractionStatus=${submitResult.extractionStatus}`
    );

    return new Response(
      JSON.stringify({
        artifactId: submitResult.artifactId!,
        extractionStatus: submitResult.extractionStatus!,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in Phase 1 submission:", error);
    return handleEndpointError(error);
  }
}
