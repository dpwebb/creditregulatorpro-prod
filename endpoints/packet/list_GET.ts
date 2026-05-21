import { OutputType, schema } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { buildPacketLifecycleSummary } from "../../helpers/packetLifecycle";
import { maskAccountNumber } from "../../helpers/disputePacketTemplate";

type PacketListScopeUser = {
  id: number;
  role: string;
  organizationId: number | null;
};

function rowInPacketListScope(
  row: { userId: number | null; organizationId: number | null; processingStatus: string | null },
  user: PacketListScopeUser,
) {
  if (user.role === 'admin') return true;
  return row.userId === user.id &&
    row.processingStatus === 'completed' &&
    row.organizationId === user.organizationId;
}

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const validatedInput = schema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    const buildBaseQuery = () =>
      db
        .selectFrom('packet')
        .leftJoin('tradeline', 'tradeline.id', 'packet.tradelineId')
        .leftJoin('creditor', 'creditor.id', 'tradeline.creditorId')
        .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId')
        .leftJoin('statuteVersion', 'statuteVersion.id', 'packet.statuteVersionId');

    const applyPacketListServerScope = <T extends ReturnType<typeof buildBaseQuery>>(query: T): T => {
      if (user.role === 'admin') return query;
      let scoped = query
        .where('packet.userId', '=', user.id)
        .where('packet.processingStatus', '=', 'completed');
      scoped = user.organizationId === null
        ? scoped.where('packet.organizationId', 'is', null)
        : scoped.where('packet.organizationId', '=', user.organizationId);
      return scoped as T;
    };

    // Count query
    const countQuery = applyPacketListServerScope(
      buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total')),
    );
    const countResult = await countQuery.executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = buildBaseQuery()
      .select([
        'packet.id',
        'packet.userId',
        'packet.tradelineId',
        'packet.status',
        'packet.terminalLabel',
        'packet.content',
        'packet.createdAt',
        'packet.type',
        'packet.signatureMode',
        'packet.region',
        'packet.statuteVersionId',
        'packet.bureauResponseDate',
        'packet.responseType',
        'packet.successOutcome',
        'packet.deliveryMethod',
        'packet.trackingNumber',
        'packet.sentDate',
        'packet.consumerCertification',
        'packet.letterDate',
        'packet.organizationId',
        'packet.bureauId',
        'packet.creditorObligationTestId',
        'packet.postgridLetterId',
        'packet.processingStatus',
        'packet.recipientName',
        'packet.recipientAddressLine1',
        'packet.recipientAddressLine2',
        'packet.recipientCity',
        'packet.recipientProvince',
        'packet.recipientPostalCode',
        'tradeline.accountNumber as tradelineAccountNumber',
        'tradeline.originalCreditorName as tradelineOriginalCreditorName',
        'creditor.name as tradelineCreditorNameFromTable',
        'bureau.name as bureauName',
        'statuteVersion.responseClockDays as responseClockDays',
      ])
      .orderBy('packet.createdAt', 'desc');

    dataQuery = applyPacketListServerScope(dataQuery);

    dataQuery = dataQuery.limit(validatedInput.limit);
    if (validatedInput.offset !== undefined) {
      dataQuery = dataQuery.offset(validatedInput.offset);
    }

    const rawPackets = (await dataQuery.execute()).filter((row) =>
      rowInPacketListScope(
        {
          userId: row.userId,
          organizationId: row.organizationId,
          processingStatus: row.processingStatus,
        },
        user,
      ),
    );

    const packets = rawPackets.map((p) => {
      const { userId: _userId, tradelineOriginalCreditorName, tradelineCreditorNameFromTable, responseClockDays, ...rest } = p as typeof p & {
        userId: number | null;
        tradelineOriginalCreditorName: string | null;
        tradelineCreditorNameFromTable: string | null;
        responseClockDays: number | null;
      };
      return {
        ...rest,
        tradelineAccountNumber: rest.tradelineAccountNumber
          ? maskAccountNumber(rest.tradelineAccountNumber)
          : null,
        tradelineCreditorName: tradelineCreditorNameFromTable ?? tradelineOriginalCreditorName ?? null,
        bureauName: (p as typeof p & { bureauName: string | null }).bureauName ?? null,
        recipientName: (p as typeof p & { recipientName: string | null }).recipientName ?? null,
        recipientAddressLine1: (p as typeof p & { recipientAddressLine1: string | null }).recipientAddressLine1 ?? null,
        recipientAddressLine2: (p as typeof p & { recipientAddressLine2: string | null }).recipientAddressLine2 ?? null,
        recipientCity: (p as typeof p & { recipientCity: string | null }).recipientCity ?? null,
        recipientProvince: (p as typeof p & { recipientProvince: string | null }).recipientProvince ?? null,
        recipientPostalCode: (p as typeof p & { recipientPostalCode: string | null }).recipientPostalCode ?? null,
        lifecycle: buildPacketLifecycleSummary({
          status: p.status,
          processingStatus: p.processingStatus,
          sentDate: p.sentDate,
          bureauResponseDate: p.bureauResponseDate,
          responseType: p.responseType,
          successOutcome: p.successOutcome,
          trackingNumber: p.trackingNumber,
          deliveryMethod: p.deliveryMethod,
          responseClockDays,
        }),
      };
    });

    return new Response(JSON.stringify({ packets, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
