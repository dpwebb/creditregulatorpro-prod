import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./get_GET.schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    const url = new URL(request.url);
    const input = schema.parse({
      id: url.searchParams.get("id") ?? undefined,
    });

    const testCase = await db
      .selectFrom("parserTestCase")
      .select([
        "id",
        "name",
        "description",
        "expectedConsumerInfo",
        "expectedTradelines",
        "rawExtractedText",
        "bureau",
        "parserMode",
        "allowAiFallback",
        "stageVersion",
        "extractionSource",
        "parserContext",
        "adminReviewStatus",
        "approvedConsumerInfo",
        "approvedTradelines",
        "adjudicationDecisions",
        "createdAt",
        "updatedAt",
      ])
      .where("id", "=", input.id)
      .executeTakeFirst();

    if (!testCase) {
      return new Response(JSON.stringify({ error: "Parser test case not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ testCase } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
