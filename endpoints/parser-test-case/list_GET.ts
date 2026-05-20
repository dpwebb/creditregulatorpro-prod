import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { schema, OutputType } from "./list_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { isAdmin } from "../../helpers/userRoleUtils";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";
import { acceptDecisionsCoveredByExistingRuleCandidates } from "../../helpers/parserRulePromotionDecision";

export async function handle(request: Request) {
  try {
    // Auth check
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403 }
      );
    }
    await ensureParserTestAdjudicationSchema();
    const url = new URL(request.url);
    const input = schema.parse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    // Fetch test cases with latest run info
    const testCases = await db
      .selectFrom("parserTestCase")
      .selectAll("parserTestCase")
      .select((eb) => [
        eb
          .selectFrom("parserTestRun")
          .select("passed")
          .whereRef("parserTestRun.testCaseId", "=", "parserTestCase.id")
          .orderBy("runAt", "desc")
          .limit(1)
          .as("lastRunPassed"),
        eb
          .selectFrom("parserTestRun")
          .select("runAt")
          .whereRef("parserTestRun.testCaseId", "=", "parserTestCase.id")
          .orderBy("runAt", "desc")
          .limit(1)
          .as("lastRunAt"),
        eb
          .selectFrom("parserTestRun")
          .select(db.fn.count<number>("id").as("count"))
          .whereRef("parserTestRun.testCaseId", "=", "parserTestCase.id")
          .as("totalRuns"),
      ])
      .orderBy("updatedAt", "desc")
      .limit(input.limit)
      .offset(input.offset)
      .execute();

    const testCaseIds = testCases.map((testCase) => testCase.id);
    const candidates = testCaseIds.length > 0
      ? await db
          .selectFrom("parserRuleCandidate")
          .select([
            "testCaseId",
            "decisionId",
            "status",
            "activatedRuleId",
            "validationSummary",
            "createdBy",
            "createdAt",
          ])
          .where("status", "=", "activated")
          .where("testCaseId", "in", testCaseIds)
          .execute()
      : [];
    const candidatesByTestCaseId = new Map<number, typeof candidates>();
    candidates.forEach((candidate) => {
      const existing = candidatesByTestCaseId.get(candidate.testCaseId) ?? [];
      existing.push(candidate);
      candidatesByTestCaseId.set(candidate.testCaseId, existing);
    });

    const output: OutputType = {
      testCases: testCases.map((tc) => {
        const acceptedDecisions = acceptDecisionsCoveredByExistingRuleCandidates(
          tc.adjudicationDecisions,
          candidatesByTestCaseId.get(tc.id) ?? [],
        );

        return {
          id: tc.id,
          name: tc.name,
          description: tc.description,
          expectedConsumerInfo: tc.expectedConsumerInfo,
          expectedTradelines: tc.expectedTradelines,
          rawExtractedText: tc.rawExtractedText,
          bureau: tc.bureau,
          parserMode: tc.parserMode,
          allowAiFallback: tc.allowAiFallback,
          stageVersion: tc.stageVersion,
          extractionSource: tc.extractionSource,
          parserContext: tc.parserContext,
          adminReviewStatus:
            acceptedDecisions.changed && !acceptedDecisions.hasRemainingPromotableDecisions && tc.adminReviewStatus !== "approved"
              ? "partially_reviewed"
              : tc.adminReviewStatus,
          approvedConsumerInfo: tc.approvedConsumerInfo,
          approvedTradelines: tc.approvedTradelines,
          adjudicationDecisions: acceptedDecisions.changed
            ? acceptedDecisions.decisions
            : tc.adjudicationDecisions,
          lastRunPassed: tc.lastRunPassed,
          lastRunAt: tc.lastRunAt,
          totalRuns: Number(tc.totalRuns || 0),
          createdAt: tc.createdAt,
          updatedAt: tc.updatedAt,
        };
      }),
    };

    return new Response(JSON.stringify(output));
  } catch (error) {
    return handleEndpointError(error);
  }
}
