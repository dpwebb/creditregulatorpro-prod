import { schema, OutputType } from "./auto-purge_POST.schema";
import { enforceRetention, previewRetention } from "../../helpers/dataRetention";
import { logAudit } from "../../helpers/auditLogger";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { deriveCronSecret } from "../../helpers/cronSecret";
import { isRetentionApplyRequested } from "../../helpers/retentionApplyGuard";

const CRON_SECRET = deriveCronSecret("retention-auto-purge-cron");

export async function handle(request: Request) {
  try {
    // 1. Authentication (bearer-only derived cron token)
    const url = new URL(request.url);
    if (url.searchParams.has("token")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : null;

    if (!bearerToken || bearerToken !== CRON_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Parse Input (body is optional; preview is the safe default)
    const text = await request.text();
    const input = schema.parse(text.trim() ? JSON.parse(text) : {});

    // 3. Execute Retention Logic
    const applyRequested = isRetentionApplyRequested(input);
    const result = applyRequested
      ? await enforceRetention(true)
      : await previewRetention();

    // 4. Log Audit
    // userId: 0 represents "System" / "Automated Process".
    if (applyRequested) {
      await logAudit({
        action: "DELETE",
        entityType: "REPORT_ARTIFACT",
        userId: 0,
        details: {
          operation: "AUTOMATED_RETENTION_PURGE",
          mode: "apply",
          explicitConfirmation: true,
          summary: result,
          triggeredBy: "CRON_ENDPOINT",
        },
        status: result.success ? "SUCCESS" : "FAILURE",
        errorMessage: result.message,
        request,
      });
    }

    console.log(`retention/auto-purge: ${applyRequested ? "apply" : "preview"} completed - success=${result.success}, message=${result.message ?? "none"}`);

    // 5. Return Response
    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    console.error("Error in auto-purge_POST:", error);
    return handleEndpointError(error);
  }
}
