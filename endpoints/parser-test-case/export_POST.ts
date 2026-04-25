import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./export_POST.schema";

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

    let query = db.selectFrom("parserTestCase").selectAll();

    if (input.testCaseIds && input.testCaseIds.length > 0) {
      query = query.where("id", "in", input.testCaseIds);
    }

    const testCases = await query.execute();

    const exportData = testCases.map(tc => ({
      name: tc.name,
      description: tc.description,
      pdfBase64: tc.pdfBase64,
      expectedConsumerInfo: tc.expectedConsumerInfo,
      expectedTradelines: tc.expectedTradelines,
      rawExtractedText: tc.rawExtractedText
    }));

    const output: OutputType = {
      testCases: exportData
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}