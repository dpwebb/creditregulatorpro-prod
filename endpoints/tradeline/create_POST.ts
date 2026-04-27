import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { BusinessRuleError, handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    const json = JSON.parse(await request.text());
    const input = schema.parse(json);

    const newTradeline = await db
      .insertInto('tradeline')
      .values({
        bureauId: input.bureauId,
        creditorId: input.creditorId,
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        status: input.status,
        balance: input.balance?.toString(), // Convert number to string for Numeric column
        openedDate: input.openedDate,
        userId: user.id,
        createdAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return new Response(JSON.stringify({ tradeline: newTradeline } satisfies OutputType));
  } catch (error) {
    // Detect FK constraint violations and return a user-friendly 400 instead of leaking raw DB error
    if (
      error instanceof Error &&
      error.message.includes("violates foreign key constraint")
    ) {
      return handleEndpointError(new BusinessRuleError("The specified bureau or creditor does not exist", 400));
    }
    return handleEndpointError(error);
  }
}