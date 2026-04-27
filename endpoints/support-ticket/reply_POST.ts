import { schema, OutputType } from "./reply_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { notifyTicketReply } from "../../helpers/supportTicketNotifications";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const ticket = await db
      .selectFrom("supportTicket")
      .where("id", "=", result.ticketId)
      .selectAll()
      .executeTakeFirst();

    if (!ticket) {
      throw new BusinessRuleError("Ticket not found", 404);
    }

    if (user.role === "user" && ticket.userId !== user.id) {
      throw new BusinessRuleError("Forbidden", 403);
    }

    // Block replies to CLOSED tickets entirely
    if (ticket.status === "CLOSED") {
      throw new BusinessRuleError("Cannot reply to a closed ticket", 400);
    }

    const isInternalNote = user.role !== "user" ? (result.isInternalNote ?? false) : false;

    const newMessage = await db
      .insertInto("supportTicketMessage")
      .values({
        ticketId: result.ticketId,
        senderId: user.id,
        senderRole: user.role,
        message: result.message,
        isInternalNote,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    let newStatus = ticket.status;

    if (!isInternalNote) {
      if (user.role !== "user") {
        // Agent replies: move OPEN tickets to IN_PROGRESS
        if (ticket.status === "OPEN") {
          newStatus = "IN_PROGRESS";
        }
      } else {
        // User replies: move WAITING_ON_USER or RESOLVED tickets back to IN_PROGRESS
        if (ticket.status === "WAITING_ON_USER" || ticket.status === "RESOLVED") {
          newStatus = "IN_PROGRESS";
        }
      }
    }

    await db
      .updateTable("supportTicket")
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where("id", "=", ticket.id)
      .execute();

    if (!isInternalNote) {
      notifyTicketReply(ticket.id, user.displayName, user.role !== "user");
    }

    return new Response(JSON.stringify({ message: newMessage } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}