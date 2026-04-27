import { schema, OutputType } from "./retention_POST.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { enforceRetention } from "../../helpers/dataRetention";
import { logAudit } from "../../helpers/auditLogger";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    // 1. Authentication & Authorization
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      console.warn(`Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role}) on ${request.url}`);
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Parse Input
    const text = await request.text();
    const json = text ? JSON.parse(text) : {};
    const input = schema.parse(json);

    // 3. Execute Retention Logic
    const result = await enforceRetention(input.confirmDelete);

    // 4. Log Audit
    await logAudit({
      action: "DELETE",
      entityType: "REPORT_ARTIFACT",
      userId: user.id,
      details: {
        operation: "MANUAL_RETENTION_ENFORCEMENT",
        summary: result,
      },
      status: result.success ? "SUCCESS" : "FAILURE",
      errorMessage: result.message,
      request,
    });

    // 5. Return Response
    return new Response(JSON.stringify(result satisfies OutputType));
    } catch (error) {
    return handleEndpointError(error);
  }
}