import { OutputType } from "./filter-options_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`statute/filter-options_GET called by user ${user.id}`);

    // Get unique jurisdictions
    const jurisdictionsResult = await db
      .selectFrom("statute")
      .select("jurisdiction")
      .distinct()
      .orderBy("jurisdiction", "asc")
      .execute();

    const jurisdictions = jurisdictionsResult.map(row => row.jurisdiction);

    // Get unique codes
    const codesResult = await db
      .selectFrom("statute")
      .select("code")
      .distinct()
      .orderBy("code", "asc")
      .execute();

    const codes = codesResult.map(row => row.code);

    return new Response(JSON.stringify({ jurisdictions, codes } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}