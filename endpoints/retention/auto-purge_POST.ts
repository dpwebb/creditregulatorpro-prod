import { schema, OutputType } from "./auto-purge_POST.schema";
import { enforceRetention } from "../../helpers/dataRetention";
import { logAudit } from "../../helpers/auditLogger";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { deriveCronSecret } from "../../helpers/cronSecret";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is not set");
}

// New HMAC-derived secret for this cron job
const CRON_SECRET_HMAC = deriveCronSecret("retention-auto-purge-cron");

// Legacy secret: first 32 chars of JWT_SECRET (kept for backward compatibility)
const CRON_SECRET_LEGACY = process.env.JWT_SECRET.substring(0, 32);

function isValidCronToken(token: string): boolean {
  return token === CRON_SECRET_HMAC || token === CRON_SECRET_LEGACY;
}

export async function handle(request: Request) {
  try {
    // 1. Authentication (Custom Token Check)
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    const providedToken = queryToken || bearerToken;

    if (!providedToken || !isValidCronToken(providedToken)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Parse Input (body is optional for cron triggers)
    const text = await request.text();
    if (text) {
      try {
        const json = JSON.parse(text);
        schema.parse(json);
      } catch (e) {
        // Schema is empty object, any parse failure is non-fatal
        console.warn("auto-purge_POST: failed to parse request body, proceeding anyway", e);
      }
    }

    // 3. Execute Retention Logic
    // Authentication passed, so we confirm the delete action.
    const result = await enforceRetention(true);

    // 4. Log Audit
    // userId: 0 represents "System" / "Automated Process"
    await logAudit({
      action: "DELETE",
      entityType: "REPORT_ARTIFACT",
      userId: 0,
      details: {
        operation: "AUTOMATED_RETENTION_PURGE",
        summary: result,
        triggeredBy: "CRON_ENDPOINT",
      },
      status: result.success ? "SUCCESS" : "FAILURE",
      errorMessage: result.message,
      request,
    });

    console.log(`retention/auto-purge: completed — success=${result.success}, message=${result.message ?? "none"}`);

    // 5. Return Response
    return new Response(JSON.stringify(result satisfies OutputType));
  } catch (error) {
    console.error("Error in auto-purge_POST:", error);
    return handleEndpointError(error);
  }
}