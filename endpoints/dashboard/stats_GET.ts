import { OutputType } from "./stats_GET.schema";

import { db } from "../../helpers/db";
import { sql } from "kysely";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { subMonths, startOfMonth, endOfMonth } from "../../helpers/dateUtils";

const SUCCESS_OUTCOMES = [
  "DELETED",
  "CORRECTED",
  "REMOVED",
  "UPDATED",
  "SILENT_CORRECTION",
  "SILENT_DELETION",
  "WORKED",
  "PARTIAL",
];

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const now = new Date();
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Build queries with role-based filtering
    let tradelineQuery = db.selectFrom('tradeline').select(db.fn.count('id').as('count'));
    let tradelineLastMonthQuery = db.selectFrom('tradeline')
      .select(db.fn.count('id').as('count'))
      .where('createdAt', '>=', lastMonthStart)
      .where('createdAt', '<=', lastMonthEnd);
    
    let obligationQuery = db.selectFrom('obligationInstance').select(db.fn.count('id').as('count'));
    let obligationLastMonthQuery = db.selectFrom('obligationInstance')
      .select(db.fn.count('id').as('count'))
      .where('createdAt', '>=', lastMonthStart)
      .where('createdAt', '<=', lastMonthEnd);
    
    let packetQuery = db.selectFrom('packet').select(db.fn.count('id').as('count'));
    let packetLastMonthQuery = db.selectFrom('packet')
      .select(db.fn.count('id').as('count'))
      .where('createdAt', '>=', lastMonthStart)
      .where('createdAt', '<=', lastMonthEnd);

    // packetsSentCount: packets where sentDate IS NOT NULL
    let packetsSentQuery = db.selectFrom('packet')
      .select(db.fn.count('id').as('count'))
      .where('sentDate', 'is not', null);

    // violationsFoundCount: creditorObligationTest joined with tradeline, excluding dismissed
    let violationsQuery = db.selectFrom('creditorObligationTest')
      .innerJoin('tradeline', 'tradeline.id', 'creditorObligationTest.tradelineId')
      .select(db.fn.count('creditorObligationTest.id').as('count'))
      .where('creditorObligationTest.userStatus', '!=', 'dismissed');
    
    // Note: pdfStorageUrl is intentionally excluded — it's not used in the dashboard
    // and pulling large base64/GCS-path strings is wasteful.
    // For admin requests, we join to users table to get user info; for non-admin we select nulls.
    const commonPacketFields = [
      'packet.id',
      'packet.content',
      'packet.status',
      'packet.terminalLabel',
      'packet.createdAt',
      'packet.tradelineId',
      'packet.statuteVersionId',
      'packet.region',
      'packet.signatureMode',
      'packet.type',
      'packet.letterDate',
      'packet.sentDate',
      'packet.deliveryMethod',
      'packet.trackingNumber',
      'packet.responseType',
      'packet.bureauResponseDate',
      'packet.consumerCertification',
      'packet.successOutcome',
      'packet.organizationId',
      'tradeline.accountNumber as tradelineAccountNumber',
      'creditor.name as creditorName',
      'tradeline.originalCreditorName as originalCreditorName',
    ] as const;

    // Progress queries — denominator is obligations where a letter was actually sent
    let totalObligationsForProgress = db.selectFrom('obligationInstance')
      .select(db.fn.count('id').as('count'))
      .where('challengeSentDate', 'is not', null);
    let exhaustedObligations = db.selectFrom('obligationInstance')
      .select(db.fn.count('id').as('count'))
      .where('state', '=', 'PROCEDURALLY_EXHAUSTED');
    
    let successMetricsQuery = db.selectFrom('successMetric')
      .select([
        db.fn.count('successMetric.id').as('total'),
        sql<number>`sum(case when outcome in (${sql.join(SUCCESS_OUTCOMES)}) then 1 else 0 end)`.as('success')
      ]);

    let obligationsWithResponse = db.selectFrom('obligationInstance')
      .select(db.fn.count('id').as('count'))
      .where('responseReceivedDate', 'is not', null);

    let reportArtifactQuery = db.selectFrom('reportArtifact').select(db.fn.count('id').as('count'));
    // Non-admin filters applied below; admin sees all records including failed/pending

    if (user.role === 'admin') {
      // Admin: join users table to include user info in recent packets
      const adminRecentPacketsQuery = db.selectFrom('packet')
        .leftJoin('tradeline', 'tradeline.id', 'packet.tradelineId')
        .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
        .leftJoin('users', 'users.id', 'packet.userId')
        .leftJoin('userAccount', 'userAccount.userId', 'users.id')
        .select([
          ...commonPacketFields,
          'packet.userId',
          'users.displayName as userName',
          'users.email as userEmail',
          'userAccount.fullName as userFullName',
        ])
        .orderBy('packet.createdAt', 'desc')
        .limit(5);

      const [
        bureauCount,
        tradelineCount,
        tradelineLastMonth,
        obligationCount,
        obligationLastMonth,
        packetCount,
        packetLastMonth,
        recentPackets,
        totalObligation,
        exhausted,
        successMetrics,
        withResponse,
        reportArtifactCount,
        packetsSent,
        violationsFound,
      ] = await Promise.all([
        db.selectFrom('bureau').select(db.fn.count('id').as('count')).executeTakeFirst(),
        tradelineQuery.executeTakeFirst(),
        tradelineLastMonthQuery.executeTakeFirst(),
        obligationQuery.executeTakeFirst(),
        obligationLastMonthQuery.executeTakeFirst(),
        packetQuery.executeTakeFirst(),
        packetLastMonthQuery.executeTakeFirst(),
        adminRecentPacketsQuery.execute(),
        totalObligationsForProgress.executeTakeFirst(),
        exhaustedObligations.executeTakeFirst(),
        successMetricsQuery.executeTakeFirst(),
        obligationsWithResponse.executeTakeFirst(),
        reportArtifactQuery.executeTakeFirst(),
        packetsSentQuery.executeTakeFirst(),
        violationsQuery.executeTakeFirst(),
      ]);

      return new Response(JSON.stringify(
        buildOutput({
          bureauCount, tradelineCount, tradelineLastMonth,
          obligationCount, obligationLastMonth,
          packetCount, packetLastMonth,
          recentPackets,
          totalObligation, exhausted, successMetrics, withResponse, reportArtifactCount,
          packetsSent, violationsFound,
        }) satisfies OutputType
      ));
    }

    // Non-admin: filter by userId, select null for user fields
    // Also exclude failed/pending records so ghost packets and failed uploads don't inflate counts
    const userRecentPacketsQuery = db.selectFrom('packet')
      .leftJoin('tradeline', 'tradeline.id', 'packet.tradelineId')
      .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
      .select([
        ...commonPacketFields,
        sql<number | null>`null`.as('userId'),
        sql<string | null>`null`.as('userName'),
        sql<string | null>`null`.as('userEmail'),
        sql<string | null>`null`.as('userFullName'),
      ])
      .where('packet.userId', '=', user.id)
      .where('packet.processingStatus', '=', 'completed')
      .orderBy('packet.createdAt', 'desc')
      .limit(5);

    reportArtifactQuery = reportArtifactQuery
      .where('reportArtifact.userId', '=', user.id)
      .where('reportArtifact.processingStatus', '=', 'completed');
    tradelineQuery = tradelineQuery.where('tradeline.userId', '=', user.id);
    tradelineLastMonthQuery = tradelineLastMonthQuery.where('tradeline.userId', '=', user.id);
    obligationQuery = obligationQuery.where('obligationInstance.userId', '=', user.id);
    obligationLastMonthQuery = obligationLastMonthQuery.where('obligationInstance.userId', '=', user.id);
    packetQuery = packetQuery
      .where('packet.userId', '=', user.id)
      .where('packet.processingStatus', '=', 'completed');
    packetLastMonthQuery = packetLastMonthQuery
      .where('packet.userId', '=', user.id)
      .where('packet.processingStatus', '=', 'completed');
    totalObligationsForProgress = totalObligationsForProgress.where('obligationInstance.userId', '=', user.id);
    exhaustedObligations = exhaustedObligations.where('obligationInstance.userId', '=', user.id);
    successMetricsQuery = successMetricsQuery
      .innerJoin('obligationInstance', 'obligationInstance.id', 'successMetric.obligationInstanceId')
      .where('obligationInstance.userId', '=', user.id);
    obligationsWithResponse = obligationsWithResponse.where('obligationInstance.userId', '=', user.id);
    packetsSentQuery = packetsSentQuery
      .where('packet.userId', '=', user.id)
      .where('packet.processingStatus', '=', 'completed');
    violationsQuery = violationsQuery
      .where('tradeline.userId', '=', user.id);

    const [
      bureauCount,
      tradelineCount,
      tradelineLastMonth,
      obligationCount,
      obligationLastMonth,
      packetCount,
      packetLastMonth,
      recentPackets,
      totalObligation,
      exhausted,
      successMetrics,
      withResponse,
      reportArtifactCount,
      packetsSent,
      violationsFound,
    ] = await Promise.all([
      db.selectFrom('bureau').select(db.fn.count('id').as('count')).executeTakeFirst(),
      tradelineQuery.executeTakeFirst(),
      tradelineLastMonthQuery.executeTakeFirst(),
      obligationQuery.executeTakeFirst(),
      obligationLastMonthQuery.executeTakeFirst(),
      packetQuery.executeTakeFirst(),
      packetLastMonthQuery.executeTakeFirst(),
      userRecentPacketsQuery.execute(),
      totalObligationsForProgress.executeTakeFirst(),
      exhaustedObligations.executeTakeFirst(),
      successMetricsQuery.executeTakeFirst(),
      obligationsWithResponse.executeTakeFirst(),
      reportArtifactQuery.executeTakeFirst(),
      packetsSentQuery.executeTakeFirst(),
            violationsQuery.executeTakeFirst(),
    ]);

    return new Response(JSON.stringify(
      buildOutput({
        bureauCount, tradelineCount, tradelineLastMonth,
        obligationCount, obligationLastMonth,
        packetCount, packetLastMonth,
        recentPackets,
        totalObligation, exhausted, successMetrics, withResponse, reportArtifactCount,
        packetsSent, violationsFound,
      }) satisfies OutputType
    ));
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return handleEndpointError(error);
  }
}

type CountRow = { count: string | number | bigint } | undefined;

function buildOutput(data: {
  bureauCount: CountRow;
  tradelineCount: CountRow;
  tradelineLastMonth: CountRow;
  obligationCount: CountRow;
  obligationLastMonth: CountRow;
  packetCount: CountRow;
  packetLastMonth: CountRow;
  recentPackets: OutputType['recentPackets'];
  totalObligation: CountRow;
  exhausted: CountRow;
  successMetrics: { total: string | number | bigint; success: string | number | bigint } | undefined;
  withResponse: CountRow;
  reportArtifactCount: CountRow;
  packetsSent: CountRow;
  violationsFound: CountRow;
}): OutputType {
  const totalTradelineCount = Number(data.tradelineCount?.count ?? 0);
  const lastMonthTradelineCount = Number(data.tradelineLastMonth?.count ?? 0);
  const totalObligationCount = Number(data.obligationCount?.count ?? 0);
  const lastMonthObligationCount = Number(data.obligationLastMonth?.count ?? 0);
  const totalPacketCount = Number(data.packetCount?.count ?? 0);
  const lastMonthPacketCount = Number(data.packetLastMonth?.count ?? 0);

  const calculateTrend = (current: number, lastMonth: number) => {
    if (lastMonth === 0) return { value: 0, isPositive: true };
    const percentage = ((current - lastMonth) / lastMonth) * 100;
    return { value: Math.abs(percentage), isPositive: percentage >= 0 };
  };

  const totalObligationForProgressCount = Number(data.totalObligation?.count ?? 0);
  const exhaustedCount = Number(data.exhausted?.count ?? 0);
  const overallCompletion = totalObligationForProgressCount > 0
    ? (exhaustedCount / totalObligationForProgressCount) * 100
    : 0;

  const totalSuccessMetrics = Number(data.successMetrics?.total ?? 0);
  const successCount = Number(data.successMetrics?.success ?? 0);
  const successRate = totalSuccessMetrics > 0
    ? (successCount / totalSuccessMetrics) * 100
    : 0;

  const withResponseCount = Number(data.withResponse?.count ?? 0);
  const responseRate = totalObligationForProgressCount > 0
    ? (withResponseCount / totalObligationForProgressCount) * 100
    : 0;

  return {
    totalBureaus: Number(data.bureauCount?.count ?? 0),
    totalTradelines: totalTradelineCount,
    totalObligations: totalObligationCount,
    totalPackets: totalPacketCount,
    totalReportArtifacts: Number(data.reportArtifactCount?.count ?? 0),
    packetsSentCount: Number(data.packetsSent?.count ?? 0),
    violationsFoundCount: Number(data.violationsFound?.count ?? 0),
    recentPackets: data.recentPackets,
    trends: {
      tradelines: calculateTrend(totalTradelineCount, lastMonthTradelineCount),
      obligations: calculateTrend(totalObligationCount, lastMonthObligationCount),
      packets: calculateTrend(totalPacketCount, lastMonthPacketCount)
    },
    progress: {
      overallCompletion,
      successRate,
      responseRate
    }
  };
}
