import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`obligation/list_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const section = url.searchParams.get('section');
    
    const input = schema.parse({
      section: section || undefined,
    });

    let query = db
      .selectFrom('obligation')
      .selectAll();

    if (input.section) {
      query = query.where('section', '=', input.section);
    }

    const obligations = await query
      .orderBy('createdAt', 'desc')
      .execute();

    return new Response(JSON.stringify({ obligations } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}