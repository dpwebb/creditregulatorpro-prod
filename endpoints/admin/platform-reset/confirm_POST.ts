import { detectResetRuntimeContext, runReset } from "../../../scripts/reset-platform.mjs";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { schema, type OutputType } from "./confirm_POST.schema";
import {
  insertPlatformResetAudit,
  platformResetSafetyRefusalResponse,
  requirePlatformResetAdmin,
  requirePlatformResetRequest,
  resolveAdminResetPreserveEmails,
  toPlatformResetEndpointError,
  type PlatformResetAdminUser,
} from "./shared";

export async function handle(request: Request) {
  let adminUser: PlatformResetAdminUser | null = null;
  let startedAuditLogId: number | null = null;
  let inputMode: string | undefined;

  try {
    requirePlatformResetRequest(request);
    adminUser = await requirePlatformResetAdmin(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    inputMode = input.mode;

    const runtime = detectResetRuntimeContext(process.env);
    if (runtime.environment.kind === "production") {
      return platformResetSafetyRefusalResponse(runtime);
    }
    if (runtime.environment.kind === "unknown") {
      return platformResetSafetyRefusalResponse(runtime);
    }

    startedAuditLogId = await insertPlatformResetAudit({
      request,
      userId: adminUser.id,
      phase: "started",
      status: "SUCCESS",
      mode: input.mode,
      details: {
        environment: runtime.environment,
        database: runtime.database,
        expectedDatabase: input.expectedDatabase,
      },
    });

    const result = await runReset({
      execution: "apply",
      resetScope: input.mode,
      confirm: true,
      confirmEnv: runtime.environment.kind,
      baseUrl: input.baseUrl,
      expectedDatabase: input.expectedDatabase,
      preserveAdminEmails: resolveAdminResetPreserveEmails(adminUser, process.env),
      preserveAuditLogIds: [startedAuditLogId],
    }, process.env);
    const resetResult = result as unknown as OutputType["result"];

    const completedAuditLogId = await insertPlatformResetAudit({
      request,
      userId: adminUser.id,
      phase: "completed",
      status: "SUCCESS",
      mode: input.mode,
      details: {
        totalRowsMatched: resetResult.totalRowsMatched,
        totalUpdatesMatched: resetResult.totalUpdatesMatched,
        totalFilesMatched: resetResult.totalFilesMatched,
        storageNotFoundReferences: resetResult.storage?.references?.notFoundReferences?.length ?? 0,
        validation: resetResult.validation,
      },
    });

    const output: OutputType = {
      success: true,
      result: resetResult,
      auditLogIds: {
        started: startedAuditLogId,
        completed: completedAuditLogId,
      },
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (adminUser && startedAuditLogId !== null) {
      await insertPlatformResetAudit({
        request,
        userId: adminUser.id,
        phase: "failed",
        status: "FAILURE",
        mode: inputMode,
        details: startedAuditLogId ? { startedAuditLogId } : undefined,
        errorMessage: error instanceof Error ? error.message : String(error),
      }).catch((auditError) => {
        console.error("[admin-platform-reset] Failed to write failure audit row.", auditError);
      });
    }
    return handleEndpointError(toPlatformResetEndpointError(error));
  }
}
