import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

const hiddenRiskCategories = [
  "ZOMBIE_DEBT_RESURRECTION",
  "PHANTOM_DEBT_UNVERIFIABLE",
  "STALE_REPORTING_FAILURE",
  "CLOSED_ACCOUNT_BALANCE_INFLATION",
  "LAST_ACTIVITY_DATE_MANIPULATION",
  "RETROACTIVE_HISTORY_MANIPULATION",
  "CONSUMER_STATEMENT_SUPPRESSION",
  "INVESTIGATION_RUBBER_STAMP",
  "FURNISHER_POST_DISPUTE_RETALIATION",
  "FURNISHER_REAGING_VIOLATION",
  "COLLECTOR_STATUTE_REVIVAL_ATTEMPT",
  "TEMPORAL_MANIPULATION"
] as const;

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    
    const input = schema.parse({
      userId: url.searchParams.get('userId') ? Number(url.searchParams.get('userId')) : undefined,
    });

    let query = db.selectFrom('creditorObligationTest as cot')
      .innerJoin('tradeline as t', 't.id', 'cot.tradelineId')
      .leftJoin('creditor as c', 'c.id', 'cot.creditorId')
      .leftJoin('bureau as b', 'b.id', 't.bureauId')
      .leftJoin('packet as p', 'p.creditorObligationTestId', 'cot.id')
      .where('cot.violationCategory', 'in', hiddenRiskCategories)
      .where('cot.tradelineId', 'is not', null);

    if (user.role === 'admin' || user.role === 'support') {
      if (input.userId !== undefined) {
        query = query.where('t.userId', '=', input.userId);
      }
    } else {
      query = query.where('t.userId', '=', user.id);
    }

    const results = await query
      .select(({ fn }) => [
        'cot.id',
        'cot.violationCategory',
        'cot.severity',
        'cot.userExplanation',
        'cot.recommendedAction',
        'cot.detectedAt',
        'cot.confidenceScore',
        'cot.tradelineId',
        'c.name as creditorName',
        'b.name as bureauName',
        't.userId',
        fn.count<string>('p.id').as('packetCount')
      ])
      .groupBy([
        'cot.id', 
        'cot.violationCategory', 
        'cot.severity', 
        'cot.userExplanation', 
        'cot.recommendedAction', 
        'cot.detectedAt', 
        'cot.confidenceScore', 
        'cot.tradelineId', 
        'c.name', 
        'b.name', 
        't.userId'
      ])
      .execute();

    const severityRank: Record<string, number> = { ERROR: 3, WARNING: 2, INFO: 1 };
    
    const sortedRisks = results.map(r => ({
      id: r.id,
      violationCategory: r.violationCategory as string,
      severity: r.severity || 'INFO',
      userExplanation: r.userExplanation,
      recommendedAction: r.recommendedAction,
      detectedAt: r.detectedAt,
      confidenceScore: r.confidenceScore !== null ? Number(r.confidenceScore) : null,
      tradelineId: r.tradelineId as number,
      creditorName: r.creditorName,
      bureauName: r.bureauName,
      hasPacket: Number(r.packetCount) > 0,
      userId: r.userId
    })).sort((a, b) => {
      const aRank = severityRank[a.severity] || 0;
      const bRank = severityRank[b.severity] || 0;
      if (aRank !== bRank) return bRank - aRank;
      return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
    });

    const risks = sortedRisks.map(r => {
      const { userId, ...rest } = r;
      return rest;
    });

    const totalCount = risks.length;
    const errorCount = risks.filter(r => r.severity === 'ERROR').length;
    const warningCount = risks.filter(r => r.severity === 'WARNING').length;
    const countWithPacket = risks.filter(r => r.hasPacket).length;
    
    let uniqueUserCount: number | undefined = undefined;
    if (user.role === 'admin' || user.role === 'support') {
      const uniqueUsers = new Set(sortedRisks.map(r => r.userId));
      uniqueUserCount = uniqueUsers.size;
    }

    return new Response(JSON.stringify({
      risks,
      aggregate: {
        totalCount,
        errorCount,
        warningCount,
        countWithPacket,
        uniqueUserCount
      }
    } satisfies OutputType), {
      headers: { "Content-Type": "application/json" }
    });

  } catch(error) {
    return handleEndpointError(error);
  }
}