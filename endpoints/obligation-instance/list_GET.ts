import { schema, OutputType } from "./list_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());

    // Convert string params to appropriate types for validation
    const validatedInput = schema.parse({
      tradelineId: params.tradelineId ? parseInt(params.tradelineId, 10) : undefined,
      state: params.state || undefined,
      disputeVector: params.disputeVector || undefined,
      limit: params.limit ?? undefined,
      offset: params.offset ?? undefined,
    });

    const buildBaseQuery = () =>
      db
        .selectFrom('obligationInstance')
        .innerJoin('tradeline', 'obligationInstance.tradelineId', 'tradeline.id')
        .leftJoin('creditor', 'tradeline.creditorId', 'creditor.id')
        .leftJoin('bureau', 'tradeline.bureauId', 'bureau.id');

    const applyFilters = <T extends ReturnType<typeof buildBaseQuery>>(q: T): T => {
      let filtered = q;
      if (validatedInput.tradelineId !== undefined) {
        filtered = filtered.where('obligationInstance.tradelineId', '=', validatedInput.tradelineId) as T;
      }
      if (validatedInput.state) {
        filtered = filtered.where('obligationInstance.state', '=', validatedInput.state) as T;
      }
      if (validatedInput.disputeVector) {
        filtered = filtered.where('obligationInstance.disputeVector', '=', validatedInput.disputeVector) as T;
      }
      if (user.role !== 'admin') {
        filtered = filtered.where('obligationInstance.userId', '=', user.id) as T;
      }
      return filtered;
    };

    // Count query
    const countResult = await applyFilters(
      buildBaseQuery().select((eb) => eb.fn.countAll<string>().as('total'))
    ).executeTakeFirstOrThrow();
    const total = parseInt(countResult.total, 10);

    // Data query
    let dataQuery = applyFilters(
      buildBaseQuery().select([
        'obligationInstance.id',
        'obligationInstance.disputeVector',
        'obligationInstance.state',
        'obligationInstance.createdAt',
        'obligationInstance.challengeSentDate',
        'obligationInstance.responseDeadline',
        'obligationInstance.tradelineId',
        'tradeline.accountNumber',
        'creditor.name as creditorName',
        'bureau.name as bureauName',
      ])
    ).orderBy('obligationInstance.createdAt', 'desc');

    dataQuery = dataQuery.limit(validatedInput.limit).offset(validatedInput.offset);

    const instances = await dataQuery.execute();

    return new Response(JSON.stringify({ instances, total } satisfies OutputType));
  } catch (error) {
    console.error("Error fetching obligation instances:", error);
    return handleEndpointError(error);
  }
}
