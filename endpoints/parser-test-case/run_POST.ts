import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./run_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { ParsedTradeline } from "../../helpers/reportParser";
import { ExtractedConsumerInfo } from "../../helpers/consumerInfoExtractorTypes";
import { compareConsumerInfo, compareTradelines, ComparisonSummary, hasAnyExpectations, hasUnapprovedData } from "../../helpers/parserPatternAnalyzer";
import { Json } from "../../helpers/schema";
import { parsePdfThroughProductionHtmlPipeline } from "../../helpers/parserTestProductionParser";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";
import { attachRuntimeValuesToParserPipelineAudit } from "../../helpers/parserPipelineFieldReconciliation";

function preferredTradelineExpectations(approved: unknown, fallback: unknown): unknown {
  return Array.isArray(approved) && approved.length > 0 ? approved : fallback;
}

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

    // 1. Fetch test case
    const testCase = await db
      .selectFrom("parserTestCase")
      .selectAll()
      .where("id", "=", input.testCaseId)
      .executeTakeFirstOrThrow();

    // 2. Rerun with the parser parameters saved on this test case.
    const { parseResult, rawExtractedText, parserPipelineAudit, canonicalOutput, replayHash, replayValidation } = await parsePdfThroughProductionHtmlPipeline(
      testCase.pdfBase64,
      {
        allowAiFallback: false,
        parserMode: "deterministic",
      },
    );
    const expectedConsumerInfo = testCase.approvedConsumerInfo ?? testCase.expectedConsumerInfo;
    const expectedTradelines = preferredTradelineExpectations(
      testCase.approvedTradelines,
      testCase.expectedTradelines,
    );

    // 3. Check if expectations are defined
    const hasExpectations = hasAnyExpectations(
      expectedConsumerInfo as unknown as Partial<ExtractedConsumerInfo>,
      expectedTradelines as unknown as ParsedTradeline[]
    );

    // 4. Compare results
    const consumerInfoResults = compareConsumerInfo(
      expectedConsumerInfo as unknown as Partial<ExtractedConsumerInfo>,
      parseResult.consumerInfo,
      rawExtractedText
    );

    const tradelineResults = compareTradelines(
      expectedTradelines as unknown as ParsedTradeline[],
      parseResult.tradelines,
      rawExtractedText
    );

    // Determine overall pass/fail
    // Test cannot pass if no expectations are defined
    const consumerInfoPassed = consumerInfoResults.every(r => r.passed);
    const tradelinesPassed = tradelineResults.every(r => r.passed);
    const passed = hasExpectations && consumerInfoPassed && tradelinesPassed;

    // Check if there's extracted data without expectations
    const needsReview = hasUnapprovedData(
      expectedConsumerInfo as unknown as Partial<ExtractedConsumerInfo>,
      parseResult.consumerInfo,
      expectedTradelines as unknown as ParsedTradeline[],
      parseResult.tradelines
    );

    // Collect suggestions
    const patternSuggestions: Record<string, string[]> = {};
    
    consumerInfoResults.forEach(r => {
        if (r.suggestion) {
            if (!patternSuggestions[r.fieldName]) patternSuggestions[r.fieldName] = [];
            patternSuggestions[r.fieldName].push(r.suggestion);
        }
    });

    tradelineResults.forEach(tl => {
        tl.fieldResults.forEach(r => {
            if (r.suggestion) {
                const key = `${tl.accountNumber || "Tradeline"} - ${r.fieldName}`;
                if (!patternSuggestions[key]) patternSuggestions[key] = [];
                patternSuggestions[key].push(r.suggestion);
            }
        });
    });

    const initialFieldResults = {
        consumerInfo: consumerInfoResults,
        tradelines: tradelineResults,
        pipelineAudit: parserPipelineAudit,
        canonicalOutput,
        replayHash,
        replayValidation,
    };

    // 5. Store run results
    const persistedRun = await db
      .insertInto("parserTestRun")
      .values({
        testCaseId: testCase.id,
        runAt: new Date(),
        passed: passed,
        actualConsumerInfo: parseResult.consumerInfo as unknown as Json,
        actualTradelines: parseResult.tradelines as unknown as Json,
        fieldResults: initialFieldResults as unknown as Json,
        patternSuggestions: patternSuggestions as unknown as Json,
      })
      .returning(["id", "actualConsumerInfo", "actualTradelines"])
      .executeTakeFirstOrThrow();

    const finalPipelineAudit = attachRuntimeValuesToParserPipelineAudit({
      audit: parserPipelineAudit,
      persistedRoot: {
        consumerInfo: persistedRun.actualConsumerInfo,
        tradelines: persistedRun.actualTradelines,
      },
      finalApiRoot: parseResult,
    });
    const fieldResults = {
      consumerInfo: consumerInfoResults,
      tradelines: tradelineResults,
      pipelineAudit: finalPipelineAudit,
      canonicalOutput,
      replayHash,
      replayValidation,
    };

    await db
      .updateTable("parserTestRun")
      .set({
        fieldResults: fieldResults as unknown as Json,
      })
      .where("id", "=", persistedRun.id)
      .execute();

    // 6. Update test case last run status
    await db
      .updateTable("parserTestCase")
      .set({
        lastRunAt: new Date(),
        lastRunPassed: passed,
      })
      .where("id", "=", testCase.id)
      .execute();

    const output: OutputType = {
      testCaseId: testCase.id,
      passed,
      needsReview,
      summary: {
        passed,
        hasExpectations,
        needsReview,
        consumerInfoResults,
        tradelineResults,
        patternSuggestions,
        pipelineAudit: finalPipelineAudit,
      },
      actualConsumerInfo: parseResult.consumerInfo,
      actualTradelines: parseResult.tradelines,
      parserPipelineAudit: finalPipelineAudit,
      canonicalOutput,
      replayHash,
      replayValidation,
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
