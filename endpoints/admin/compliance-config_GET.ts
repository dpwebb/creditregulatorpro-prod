import { schema, OutputType } from "./compliance-config_GET.schema";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";


export async function handle(request: Request) {
  try {
    // Authentication check
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin") {
      console.warn(
        `Unauthorized admin endpoint access attempt by user ${user.id} (role: ${user.role})`
      );
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // No input body to parse for GET, but we can validate empty input if needed
    // For GET requests, we usually don't parse body, but schema might be used for query params if any.
    // Here schema is empty object.

    const configs = await db
      .selectFrom("complianceConfig")
      .selectAll()
      .orderBy("violationCategory")
      .execute();

    return new Response(JSON.stringify(configs satisfies OutputType));
  } catch (error) {
    console.error("Error fetching compliance configs:", error);
    
    if (error instanceof Error && error.message.includes("Not authenticated")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    return handleEndpointError(error);
  }
}