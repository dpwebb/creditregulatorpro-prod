import { randomUUID } from "crypto";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { Json } from "../../helpers/schema";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType } from "./adjudicate_POST.schema";

function normalizeDecisions(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    if (!isAdmin(user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403 });
    }

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);
    await ensureParserTestAdjudicationSchema();

    const existing = await db
      .selectFrom("parserTestCase")
      .selectAll()
      .where("id", "=", input.testCaseId)
      .executeTakeFirstOrThrow();

    const nextDecisions = normalizeDecisions(existing.adjudicationDecisions);
    if (input.decision) {
      nextDecisions.push({
        ...input.decision,
        id: randomUUID(),
        bureau: existing.bureau,
        parserMode: existing.parserMode,
        stageVersion: existing.stageVersion,
        decidedBy: user.id,
        decidedAt: new Date().toISOString(),
      });
    }

    const nextStatus =
      input.adminReviewStatus ??
      (input.decision
        ? input.decision.decision === "accepted"
          ? "partially_reviewed"
          : "needs_parser_rule"
        : existing.adminReviewStatus);

    const updated = await db
      .updateTable("parserTestCase")
      .set({
        adminReviewStatus: nextStatus,
        approvedConsumerInfo:
          input.approvedConsumerInfo !== undefined
            ? (input.approvedConsumerInfo as unknown as Json)
            : existing.approvedConsumerInfo,
        approvedTradelines:
          input.approvedTradelines !== undefined
            ? (input.approvedTradelines as unknown as Json)
            : existing.approvedTradelines,
        adjudicationDecisions: nextDecisions as unknown as Json,
        updatedAt: new Date(),
      })
      .where("id", "=", input.testCaseId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const output: OutputType = {
      testCase: {
        id: updated.id,
        adminReviewStatus: updated.adminReviewStatus,
        approvedConsumerInfo: updated.approvedConsumerInfo,
        approvedTradelines: updated.approvedTradelines,
        adjudicationDecisions: updated.adjudicationDecisions,
        updatedAt: updated.updatedAt,
      },
    };

    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
