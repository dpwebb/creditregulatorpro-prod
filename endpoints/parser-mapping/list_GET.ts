import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./list_GET.schema";
import superjson from "superjson";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getDefaultMappings } from "../../helpers/parserMappingDefaults";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (user.role !== "admin") {
      throw new BusinessRuleError("Unauthorized: Admin role required", 403);
    }

    const url = new URL(request.url);
    const bureau = url.searchParams.get("bureau") || undefined;
    const section = url.searchParams.get("section") || undefined;

    const input = schema.parse({ bureau, section });

    let query = db.selectFrom("parserFieldMapping").selectAll();
    if (input.bureau) {
      query = query.where("bureau", "=", input.bureau);
    }
    if (input.section) {
      query = query.where("section", "=", input.section);
    }

    const mappings = await query.orderBy("priority", "desc").execute();
    
    // Add factory defaults for contextual reference based on bureau
    const defaults = getDefaultMappings(input.bureau);

    return new Response(
      superjson.stringify({
        mappings,
        defaults,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}