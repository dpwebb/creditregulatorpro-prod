import { OutputType, schema } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

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
        .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId');

    // Count query
    let countQuery = buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total'));
    if (user.role !== 'admin') {
      countQuery = countQuery
        .where('packet.userId', '=', user.id)
        .where('packet.processingStatus', '=', 'completed');
    }
    const countResult = await countQuery.executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = buildBaseQuery()
      .select([
        'packet.id',
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
      ])
      .orderBy('packet.createdAt', 'desc');

    if (user.role !== 'admin') {
      dataQuery = dataQuery
        .where('packet.userId', '=', user.id)
        .where('packet.processingStatus', '=', 'completed');
    }

    if (validatedInput.limit !== undefined) {
      dataQuery = dataQuery.limit(validatedInput.limit);
      if (validatedInput.offset !== undefined) {
        dataQuery = dataQuery.offset(validatedInput.offset);
      }
    }

    const rawPackets = await dataQuery.execute();

    const packets = rawPackets.map((p) => {
      const { tradelineOriginalCreditorName, tradelineCreditorNameFromTable, ...rest } = p as typeof p & {
        tradelineOriginalCreditorName: string | null;
        tradelineCreditorNameFromTable: string | null;
      };
      return {
        ...rest,
        tradelineCreditorName: tradelineCreditorNameFromTable ?? tradelineOriginalCreditorName ?? null,
        bureauName: (p as typeof p & { bureauName: string | null }).bureauName ?? null,
        recipientName: (p as typeof p & { recipientName: string | null }).recipientName ?? null,
        recipientAddressLine1: (p as typeof p & { recipientAddressLine1: string | null }).recipientAddressLine1 ?? null,
        recipientAddressLine2: (p as typeof p & { recipientAddressLine2: string | null }).recipientAddressLine2 ?? null,
        recipientCity: (p as typeof p & { recipientCity: string | null }).recipientCity ?? null,
        recipientProvince: (p as typeof p & { recipientProvince: string | null }).recipientProvince ?? null,
        recipientPostalCode: (p as typeof p & { recipientPostalCode: string | null }).recipientPostalCode ?? null,
      };
    });

    return new Response(JSON.stringify({ packets, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}