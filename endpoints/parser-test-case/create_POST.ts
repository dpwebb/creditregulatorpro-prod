import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./create_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { parseReport } from "../../helpers/reportParser";
import { extractTextFromPdf } from "../../helpers/pdfTextExtractor";
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

    // 1. Extract text from PDF
    const rawText = await extractTextFromPdf(input.pdfBase64);

    // 2. Run initial parse to get baseline expected values
    // Assuming PDF mime type for now as per requirements
    const parseResult = await parseReport(input.pdfBase64, "application/pdf");

    // 3. Create test case
    const newTestCase = await db
      .insertInto("parserTestCase")
      .values({
        name: input.name,
        description: input.description,
        pdfBase64: input.pdfBase64,
        rawExtractedText: rawText,
        expectedConsumerInfo: parseResult.consumerInfo as unknown as Json,
        expectedTradelines: parseResult.tradelines as unknown as Json,
        createdBy: user.id,
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const output: OutputType = {
      testCase: {
        id: newTestCase.id,
        name: newTestCase.name,
        description: newTestCase.description,
        expectedConsumerInfo: newTestCase.expectedConsumerInfo,
        expectedTradelines: newTestCase.expectedTradelines,
        rawExtractedText: newTestCase.rawExtractedText,
      },
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}