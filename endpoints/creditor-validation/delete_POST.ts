import { schema, OutputType } from "./delete_POST.schema";

import { db } from "../../helpers/db";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    // Fetch the test record joined with tradeline for ownership check
    const testRecord = await db
      .selectFrom('creditorObligationTest')
      .leftJoin('tradeline', 'tradeline.id', 'creditorObligationTest.tradelineId')
      .select([
        'creditorObligationTest.id',
        'tradeline.userId as tradelineUserId',
      ])
      .where('creditorObligationTest.id', '=', input.id)
      .executeTakeFirst();

    if (!testRecord) {
      throw new BusinessRuleError("Obligation test not found", 404);
    }

    // Ownership check: admin can delete any, users can only delete their own
    if (user.role !== 'admin' && testRecord.tradelineUserId !== user.id) {
      throw new BusinessRuleError("You are not authorized to delete this record", 403);
    }

    const result = await db
      .deleteFrom('creditorObligationTest')
      .where('id', '=', input.id)
      .executeTakeFirst();

    const success = result.numDeletedRows > 0;

    if (!success) {
      throw new BusinessRuleError("Record could not be deleted", 500);
    }

    console.log(`Deleted creditorObligationTest id=${input.id} by user ${user.id}`);

    return new Response(JSON.stringify({ success: true } satisfies OutputType));
  } catch (error) {
    console.error("Error deleting creditor obligation test:", error);
    return handleEndpointError(error);
  }
}