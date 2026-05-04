import { schema, OutputType } from "./compliance-audit_GET.schema";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    console.log(`packet/compliance-audit_GET called by user ${user.id}`);

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());
    
    // Parse and validate input
    const params = schema.parse(queryParams);

    // Base query construction
    let baseQuery = db
      .selectFrom('packetComplianceAudit')
      .innerJoin('packet', 'packet.id', 'packetComplianceAudit.packetId')
      .leftJoin('tradeline', 'tradeline.id', 'packet.tradelineId')
      .leftJoin('obligation', 'obligation.id', 'packetComplianceAudit.obligationId')
      .leftJoin('statuteVersion', 'statuteVersion.id', 'packetComplianceAudit.statuteVersionId')
      .leftJoin('statute', 'statute.id', 'statuteVersion.statuteId')
      .leftJoin('evidenceEvent', 'evidenceEvent.id', 'packetComplianceAudit.evidenceEventId');

    // Apply filters
    if (params.packetId !== undefined) {
      baseQuery = baseQuery.where('packetComplianceAudit.packetId', '=', params.packetId);
    }

    if (params.tradelineId !== undefined) {
      baseQuery = baseQuery.where('packet.tradelineId', '=', params.tradelineId);
    }

    if (params.startDate !== undefined) {
      baseQuery = baseQuery.where('packetComplianceAudit.appliedAt', '>=', params.startDate);
    }

    if (params.endDate !== undefined) {
      baseQuery = baseQuery.where('packetComplianceAudit.appliedAt', '<=', params.endDate);
    }

    // Non-admins can only access compliance audits for their own packets/tradelines.
    if (user.role !== 'admin') {
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb('packet.userId', '=', user.id),
          eb('tradeline.userId', '=', user.id),
        ]),
      );
    }

    // Get total count for pagination
    const countResult = await baseQuery
      .select(db.fn.count<string>('packetComplianceAudit.id').as('count'))
      .executeTakeFirst();
    
    const total = countResult ? parseInt(countResult.count, 10) : 0;

    // Execute main query with pagination and selection
    const audits = await baseQuery
      .select([
        // Audit fields
        'packetComplianceAudit.id',
        'packetComplianceAudit.complianceStatus',
        'packetComplianceAudit.regulationType',
        'packetComplianceAudit.selectionReason',
        'packetComplianceAudit.appliedAt',
        'packetComplianceAudit.region',
        
        // Packet fields
        'packet.id as packetId',
        'packet.status as packetStatus',
        'packet.terminalLabel as packetTerminalLabel',
        'packet.createdAt as packetCreatedAt',
        
        // Tradeline fields
        'tradeline.accountNumber as tradelineAccountNumber',
        
        // Obligation fields
        'obligation.description as obligationDescription',
        'obligation.section as obligationSection',
        'obligation.jurisdiction as obligationJurisdiction',
        'obligation.statutoryReference as obligationStatutoryReference',
        'obligation.obligationType as obligationType',
        'obligation.timeframeDays as obligationTimeframeDays',
        
        // Statute fields (joined via StatuteVersion)
        'statute.code as statuteCode',
        'statuteVersion.version as statuteVersion',
        'statuteVersion.effectiveDate as statuteEffectiveDate',
        'statuteVersion.sectionReference as statuteSectionReference',
        'statuteVersion.sourceUrl as statuteSourceUrl',
        
        // Evidence Event fields
        'evidenceEvent.currentHash as evidenceCurrentHash',
        'evidenceEvent.eventType as evidenceEventType',
        'evidenceEvent.at as evidenceAt'
      ])
      .orderBy('packetComplianceAudit.appliedAt', 'desc')
      .limit(params.limit)
      .offset(params.offset)
      .execute();

    return new Response(JSON.stringify({ audits, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
