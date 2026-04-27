import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { notifyStatusChange, notifyTicketAssigned } from "../../helpers/supportTicketNotifications";
import { SupportTicketStatus } from "../../helpers/schema";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    if (user.role === "user") {
      throw new BusinessRuleError("Only support agents can update tickets", 403);
    }

    const json = JSON.parse(await request.text());
    const result = schema.parse(json);

    const oldTicket = await db
      .selectFrom("supportTicket")
      .where("id", "=", result.ticketId)
      .selectAll()
      .executeTakeFirst();

    if (!oldTicket) {
      throw new BusinessRuleError("Ticket not found", 404);
    }

    // Validate assignedAgentId if provided and not null
    if (result.assignedAgentId !== undefined && result.assignedAgentId !== null) {
      const agent = await db
        .selectFrom("users")
        .where("id", "=", result.assignedAgentId)
        .where("role", "in", ["support", "admin"])
        .select(["id", "role"])
        .executeTakeFirst();

      if (!agent) {
        throw new BusinessRuleError(
          "Assigned agent not found or does not have a support/admin role",
          400
        );
      }
    }

    const updateValues: {
      updatedAt: Date;
      status?: SupportTicketStatus;
      resolvedAt?: Date;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      assignedAgentId?: number | null;
    } = { updatedAt: new Date() };

    if (result.status) {
      updateValues.status = result.status;
      if (result.status === "RESOLVED" && oldTicket.status !== "RESOLVED") {
        updateValues.resolvedAt = new Date();
      }
    }

    if (result.priority) {
      updateValues.priority = result.priority;
    }

    if (result.assignedAgentId !== undefined) {
      updateValues.assignedAgentId = result.assignedAgentId;
    }

    const updatedTicket = await db
      .updateTable("supportTicket")
      .set(updateValues)
      .where("id", "=", result.ticketId)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Notify for ALL status changes (not just RESOLVED)
    if (result.status && result.status !== oldTicket.status) {
      notifyStatusChange(updatedTicket.id, result.status);
    }

    if (
      result.assignedAgentId !== undefined &&
      result.assignedAgentId !== null &&
      result.assignedAgentId !== oldTicket.assignedAgentId
    ) {
      notifyTicketAssigned(updatedTicket.id, result.assignedAgentId);
    }

    return new Response(JSON.stringify({ ticket: updatedTicket } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}