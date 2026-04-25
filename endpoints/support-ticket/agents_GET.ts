import { OutputType } from "./agents_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role !== "admin" && user.role !== "support") {
      throw new BusinessRuleError("Forbidden", 403);
    }

    const agents = await db
      .selectFrom("users")
      .select(["id", "displayName"])
      .where("role", "in", ["admin", "support"])
      .orderBy("displayName", "asc")
      .execute();

    return new Response(JSON.stringify({ agents } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}