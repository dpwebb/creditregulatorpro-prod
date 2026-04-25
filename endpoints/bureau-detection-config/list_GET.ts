import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./list_GET.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin role required", 403);
    }

    // Validate the empty schema just in case
    schema.parse({});

    const markers = await db
      .selectFrom("parserBureauDetectionConfig")
      .selectAll()
      .orderBy("bureau", "asc")
      .orderBy("weight", "desc")
      .execute();

    return new Response(
      superjson.stringify({
        markers,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}