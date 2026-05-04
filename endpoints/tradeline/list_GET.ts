import { OutputType, schema } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { findAllCrossBureauPairs } from "../../helpers/crossBureauMatcher";
import { shouldSuppressStaleReportingViolation } from "../../helpers/staleReportingGuard";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const validatedInput = schema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    const applyFilters = <T extends ReturnType<typeof buildBaseQuery>>(q: T): T => {
      if (user.role !== 'admin') {
        return q.where('tradeline.userId', '=', user.id) as T;
      }
      return q;
    };

    const buildBaseQuery = () =>
      db
        .selectFrom('tradeline')
        .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
        .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
        .leftJoin('users', 'users.id', 'tradeline.userId')
        .leftJoin(
          (eb) =>
            eb
              .selectFrom('obligationInstance')
              .select(['obligationInstance.tradelineId', 'obligationInstance.state'])
              .distinctOn('obligationInstance.tradelineId')
              .orderBy('obligationInstance.tradelineId')
              .orderBy('obligationInstance.createdAt', 'desc')
              .as('latestObligation'),
          (join) => join.onRef('latestObligation.tradelineId', '=', 'tradeline.id')
        );

    // Count query
    const countQuery = applyFilters(buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total')));
    const countResult = await countQuery.executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = applyFilters(
      buildBaseQuery()
        .selectAll('tradeline')
        .select([
          'bureau.name as bureauName',
          'creditor.name as creditorName',
          'users.email as userEmail',
          'users.role as userRole',
          'latestObligation.state as disputeStatus',
        ])
        .orderBy('tradeline.createdAt', 'desc')
    );

    if (validatedInput.limit !== undefined) {
      dataQuery = dataQuery.limit(validatedInput.limit);
      if (validatedInput.offset !== undefined) {
        dataQuery = dataQuery.offset(validatedInput.offset);
      }
    }

    const rawTradelines = await dataQuery.execute();
    const allTradelineIds = rawTradelines.map((t) => t.id);
    const tradelineById = new Map(rawTradelines.map((t) => [t.id, t]));

    // Per-tradeline enrichment maps
    const tradelineViolationMap = new Map<number, { total: number; challenged: number }>();
    const approachingStatuteMap = new Map<number, number>();
    const obligationStatsMap = new Map<number, { challengesSent: number; responsesReceived: number; nextDeadline: Date | null }>();
    const packetsCreatedMap = new Map<number, number>();

    if (allTradelineIds.length > 0) {
      const now = new Date();

      // Query ALL creditorObligationTest rows for all tradelines.
      // Used for: violation counts, dispute status computation, and approaching statute months.
      const allViolations = await db
        .selectFrom('creditorObligationTest')
        .select([
          'creditorObligationTest.tradelineId',
          'creditorObligationTest.obligationState',
          'creditorObligationTest.violationCategory',
          'creditorObligationTest.responseDeadline',
        ])
        .where('creditorObligationTest.tradelineId', 'in', allTradelineIds)
        .execute();

      for (const v of allViolations) {
        if (v.tradelineId === null) continue;
        const tradeline = tradelineById.get(v.tradelineId);
        if (
          tradeline &&
          shouldSuppressStaleReportingViolation(v.violationCategory, {
            status: tradeline.status,
            dateClosed: tradeline.dateClosed,
            datePaidSettled: tradeline.datePaidSettled,
            isCollectionAccount: tradeline.isCollectionAccount,
            collectionAgencyName: tradeline.collectionAgencyName,
            accountType: tradeline.accountType,
          })
        ) {
          continue;
        }

        // Accumulate violation totals and challenged counts
        const existing = tradelineViolationMap.get(v.tradelineId) ?? { total: 0, challenged: 0 };
        existing.total += 1;
        if (v.obligationState === 'CHALLENGED') {
          existing.challenged += 1;
        }
        tradelineViolationMap.set(v.tradelineId, existing);

        // Compute approaching statute months from statute-category violations with a responseDeadline
        if (
          (v.violationCategory === 'STATUTE_APPROACHING' || v.violationCategory === 'STATUTE_OF_LIMITATIONS') &&
          v.responseDeadline !== null
        ) {
          const deadline = v.responseDeadline instanceof Date ? v.responseDeadline : new Date(v.responseDeadline as string);
          const monthsUntil = Math.max(0, Math.round((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
          const currentBest = approachingStatuteMap.get(v.tradelineId);
          // Keep the smallest (soonest) statute deadline
          if (currentBest === undefined || monthsUntil < currentBest) {
            approachingStatuteMap.set(v.tradelineId, monthsUntil);
          }
        }
      }

      // Query packet rows to compute packetsCreatedCount per tradeline
      const packetRows = await db
        .selectFrom('packet')
        .select(['tradelineId'])
        .where('tradelineId', 'in', allTradelineIds)
        .execute();

      for (const p of packetRows) {
        if (p.tradelineId === null) continue;
        packetsCreatedMap.set(p.tradelineId, (packetsCreatedMap.get(p.tradelineId) ?? 0) + 1);
      }

      // Query obligationInstance rows to compute challengesSentCount, responsesReceivedCount, nextDeadline
      const obligationInstances = await db
        .selectFrom('obligationInstance')
        .select(['tradelineId', 'challengeSentDate', 'responseReceivedDate', 'responseDeadline'])
        .where('tradelineId', 'in', allTradelineIds)
        .execute();

      for (const oi of obligationInstances) {
        if (oi.tradelineId === null) continue;
        const existing = obligationStatsMap.get(oi.tradelineId) ?? { challengesSent: 0, responsesReceived: 0, nextDeadline: null };
        if (oi.challengeSentDate !== null) existing.challengesSent += 1;
        if (oi.responseReceivedDate !== null) existing.responsesReceived += 1;
        if (oi.responseDeadline !== null) {
          const deadline = oi.responseDeadline instanceof Date ? oi.responseDeadline : new Date(oi.responseDeadline as string);
          if (deadline > now && (!existing.nextDeadline || deadline < existing.nextDeadline)) {
            existing.nextDeadline = deadline;
          }
        }
        obligationStatsMap.set(oi.tradelineId, existing);
      }
    }

    // Post-process: assign disputeStatus for tradelines that have violations but no obligationInstance state
    const tradelinesWithStatus = rawTradelines.map((t) => {
      if (t.disputeStatus !== null) return t;

      const violations = tradelineViolationMap.get(t.id);
      if (!violations || violations.total === 0) return t;

      if (violations.challenged === violations.total) {
        return { ...t, disputeStatus: 'CHALLENGED' };
      }
      return { ...t, disputeStatus: 'VIOLATION_PENDING' };
    });

    // Compute cross-bureau sibling pairs across all tradelines in the result set
    const crossBureauPairs = findAllCrossBureauPairs(
      tradelinesWithStatus.map((t) => ({
        id: t.id,
        bureauId: t.bureauId,
        creditorId: t.creditorId,
        creditorName: t.creditorName,
        accountNumber: t.accountNumber,
        balance: t.balance,
        currentBalance: t.currentBalance,
      }))
    );

    const tradelines = tradelinesWithStatus.map((t) => {
      const violations = tradelineViolationMap.get(t.id);
      const obligationStats = obligationStatsMap.get(t.id);
      const nextDeadlineDate = obligationStats?.nextDeadline ?? null;

      return {
        ...t,
        crossBureauTradelineId: crossBureauPairs.get(t.id) ?? null,
        violationCount: violations?.total ?? 0,
        challengesSentCount: obligationStats?.challengesSent ?? 0,
        responsesReceivedCount: obligationStats?.responsesReceived ?? 0,
        nextDeadline: nextDeadlineDate ? nextDeadlineDate.toISOString() : null,
        approachingStatuteMonths: approachingStatuteMap.get(t.id) ?? null,
        packetsCreatedCount: packetsCreatedMap.get(t.id) ?? 0,
      };
    });

    return new Response(JSON.stringify({ tradelines, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
