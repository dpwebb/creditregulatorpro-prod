import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./import_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { Json } from "../../helpers/schema";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";

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
    await ensureParserTestAdjudicationSchema();

    let importedCount = 0;

    for (const tc of input.testCases) {
      await db
        .insertInto("parserTestCase")
        .values({
          name: tc.name,
          description: tc.description,
          pdfBase64: tc.pdfBase64,
          expectedConsumerInfo: (tc.expectedConsumerInfo ?? null) as unknown as Json,
          expectedTradelines: (tc.expectedTradelines ?? []) as unknown as Json,
          rawExtractedText: tc.rawExtractedText,
          bureau: tc.bureau ?? null,
          parserMode: "deterministic",
          allowAiFallback: false,
          stageVersion: tc.stageVersion ?? null,
          extractionSource: tc.extractionSource ?? null,
          parserContext: (tc.parserContext ?? {}) as unknown as Json,
          adminReviewStatus: tc.adminReviewStatus ?? "needs_review",
          approvedConsumerInfo: (tc.approvedConsumerInfo ?? null) as unknown as Json,
          approvedTradelines: (tc.approvedTradelines ?? []) as unknown as Json,
          adjudicationDecisions: (tc.adjudicationDecisions ?? []) as unknown as Json,
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
