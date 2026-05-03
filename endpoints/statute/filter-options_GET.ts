import { OutputType } from "./filter-options_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { deriveTopic } from "../../helpers/statuteClassification";

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

    const topicSource = await db
      .selectFrom("statute")
      .innerJoin("statuteVersion", "statute.id", "statuteVersion.statuteId")
      .select(["statute.code", "statuteVersion.description"])
      .execute();

    const topicSet = new Set<string>();
    for (const row of topicSource) {
      topicSet.add(deriveTopic(row.code, row.description));
    }

    const topics = Array.from(topicSet).sort((a, b) => a.localeCompare(b));
    const statuses: OutputType["statuses"] = ["ACTIVE", "AMENDED", "REPEALED"];

    return new Response(JSON.stringify({ jurisdictions, codes, topics, statuses } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
