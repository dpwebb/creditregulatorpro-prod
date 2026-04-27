import { schema, OutputType } from "./create_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { notifyNewTicket } from "../../helpers/supportTicketNotifications";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    
    if (user.role !== "user") {
      throw new BusinessRuleError("Only users can create tickets", 403);
    }

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const newTicket = await db
      .insertInto("supportTicket")
      .values({
        userId: user.id,
        subject: result.subject,
        description: result.description,
        category: result.category,
        priority: result.priority ?? "MEDIUM",
        status: "OPEN",
        region: "CA",
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    notifyNewTicket(newTicket.id);

    return new Response(JSON.stringify({ ticket: newTicket } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}