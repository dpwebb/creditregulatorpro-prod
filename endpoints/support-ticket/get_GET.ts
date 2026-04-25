import { schema, OutputType, MessageWithSender } from "./get_GET.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const query = schema.parse(params);

    const ticketInfo = await db
      .selectFrom("supportTicket")
      .innerJoin("users as owner", "owner.id", "supportTicket.userId")
      .leftJoin("users as agent", "agent.id", "supportTicket.assignedAgentId")
      .selectAll("supportTicket")
      .select(["owner.displayName as userDisplayName", "agent.displayName as assignedAgentName"])
      .where("supportTicket.id", "=", query.id)
      .executeTakeFirst();

    if (!ticketInfo) {
      throw new BusinessRuleError("Ticket not found", 404);
    }

    if (user.role === "user" && ticketInfo.userId !== user.id) {
      throw new BusinessRuleError("Forbidden", 403);
    }

    if (user.role === "support") {
      const isAssigned = ticketInfo.assignedAgentId === user.id;
      const isOpenUnassigned = ticketInfo.assignedAgentId === null && ticketInfo.status === "OPEN";
      if (!isAssigned && !isOpenUnassigned) {
        throw new BusinessRuleError("Forbidden", 403);
      }
    }

    let messagesQuery = db
      .selectFrom("supportTicketMessage")
      .innerJoin("users as sender", "sender.id", "supportTicketMessage.senderId")
      .selectAll("supportTicketMessage")
      .select("sender.displayName as senderDisplayName")
      .where("supportTicketMessage.ticketId", "=", ticketInfo.id)
      .orderBy("supportTicketMessage.createdAt", "asc");

    if (user.role === "user") {
      messagesQuery = messagesQuery.where("supportTicketMessage.isInternalNote", "=", false);
    }

    const messages = await messagesQuery.execute();

    const { userDisplayName, assignedAgentName, ...ticket } = ticketInfo;

    return new Response(
      JSON.stringify({
        ticket,
        userDisplayName,
        assignedAgentName,
        messages: messages satisfies MessageWithSender[],
      } satisfies OutputType),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return handleEndpointError(error);
  }
}