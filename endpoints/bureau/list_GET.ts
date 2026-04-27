import { OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    await getServerUserSession(request);

    // Fetch all bureaus, ordered by creation date descending
    const bureaus = await db
      .selectFrom('bureau')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .execute();

    return new Response(JSON.stringify({ bureaus } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}