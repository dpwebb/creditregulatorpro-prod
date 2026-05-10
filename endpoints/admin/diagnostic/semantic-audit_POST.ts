import { schema, OutputType } from "./semantic-audit_POST.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../../helpers/endpointErrorHandler";
import { runSemanticAudit } from "../../../helpers/semanticAuditRunner";

function parseRequestBody(text: string): unknown {
  if (!text.trim()) {
    return {};
  }

  try {
    const parsedSuperJson = superjson.parse(text);
    if (parsedSuperJson !== undefined) {
      return parsedSuperJson;
    }
  } catch {
    // Fall back to standard JSON parsing below.
  }

  return JSON.parse(text);
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Verify admin access
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin access required.", 403);
    }

    const text = await request.text();
    const json = parseRequestBody(text);
    const result = schema.parse(json);

    // Execute semantic audit
    const auditReport = await runSemanticAudit(result.userId);

    return new Response(superjson.stringify(auditReport satisfies OutputType), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
