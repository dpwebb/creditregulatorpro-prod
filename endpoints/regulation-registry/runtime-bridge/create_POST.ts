import { schema, type OutputType } from "./create_POST.schema";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { createRuntimeBridgeMappingDraft } from "../../../helpers/regulationRuntimeBridgeMappingService";
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
    const mapping = await createRuntimeBridgeMappingDraft({
      bridgeMode: input.bridgeMode!,
      deterministicRuleId: input.deterministicRuleId ?? null,
      violationCategory: input.violationCategory ?? null,
      staticReferenceId: input.staticReferenceId ?? null,
      dbRegulationId: input.dbRegulationId!,
      dbMappingId: input.dbMappingId ?? null,
      referenceClass: input.referenceClass!,
      consumerWordingMode: input.consumerWordingMode!,
      rollbackStaticReferenceId: input.rollbackStaticReferenceId ?? null,
      activationReason: input.activationReason ?? null,
      testManifest: input.testManifest,
      sourceVersion: input.sourceVersion ?? null,
      staticSnapshotHash: input.staticSnapshotHash ?? null,
      dbSnapshotHash: input.dbSnapshotHash ?? null,
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
