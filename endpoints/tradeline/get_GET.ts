import { schema, OutputType, RelatedCollectionTradeline, CrossBureauTradeline, LinkedDisputeStatus } from "./get_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { findCrossBureauSibling } from "../../helpers/crossBureauMatcher";

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
      // Fetch all tradelines for the same user to find cross-bureau sibling
      const allUserTradelines = await db
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
        ...tradeline,
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