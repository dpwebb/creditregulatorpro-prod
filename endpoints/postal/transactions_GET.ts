import { OutputType } from "./transactions_GET.schema";

import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { getServerUserSession } from "../../helpers/getServerUserSession";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    const transactions = await db
      .selectFrom("postalTransaction")
      .selectAll()
      .where("userId", "=", user.id)
      .orderBy("createdAt", "desc")
      .execute();

    return new Response(
      JSON.stringify({
        transactions,
      } satisfies OutputType)
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}