import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./create_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { Json } from "../../helpers/schema";
import { parsePdfThroughProductionHtmlPipeline } from "../../helpers/parserTestProductionParser";
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

    const needsParserFallback =
      input.expectedConsumerInfo === undefined ||
      input.expectedTradelines === undefined ||
      input.rawExtractedText === undefined;
    const parserFallback = needsParserFallback
      ? await parsePdfThroughProductionHtmlPipeline(input.pdfBase64, {
          allowAiFallback: input.allowAiFallback,
          parserMode: input.parserMode,
        })
      : null;

    const expectedConsumerInfo =
      input.expectedConsumerInfo !== undefined
        ? input.expectedConsumerInfo
        : parserFallback?.parseResult.consumerInfo ?? null;
    const expectedTradelines =
      input.expectedTradelines !== undefined
        ? input.expectedTradelines
        : parserFallback?.parseResult.tradelines ?? null;
    const rawExtractedText =
      input.rawExtractedText !== undefined
        ? input.rawExtractedText
        : parserFallback?.rawExtractedText ?? null;
    const parserContext =
      input.parserContext && typeof input.parserContext === "object" && !Array.isArray(input.parserContext)
        ? {
            ...(input.parserContext as Record<string, unknown>),
            ...(parserFallback?.parserPipelineAudit ? { pipelineAudit: parserFallback.parserPipelineAudit } : {}),
          }
        : parserFallback?.parserPipelineAudit
          ? { pipelineAudit: parserFallback.parserPipelineAudit }
          : {};

    // 3. Create test case
    const newTestCase = await db
      .insertInto("parserTestCase")
      .values({
        name: input.name,
        description: input.description,
        pdfBase64: input.pdfBase64,
        rawExtractedText,
        expectedConsumerInfo: expectedConsumerInfo as unknown as Json,
        expectedTradelines: expectedTradelines as unknown as Json,
        bureau: input.bureau ?? null,
        parserMode: input.parserMode ?? null,
        allowAiFallback: input.allowAiFallback ?? null,
        stageVersion: input.stageVersion ?? null,
        extractionSource: input.extractionSource ?? null,
        parserContext: parserContext as unknown as Json,
        adminReviewStatus: "needs_review",
        approvedConsumerInfo: null,
        approvedTradelines: [],
        adjudicationDecisions: [],
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
        bureau: newTestCase.bureau,
        parserMode: newTestCase.parserMode,
        allowAiFallback: newTestCase.allowAiFallback,
        stageVersion: newTestCase.stageVersion,
        extractionSource: newTestCase.extractionSource,
        parserContext: newTestCase.parserContext,
        adminReviewStatus: newTestCase.adminReviewStatus,
      },
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
