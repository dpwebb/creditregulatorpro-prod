import { schema, OutputType } from "./patch_POST.schema";
import { storeEdits, getEffectiveExtraction, PatchOperation } from "../../helpers/passAEditLogManager";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { requireReportArtifactAccess } from "../../helpers/accessControl";


export async function handle(request: Request) {
  try {
        // Parse input

    const body = await request.json();
    const validatedInput = schema.parse(body);

    const artifactId = validatedInput.artifactId;
    const { user } = await getServerUserSession(request);
    await requireReportArtifactAccess(user, artifactId);

    // Convert schema patches to PatchOperation type expected by manager
    const patches: PatchOperation[] = validatedInput.patches.map(p => ({
      path: p.path,
      op: p.op,
      value: p.value,
      reason: p.reason,
      source: {
        type: p.source.type,
        timestamp: p.source.timestamp
      }
    }));

    // 1. Store edits
    await storeEdits(artifactId, patches);

    // 2. Get updated effective view
    const result = await getEffectiveExtraction(artifactId);

    // 3. Return response
    return new Response(
      JSON.stringify({
        ok: true,
        artifactId,
        effectiveView: result.effectiveView,
        editLog: result.editLog
      } satisfies OutputType),
      { status: 200 }
    );

  } catch (error) {
    console.error("Error patching Pass-A extraction:", error);
    return handleEndpointError(error);
  }
}
