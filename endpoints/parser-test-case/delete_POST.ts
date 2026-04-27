import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./delete_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403 }
      );
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Delete runs first (cascade usually handles this but explicit is safer if not configured)
    await db
      .deleteFrom("parserTestRun")
      .where("testCaseId", "=", input.id)
      .execute();

    await db
      .deleteFrom("parserTestCase")
      .where("id", "=", input.id)
      .execute();

    const output: OutputType = {
      success: true,
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}