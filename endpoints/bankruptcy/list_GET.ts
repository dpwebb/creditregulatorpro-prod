import { OutputType, schema } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // Parse query params
    const url = new URL(request.url);
    const validatedInput = schema.parse({
      status: url.searchParams.get("status") ?? undefined,
      province: url.searchParams.get("province") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    const buildBaseQuery = () =>
      db
        .selectFrom('bankruptcyRecord')
        .leftJoin('tradeline', 'tradeline.id', 'bankruptcyRecord.tradelineId')
        .leftJoin('bureau', 'bureau.id', 'tradeline.bureauId');

    const applyCommonFilters = <T extends ReturnType<typeof buildBaseQuery>>(q: T): T => {
      let filtered = q;
      if (user.role !== 'admin') {
        filtered = filtered.where('bankruptcyRecord.userId', '=', user.id) as T;
      }
      if (validatedInput.status) {
        filtered = filtered.where('bankruptcyRecord.status', '=', validatedInput.status) as T;
      }
      if (validatedInput.province) {
        filtered = filtered.where('bankruptcyRecord.province', '=', validatedInput.province) as T;
      }
      if (validatedInput.type) {
        filtered = filtered.where('bankruptcyRecord.bankruptcyType', '=', validatedInput.type) as T;
      }
      return filtered;
    };

    // Count query
    const countResult = await applyCommonFilters(
      buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total'))
    ).executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = applyCommonFilters(
      buildBaseQuery()
        .selectAll('bankruptcyRecord')
        .select([
          'tradeline.accountNumber',
          'tradeline.accountType',
          'bureau.name as bureauName',
        ])
        .orderBy('bankruptcyRecord.createdAt', 'desc')
    );

    dataQuery = dataQuery.limit(validatedInput.limit).offset(validatedInput.offset);

    const records = await dataQuery.execute();

    return new Response(JSON.stringify({ records, total } satisfies OutputType));
  } catch (error) {
    return handleEndpointError(error);
  }
}
