import { schema, type OutputType } from "./update-status_POST.schema";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { updateRuntimeBridgeMappingStatus } from "../../../helpers/regulationRuntimeBridgeMappingService";
import { isAdmin } from "../../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const input = schema.parse(JSON.parse(await request.text()));
    const mapping = await updateRuntimeBridgeMappingStatus({
      mappingId: input.mappingId,
      activationStatus: input.activationStatus,
      activationReason: input.activationReason ?? null,
      rollbackStaticReferenceId: input.rollbackStaticReferenceId ?? null,
      testManifest: input.testManifest,
      adminUserId: user.id,
      request,
    });

    return new Response(JSON.stringify({ mapping } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
