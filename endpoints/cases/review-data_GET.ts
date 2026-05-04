import { schema, OutputType } from "./review-data_GET.schema";
import { getEffectiveExtraction } from "../../helpers/passAEditLogManager";
import { requirePassA } from "../../helpers/passAGating";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { requireReportArtifactAccess } from "../../helpers/accessControl";


export async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    const validatedInput = schema.parse(queryParams);
    const artifactId = validatedInput.artifactId;
    const { user } = await getServerUserSession(request);
    await requireReportArtifactAccess(user, artifactId);

    // 1. Ensure Pass A is completed
    const gating = await requirePassA(artifactId);
    if (gating.success === false) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: gating.error.message 
        }), 
        { status: 409 }
      );
    }

    // 2. Get effective extraction data
    // This returns { draftExtraction, effectiveView, editLog, isFullExtraction }
    const result = await getEffectiveExtraction(artifactId);

    return new Response(
      JSON.stringify({
        ok: true,
        artifactId,
        effectiveView: result.effectiveView,
        draftExtraction: result.draftExtraction,
        editLog: result.editLog,
        isFullExtraction: result.isFullExtraction
      } satisfies OutputType),
      { status: 200 }
    );

  } catch (error) {
    console.error("Error fetching review data:", error);
    return handleEndpointError(error);
  }
}
