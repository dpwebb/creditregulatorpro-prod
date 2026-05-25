import { detectResetRuntimeContext, runReset } from "../../../scripts/reset-platform.mjs";
import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { schema, type OutputType } from "./dry-run_POST.schema";
import {
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
      throw new BusinessRuleError(`Refusing platform reset against production: ${runtime.environment.reason}`, 403);
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
