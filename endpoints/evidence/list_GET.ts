import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Parse query parameters from URL
    const url = new URL(request.url);
    const tradelineIdParam = url.searchParams.get('tradelineId');

    // Validate input
    const params = schema.parse({
      tradelineId: tradelineIdParam ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

        const buildBaseQuery = () =>
      db
        .selectFrom('evidenceEvent')
        .leftJoin('packet', 'packet.id', 'evidenceEvent.packetId')
        .leftJoin('tradeline', 'tradeline.id', 'packet.tradelineId');

    // Count query
    const countBase = buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total'));
    let countQuery = countBase;
    if (params.tradelineId !== undefined) {
      countQuery = countQuery.where('packet.tradelineId', '=', params.tradelineId);
    }
    if (user.role !== 'admin') {
      countQuery = countQuery.where('packet.userId', '=', user.id);
    }
    const countResult = await countQuery.executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = buildBaseQuery()
      .selectAll('evidenceEvent')
      .select([
        'packet.status as packetStatus',
        'packet.tradelineId as tradelineId',
        'tradeline.accountNumber as tradelineAccountNumber',
      ]);

    if (params.tradelineId !== undefined) {
      dataQuery = dataQuery.where('packet.tradelineId', '=', params.tradelineId);
    }
    if (user.role !== 'admin') {
      dataQuery = dataQuery.where('packet.userId', '=', user.id);
    }

    dataQuery = dataQuery.orderBy('evidenceEvent.id', 'desc');

    dataQuery = dataQuery.limit(params.limit).offset(params.offset);

    const events = await dataQuery.execute();

    return new Response(JSON.stringify({ events, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
