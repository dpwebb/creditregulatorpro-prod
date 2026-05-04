import { schema, OutputType, RelatedCollectionTradeline, CrossBureauTradeline, LinkedDisputeStatus } from "./get_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { findCrossBureauSibling } from "../../helpers/crossBureauMatcher";

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isMeaningfulText(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !['unknown', 'n/a', 'na', '-', 'not reported'].includes(normalized);
}

function buildSummaryPaymentPattern(
  times30: number | null,
  times60: number | null,
  times90: number | null,
  times120: number | null,
): string | null {
  if (times30 == null || times60 == null || times90 == null) return null;
  const months = [times30, times60, times90, times120 ?? 0]
    .map((value) => (Number.isFinite(value) ? Number(value) : 0))
    .reduce((sum, value) => sum + Math.max(0, value), 0);
  return `30d:${Math.max(0, times30)} 60d:${Math.max(0, times60)} 90d:${Math.max(0, times90)} months:${Math.max(0, months)}`;
}

function isOptionalSchemaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (((error as { code?: unknown }).code === "42P01") || // undefined_table
      ((error as { code?: unknown }).code === "42703")) // undefined_column
  );
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const url = new URL(request.url);
    const idParam = url.searchParams.get("id");
    
    if (!idParam) {
      return new Response(JSON.stringify({ error: "Missing id parameter" }), { status: 400 });
    }

    // Validate the input using the schema
    const validatedInput = schema.parse({ id: idParam });
    const { id } = validatedInput;

    // Build query with joins for bureau and creditor names
    let query = db
      .selectFrom('tradeline')
      .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
      .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
      .selectAll('tradeline')
      .select([
        'bureau.name as bureauName',
        'creditor.name as creditorName'
      ])
      .where('tradeline.id', '=', id);

    // Apply data isolation based on user role
    if (user.role === 'admin') {
      // Admin users see all data
    } else {
      // Regular users see only their own data
      query = query.where('tradeline.userId', '=', user.id);
    }

    const tradeline = await query.executeTakeFirst();

    // Return 404 if not found or access denied by the filters above
    if (!tradeline) {
      return new Response(JSON.stringify({ error: "Tradeline not found or access denied" }), { status: 404 });
    }

    // If reportArtifactId exists, try to extract enriched fields from pass_extraction bureau_context
    let tuCaseId: string | null = null;
    let firstReportedDate: string | null = null;
    let lastReviewedBy: string | null = null;
    let lastReviewedDate: string | null = null;

    if (tradeline.reportArtifactId) {
      try {
        const passExtraction = await db
          .selectFrom('passExtraction')
          .select('bureauContext')
          .where('reportArtifactId', '=', tradeline.reportArtifactId)
          .where('status', '=', 'completed')
          .where('pass', '=', 'A')
          .executeTakeFirst();

        if (passExtraction?.bureauContext) {
          let bureauContext = passExtraction.bureauContext as Record<string, unknown>;
          if (typeof bureauContext === 'string') {
            try { bureauContext = JSON.parse(bureauContext); } catch { /* ignore */ }
          }

          const extractValue = (key: string, snakeKey: string): string | null => {
            const entry = (bureauContext[key] ?? bureauContext[snakeKey]) as { value?: string } | undefined;
            return entry?.value ?? null;
          };

          // Kysely CamelCasePlugin transforms JSON keys to camelCase
          tuCaseId = extractValue('tuCaseId', 'tu_case_id');
          firstReportedDate = extractValue('firstReportedDate', 'first_reported_date');
          lastReviewedBy = extractValue('lastReviewedBy', 'last_reviewed_by');
          lastReviewedDate = extractValue('lastReviewedDate', 'last_reviewed_date');
        }
      } catch (error) {
        if (!isOptionalSchemaError(error)) {
          throw error;
        }
        console.warn(`[tradeline/get] passExtraction enrichment skipped for tradeline ${tradeline.id} due to schema mismatch`, error);
      }
    }

    // Merge fallback account details from payment history tables.
    // This ensures UI accuracy when base tradeline fields are sparse or stale.
    let latestPaymentHistory:
      | {
          paymentPattern: string | null;
          times30DaysLate: number | null;
          times60DaysLate: number | null;
          times90DaysLate: number | null;
          times120DaysLate: number | null;
          monthlyPayment: string | null;
          lastPaymentAmount: string | null;
          lastActivityDate: Date | null;
          lastReportedDate: Date | null;
          dateOfLastPayment: Date | null;
          id: number;
        }
      | undefined;

    let latestPaymentDetail:
      | {
          balance: string | null;
          pastDue: string | null;
          highCredit: string | null;
          creditLimit: string | null;
          mop: string | null;
          terms: string | null;
          periodDate: Date | null;
          id: number;
        }
      | undefined;

    try {
      let paymentHistoryQuery = db
        .selectFrom('tradelinePaymentHistory')
        .select([
          'paymentPattern',
          'times30DaysLate',
          'times60DaysLate',
          'times90DaysLate',
          'times120DaysLate',
          'monthlyPayment',
          'lastPaymentAmount',
          'lastActivityDate',
          'lastReportedDate',
          'dateOfLastPayment',
          'id',
        ])
        .where('tradelineId', '=', tradeline.id);

      if (tradeline.reportArtifactId != null) {
        paymentHistoryQuery = paymentHistoryQuery.where('reportArtifactId', '=', tradeline.reportArtifactId);
      }

      latestPaymentHistory = await paymentHistoryQuery
        .orderBy('lastReportedDate', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst();

      let paymentDetailQuery = db
        .selectFrom('tradelinePaymentHistoryDetail')
        .select([
          'balance',
          'pastDue',
          'highCredit',
          'creditLimit',
          'mop',
          'terms',
          'periodDate',
          'id',
        ])
        .where('tradelineId', '=', tradeline.id);

      if (tradeline.reportArtifactId != null) {
        paymentDetailQuery = paymentDetailQuery.where('reportArtifactId', '=', tradeline.reportArtifactId);
      }

      latestPaymentDetail = await paymentDetailQuery
        .orderBy('periodDate', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst();
    } catch (error) {
      if (!isOptionalSchemaError(error)) {
        throw error;
      }
      console.warn(`[tradeline/get] payment history enrichment skipped for tradeline ${tradeline.id} due to schema mismatch`, error);
    }

    const fallbackPaymentPattern =
      latestPaymentHistory?.paymentPattern ??
      buildSummaryPaymentPattern(
        latestPaymentHistory?.times30DaysLate ?? null,
        latestPaymentHistory?.times60DaysLate ?? null,
        latestPaymentHistory?.times90DaysLate ?? null,
        latestPaymentHistory?.times120DaysLate ?? null,
      );

    const mergedTradeline = { ...tradeline };
    const detailBalance = toNumberOrNull(latestPaymentDetail?.balance);
    const detailPastDue = toNumberOrNull(latestPaymentDetail?.pastDue);
    const detailHighCredit = toNumberOrNull(latestPaymentDetail?.highCredit);
    const detailCreditLimit = toNumberOrNull(latestPaymentDetail?.creditLimit);

    // If a payment-detail grid exists, treat latest row balance as authoritative.
    if (detailBalance !== null) {
      const normalized = String(detailBalance);
      mergedTradeline.balance = normalized;
      mergedTradeline.currentBalance = normalized;
    }
    if (toNumberOrNull(mergedTradeline.amountPastDue) === null && detailPastDue !== null) {
      mergedTradeline.amountPastDue = String(detailPastDue);
    }
    if (toNumberOrNull(mergedTradeline.highCredit) === null && detailHighCredit !== null && detailHighCredit > 0) {
      mergedTradeline.highCredit = String(detailHighCredit);
    }
    if (toNumberOrNull(mergedTradeline.creditLimit) === null && detailCreditLimit !== null && detailCreditLimit > 0) {
      mergedTradeline.creditLimit = String(detailCreditLimit);
    }
    if (!isMeaningfulText(mergedTradeline.mop) && isMeaningfulText(latestPaymentDetail?.mop)) {
      mergedTradeline.mop = latestPaymentDetail.mop;
    }
    if (!isMeaningfulText(mergedTradeline.terms) && isMeaningfulText(latestPaymentDetail?.terms)) {
      mergedTradeline.terms = latestPaymentDetail.terms;
    }
    if (!isMeaningfulText(mergedTradeline.paymentPattern) && fallbackPaymentPattern) {
      mergedTradeline.paymentPattern = fallbackPaymentPattern;
    }
    if (mergedTradeline.monthlyPayment == null && latestPaymentHistory?.monthlyPayment != null) {
      mergedTradeline.monthlyPayment = latestPaymentHistory.monthlyPayment;
    }
    if (mergedTradeline.lastPaymentAmount == null && latestPaymentHistory?.lastPaymentAmount != null) {
      mergedTradeline.lastPaymentAmount = latestPaymentHistory.lastPaymentAmount;
    }
    if (mergedTradeline.lastActivityDate == null && latestPaymentHistory?.lastActivityDate != null) {
      mergedTradeline.lastActivityDate = latestPaymentHistory.lastActivityDate;
    }
    if (mergedTradeline.lastReportedDate == null && latestPaymentHistory?.lastReportedDate != null) {
      mergedTradeline.lastReportedDate = latestPaymentHistory.lastReportedDate;
    }
    if (mergedTradeline.dateOfLastPayment == null && latestPaymentHistory?.dateOfLastPayment != null) {
      mergedTradeline.dateOfLastPayment = latestPaymentHistory.dateOfLastPayment;
    }

    // Fetch related collection tradelines if this is a collection account
    let relatedCollectionTradelines: RelatedCollectionTradeline[] = [];

    if (
      tradeline.isCollectionAccount === true &&
      tradeline.accountNumber != null &&
      tradeline.dateOfFirstDelinquency != null &&
      tradeline.userId != null
    ) {
      const related = await db
        .selectFrom('tradeline as t')
        .leftJoin('creditor', 'creditor.id', 't.creditorId')
        .select([
          't.id',
          't.accountNumber',
          't.collectionAgencyName',
          'creditor.name as creditorName',
          't.balance',
          't.dateAssignedToCollection',
          't.status',
        ])
        .where('t.isCollectionAccount', '=', true)
        .where('t.userId', '=', tradeline.userId)
        .where('t.accountNumber', '=', tradeline.accountNumber)
        .where('t.dateOfFirstDelinquency', '=', tradeline.dateOfFirstDelinquency)
        .where('t.id', '!=', tradeline.id)
        .execute();

      const relatedIds = related.map((r) => r.id);
      const allRelevantIds = [tradeline.id, ...relatedIds];

      // Look up packets linked to MULTIPLE_COLLECTOR_VIOLATION or COLLECTOR_DUPLICATE_REPORTING
      // for the current tradeline or any related tradeline
      let linkedDisputeStatus: LinkedDisputeStatus = 'none';

      if (allRelevantIds.length > 0 && tradeline.userId != null) {
        try {
          const linkedPackets = await db
            .selectFrom('packet')
            .innerJoin(
              'creditorObligationTest',
              'creditorObligationTest.id',
              'packet.creditorObligationTestId'
            )
            .select(['packet.id', 'packet.status', 'packet.sentDate'])
            .where('packet.userId', '=', tradeline.userId)
            .where('packet.tradelineId', 'in', allRelevantIds)
            .where('creditorObligationTest.violationCategory', 'in', [
              'MULTIPLE_COLLECTOR_VIOLATION',
              'COLLECTOR_DUPLICATE_REPORTING',
            ])
            .execute();

          if (linkedPackets.length > 0) {
            const hasSent = linkedPackets.some(
              (p) => p.status === 'SENT' || p.sentDate != null
            );
            linkedDisputeStatus = hasSent ? 'sent' : 'created';
          }

          console.log(
            `Linked dispute status for tradeline ${tradeline.id}: ${linkedDisputeStatus} (checked ${linkedPackets.length} packet(s))`
          );
        } catch (error) {
          if (!isOptionalSchemaError(error)) {
            throw error;
          }
          console.warn(`[tradeline/get] linked dispute status skipped for tradeline ${tradeline.id} due to schema mismatch`, error);
        }
      }

      relatedCollectionTradelines = related.map((r) => ({
        id: r.id,
        accountNumber: r.accountNumber,
        collectionAgencyName: r.collectionAgencyName,
        creditorName: r.creditorName,
        balance: r.balance,
        dateAssignedToCollection: r.dateAssignedToCollection,
        status: r.status,
        linkedDisputeStatus,
      }));

      console.log(`Found ${relatedCollectionTradelines.length} related collection tradeline(s) for tradeline ${tradeline.id}`);
    }

    // Fetch cross-bureau sibling
    let crossBureauTradeline: CrossBureauTradeline | null = null;

    if (tradeline.userId != null) {
      let allUserTradelines: Array<{
        id: number;
        bureauId: number | null;
        creditorId: number | null;
        creditorIdAlias: number | null;
        accountNumber: string;
        balance: string | null;
        currentBalance: string | null;
        status: string | null;
        openedDate: Date | null;
        dateClosed: Date | null;
        dateOfFirstDelinquency: Date | null;
        creditLimit: string | null;
        highCredit: string | null;
        amountPastDue: string | null;
        lastActivityDate: Date | null;
        bureauName: string | null;
        creditorName: string | null;
        disputeStatus: string | null;
      }> = [];

      try {
        // Fetch all tradelines for the same user to find cross-bureau sibling
        allUserTradelines = await db
          .selectFrom('tradeline')
          .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
          .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
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
          )
          .select([
            'tradeline.id',
            'tradeline.bureauId',
            'tradeline.creditorId',
            'tradeline.creditorId as creditorIdAlias',
            'tradeline.accountNumber',
            'tradeline.balance',
            'tradeline.currentBalance',
            'tradeline.status',
            'tradeline.openedDate',
            'tradeline.dateClosed',
            'tradeline.dateOfFirstDelinquency',
            'tradeline.creditLimit',
            'tradeline.highCredit',
            'tradeline.amountPastDue',
            'tradeline.lastActivityDate',
            'bureau.name as bureauName',
            'creditor.name as creditorName',
            'latestObligation.state as disputeStatus',
          ])
          .where('tradeline.userId', '=', tradeline.userId)
          .execute();
      } catch (error) {
        if (!isOptionalSchemaError(error)) {
          throw error;
        }
        console.warn(`[tradeline/get] obligation state join skipped for tradeline ${tradeline.id} due to schema mismatch`, error);
        const fallbackRows = await db
          .selectFrom('tradeline')
          .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
          .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
          .select([
            'tradeline.id',
            'tradeline.bureauId',
            'tradeline.creditorId',
            'tradeline.creditorId as creditorIdAlias',
            'tradeline.accountNumber',
            'tradeline.balance',
            'tradeline.currentBalance',
            'tradeline.status',
            'tradeline.openedDate',
            'tradeline.dateClosed',
            'tradeline.dateOfFirstDelinquency',
            'tradeline.creditLimit',
            'tradeline.highCredit',
            'tradeline.amountPastDue',
            'tradeline.lastActivityDate',
            'bureau.name as bureauName',
            'creditor.name as creditorName',
          ])
          .where('tradeline.userId', '=', tradeline.userId)
          .execute();

        allUserTradelines = fallbackRows.map((row) => ({
          ...row,
          disputeStatus: null,
        }));
      }

      const sibling = findCrossBureauSibling(
        { 
          id: tradeline.id, 
          bureauId: tradeline.bureauId, 
          creditorId: tradeline.creditorId, 
          creditorName: tradeline.creditorName ?? null, 
          accountNumber: tradeline.accountNumber, 
          balance: tradeline.balance, 
          currentBalance: tradeline.currentBalance 
        },
        allUserTradelines.map((t) => ({
          id: t.id,
          bureauId: t.bureauId,
          creditorId: t.creditorIdAlias,
          creditorName: t.creditorName,
          accountNumber: t.accountNumber,
          balance: t.balance,
          currentBalance: t.currentBalance,
        }))
      );

      if (sibling) {
        const siblingRow = allUserTradelines.find((t) => t.id === sibling.id);
        if (siblingRow) {
        crossBureauTradeline = {
            id: siblingRow.id,
            bureauId: siblingRow.bureauId,
            bureauName: siblingRow.bureauName,
            creditorName: siblingRow.creditorName,
            accountNumber: siblingRow.accountNumber,
            disputeStatus: siblingRow.disputeStatus ?? null,
            balance: siblingRow.balance,
            currentBalance: siblingRow.currentBalance,
            status: siblingRow.status,
            openedDate: siblingRow.openedDate,
            dateClosed: siblingRow.dateClosed,
            dateOfFirstDelinquency: siblingRow.dateOfFirstDelinquency,
            creditLimit: siblingRow.creditLimit,
            highCredit: siblingRow.highCredit,
            amountPastDue: siblingRow.amountPastDue,
            lastActivityDate: siblingRow.lastActivityDate,
          };
          console.log(`Found cross-bureau sibling tradeline ${crossBureauTradeline.id} for tradeline ${tradeline.id}`);
        }
      }
    }

    return new Response(JSON.stringify({
      tradeline: {
        ...mergedTradeline,
        tuCaseId,
        firstReportedDate,
        lastReviewedBy,
        lastReviewedDate,
        relatedCollectionTradelines,
        crossBureauTradeline,
      }
    } satisfies OutputType));
  } catch (error) {
    console.error("Error fetching tradeline:", error);
    return handleEndpointError(error);
  }
}
