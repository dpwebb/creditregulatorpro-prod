import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./import_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { Json } from "../../helpers/schema";

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

    let importedCount = 0;

    for (const tc of input.testCases) {
      await db
        .insertInto("parserTestCase")
        .values({
          name: tc.name,
          description: tc.description,
          pdfBase64: tc.pdfBase64,
          expectedConsumerInfo: tc.expectedConsumerInfo as unknown as Json,
          expectedTradelines: tc.expectedTradelines as unknown as Json,
          rawExtractedText: tc.rawExtractedText,
          createdBy: user.id,
          updatedAt: new Date(),
        })
        .execute();
      importedCount++;
    }

    const output: OutputType = {
      importedCount,
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}