import { randomUUID } from "crypto";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { Json } from "../../helpers/schema";
import { ensureParserTestAdjudicationSchema } from "../../helpers/parserTestAdjudicationSchema";
import { isAdmin } from "../../helpers/userRoleUtils";
import { schema, OutputType, InputType } from "./adjudicate_POST.schema";

type ParserDecisionInput = NonNullable<InputType["decision"]>;

function normalizeDecisions(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? cloneJson(value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? cloneJson(value) : [];
}

function tokenizePath(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  const matcher = /([^[.\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(path))) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(Number(match[2]));
    }
  }

  return tokens;
}

function setValueAtPath(target: Record<string, unknown> | unknown[], path: string, value: unknown) {
  const tokens = tokenizePath(path);
  if (tokens.length === 0) return;

  let cursor: any = target;
  tokens.forEach((token, index) => {
    const isLast = index === tokens.length - 1;
    if (isLast) {
      cursor[token] = value;
      return;
    }

    const nextToken = tokens[index + 1];
    if (cursor[token] == null || typeof cursor[token] !== "object") {
      cursor[token] = typeof nextToken === "number" ? [] : {};
    }
    cursor = cursor[token];
  });
}

function normalizeCorrectValue(decision: ParserDecisionInput): unknown {
  if (decision.decision === "not_reported") return null;
  if (decision.decision === "accepted" && decision.correctValue === undefined) {
    return decision.parsedValue ?? null;
  }
  return decision.correctValue ?? "";
}

function applyDecisionToApprovedData({
  decision,
  approvedConsumerInfo,
  approvedTradelines,
}: {
  decision: ParserDecisionInput;
  approvedConsumerInfo: Record<string, unknown>;
  approvedTradelines: unknown[];
}) {
  if (decision.decision === "ignored") return;

  const value = normalizeCorrectValue(decision);

  if (decision.entityType === "consumerInfo") {
    const path = decision.fieldPath.replace(/^consumerInfo\.?/, "");
    if (path) setValueAtPath(approvedConsumerInfo, path, value);
    return;
  }

  if (decision.entityType === "tradeline") {
    const match = decision.fieldPath.match(/^tradelines\[(\d+)\](?:\.(.+))?$/);
    if (!match) return;

    const index = Number(match[1]);
    const path = match[2];
    if (!Number.isInteger(index) || !path) return;

    if (!approvedTradelines[index] || typeof approvedTradelines[index] !== "object") {
      approvedTradelines[index] = {};
    }
    setValueAtPath(approvedTradelines[index] as Record<string, unknown>, path, value);
  }
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
    const nextApprovedConsumerInfo =
      input.approvedConsumerInfo !== undefined
        ? toRecord(input.approvedConsumerInfo)
        : toRecord(existing.approvedConsumerInfo ?? existing.expectedConsumerInfo);
    const nextApprovedTradelines =
      input.approvedTradelines !== undefined
        ? toArray(input.approvedTradelines)
        : toArray(
            Array.isArray(existing.approvedTradelines) && existing.approvedTradelines.length > 0
              ? existing.approvedTradelines
              : existing.expectedTradelines,
          );

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
      applyDecisionToApprovedData({
        decision: input.decision,
        approvedConsumerInfo: nextApprovedConsumerInfo,
        approvedTradelines: nextApprovedTradelines,
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
          nextApprovedConsumerInfo as unknown as Json,
        approvedTradelines:
          nextApprovedTradelines as unknown as Json,
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
