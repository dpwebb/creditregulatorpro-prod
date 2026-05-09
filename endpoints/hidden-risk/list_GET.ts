import { schema, OutputType } from "./list_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { getViolationDisplayLabel } from "../../helpers/getViolationLabel";
import { shouldSuppressStaleReportingViolation } from "../../helpers/staleReportingGuard";

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

function maskAccountNumber(accountNumber: string | null): string | null {
  if (!accountNumber) return null;
  const trimmed = accountNumber.trim();
  if (!trimmed) return null;
  if (trimmed.includes("*")) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 4) return `ending in ${digits.slice(-4)}`;
  return "masked";
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const canViewAllUsers = user.role === 'admin' || user.role === 'support';
    
    const input = schema.parse({
      userId: url.searchParams.get('userId') ? Number(url.searchParams.get('userId')) : undefined,
    });

    let query = db.selectFrom('creditorObligationTest as cot')
      .innerJoin('tradeline as t', 't.id', 'cot.tradelineId')
      .leftJoin('creditor as c', 'c.id', 'cot.creditorId')
      .leftJoin('creditor as tc', 'tc.id', 't.creditorId')
      .leftJoin('bureau as b', 'b.id', 't.bureauId')
      .leftJoin('users as u', 'u.id', 't.userId')
      .leftJoin('userAccount as ua', 'ua.userId', 't.userId')
      .leftJoin('packet as p', 'p.creditorObligationTestId', 'cot.id')
      .leftJoin('passExtraction as pe', 'pe.reportArtifactId', 't.reportArtifactId')
      .where('cot.violationCategory', 'in', hiddenRiskCategories)
      .where('cot.userStatus', '=', 'active')
      .where('cot.tradelineId', 'is not', null);

    if (canViewAllUsers) {
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
        'cot.technicalDetails',
        'cot.userStatus',
        'cot.tradelineId',
        'c.name as creditorName',
        'tc.name as tradelineCreditorName',
        'b.name as bureauName',
        't.userId',
        't.accountNumber',
        't.reportArtifactId',
        't.status as tradelineStatus',
        't.dateClosed as tradelineDateClosed',
        't.datePaidSettled as tradelineDatePaidSettled',
        't.isCollectionAccount as tradelineIsCollectionAccount',
        't.collectionAgencyName as tradelineCollectionAgencyName',
        't.originalCreditorName as tradelineOriginalCreditorName',
        't.accountType as tradelineAccountType',
        'u.email as userEmail',
        'u.displayName as userDisplayName',
        'ua.fullName as userFullName',
        fn.count<string>('p.id').as('packetCount'),
        fn.max<number>('pe.id').as('extractionRunId')
      ])
      .groupBy([
        'cot.id', 
        'cot.violationCategory', 
        'cot.severity', 
        'cot.userExplanation', 
        'cot.recommendedAction', 
        'cot.detectedAt', 
        'cot.confidenceScore', 
        'cot.technicalDetails',
        'cot.userStatus',
        'cot.tradelineId', 
        'c.name', 
        'tc.name',
        'b.name', 
        't.userId',
        't.accountNumber',
        't.reportArtifactId',
        't.status',
        't.dateClosed',
        't.datePaidSettled',
        't.isCollectionAccount',
        't.collectionAgencyName',
        't.originalCreditorName',
        't.accountType',
        'u.email',
        'u.displayName',
        'ua.fullName'
      ])
      .execute();

    const filteredResults = results.filter((row) =>
      !shouldSuppressStaleReportingViolation(row.violationCategory as string | null, {
        status: row.tradelineStatus,
        dateClosed: row.tradelineDateClosed,
        datePaidSettled: row.tradelineDatePaidSettled,
        isCollectionAccount: row.tradelineIsCollectionAccount,
        collectionAgencyName: row.tradelineCollectionAgencyName,
        accountType: row.tradelineAccountType,
      })
    );

    const severityRank: Record<string, number> = { ERROR: 3, WARNING: 2, INFO: 1 };
    
    const sortedRisks = filteredResults.map(r => ({
      id: r.id,
      violationCategory: r.violationCategory as string,
      severity: r.severity || 'INFO',
      displayLabel: getViolationDisplayLabel({
        violationCategory: r.violationCategory as string | null,
        technicalDetails: r.technicalDetails as Record<string, any> | null,
      }),
      userExplanation: r.userExplanation,
      recommendedAction: r.recommendedAction,
      detectedAt: r.detectedAt,
      confidenceScore: r.confidenceScore !== null ? Number(r.confidenceScore) : null,
      tradelineId: r.tradelineId as number,
      creditorName:
        r.creditorName ??
        r.tradelineCreditorName ??
        r.tradelineCollectionAgencyName ??
        r.tradelineOriginalCreditorName,
      bureauName: r.bureauName,
      accountType: r.tradelineAccountType,
      accountNumberMasked: maskAccountNumber(r.accountNumber),
      reportArtifactId: r.reportArtifactId,
      extractionRunId: r.extractionRunId ? Number(r.extractionRunId) : null,
      userStatus: r.userStatus ?? null,
      hasPacket: Number(r.packetCount) > 0,
      userId: r.userId,
      affectedUser: canViewAllUsers
        ? {
            id: r.userId,
            email: r.userEmail,
            displayName: r.userDisplayName,
            fullName: r.userFullName,
          }
        : undefined,
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
    if (canViewAllUsers) {
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
