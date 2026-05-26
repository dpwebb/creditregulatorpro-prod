import { detectResetRuntimeContext, runReset } from "../../../scripts/reset-platform.mjs";
import { handleEndpointError } from "../../../helpers/endpointErrorHandler";
import { schema, type OutputType } from "./dry-run_POST.schema";
import {
  platformResetSafetyRefusalResponse,
  requirePlatformResetAdmin,
  requirePlatformResetRequest,
  resolveAdminResetPreserveEmails,
  toPlatformResetEndpointError,
} from "./shared";

export async function handle(request: Request) {
  try {
    requirePlatformResetRequest(request);
    const adminUser = await requirePlatformResetAdmin(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    const runtime = detectResetRuntimeContext(process.env);
    if (runtime.environment.kind === "production") {
      return platformResetSafetyRefusalResponse(runtime);
    }
    if (runtime.environment.kind === "unknown") {
      return platformResetSafetyRefusalResponse(runtime);
    }

    const result = await runReset({
      execution: "dry-run",
      resetScope: input.mode,
      confirmEnv: runtime.environment.kind,
      baseUrl: input.baseUrl,
      preserveAdminEmails: resolveAdminResetPreserveEmails(adminUser, process.env),
    }, process.env);

    const output: OutputType = {
      success: true,
      result: result as unknown as OutputType["result"],
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(toPlatformResetEndpointError(error));
  }
}
