import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    // Ensure user is authenticated
    await getServerUserSession(request);

    const url = new URL(request.url);
    const queryParams = {
      tradelineId: url.searchParams.get('tradelineId') ? Number(url.searchParams.get('tradelineId')) : undefined,
      severity: url.searchParams.get('severity') || undefined,
      category: url.searchParams.get('category') || undefined,
    };

    const input = schema.parse(queryParams);

    let query = db
      .selectFrom('metro2ValidationLog')
      .selectAll()
      // Policy: Canada only
      .where('region', '=', 'CA');

    if (input.tradelineId !== undefined) {
      query = query.where('tradelineId', '=', input.tradelineId);
    }

    if (input.severity !== undefined) {
      query = query.where('severity', '=', input.severity);
    }

    if (input.category !== undefined) {
      query = query.where('ruleCategory', '=', input.category);
    }

    const logs = await query
      .orderBy('validatedAt', 'desc')
      .execute();

    return new Response(JSON.stringify({ logs } satisfies OutputType));
  } catch (error) {
    console.error("Error listing Metro2 validation logs:", error);
    return handleEndpointError(error);
  }
}