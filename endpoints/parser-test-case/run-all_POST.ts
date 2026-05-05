import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./run-all_POST.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { ParsedTradeline } from "../../helpers/reportParser";
import { ExtractedConsumerInfo } from "../../helpers/consumerInfoExtractorTypes";
import { compareConsumerInfo, compareTradelines, hasAnyExpectations } from "../../helpers/parserPatternAnalyzer";
import { Json } from "../../helpers/schema";
import { parsePdfThroughProductionHtmlPipeline } from "../../helpers/parserTestProductionParser";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";

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

    await ensureParserTestAdjudicationSchema();

    // Fetch all test cases
    const testCases = await db
      .selectFrom("parserTestCase")
      .selectAll()
      .execute();

    let passedCount = 0;
    let failedCount = 0;
    const failures: { id: number; name: string; reason: string }[] = [];

    // Run tests sequentially to avoid overwhelming the server
    for (const testCase of testCases) {
      try {
        const { parseResult, rawExtractedText } = await parsePdfThroughProductionHtmlPipeline(testCase.pdfBase64);
        const expectedConsumerInfo = testCase.approvedConsumerInfo ?? testCase.expectedConsumerInfo;
        const expectedTradelines = preferredTradelineExpectations(
          testCase.approvedTradelines,
          testCase.expectedTradelines,
        );

        // Check expectations
        const hasExpectations = hasAnyExpectations(
          expectedConsumerInfo as unknown as Partial<ExtractedConsumerInfo>,
          expectedTradelines as unknown as ParsedTradeline[]
        );

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

        const consumerInfoPassed = consumerInfoResults.every(r => r.passed);
        const tradelinesPassed = tradelineResults.every(r => r.passed);
        const passed = hasExpectations && consumerInfoPassed && tradelinesPassed;

        if (passed) {
          passedCount++;
        } else {
          failedCount++;
          let reason = "Unknown Failure";
          if (!hasExpectations) {
            reason = "No Expected Values Configured";
          } else if (!consumerInfoPassed) {
            reason = "Consumer Info Mismatch";
          } else if (!tradelinesPassed) {
            reason = "Tradeline Mismatch";
          }

          failures.push({
            id: testCase.id,
            name: testCase.name,
            reason
          });
        }

        // Collect pattern suggestions for bulk run
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

        // Store run result
        await db
          .insertInto("parserTestRun")
          .values({
            testCaseId: testCase.id,
            runAt: new Date(),
            passed: passed,
            actualConsumerInfo: parseResult.consumerInfo as unknown as Json,
            actualTradelines: parseResult.tradelines as unknown as Json,
            fieldResults: { consumerInfo: consumerInfoResults, tradelines: tradelineResults } as unknown as Json,
            patternSuggestions: patternSuggestions as unknown as Json,
          })
          .execute();

        // Update test case status
        await db
          .updateTable("parserTestCase")
          .set({
            lastRunAt: new Date(),
            lastRunPassed: passed,
          })
          .where("id", "=", testCase.id)
          .execute();

      } catch (e) {
        failedCount++;
        failures.push({
          id: testCase.id,
          name: testCase.name,
          reason: `Exception: ${e instanceof Error ? e.message : "Unknown error"}`
        });
      }
    }

    const output: OutputType = {
      total: testCases.length,
      passed: passedCount,
      failed: failedCount,
      failures,
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
