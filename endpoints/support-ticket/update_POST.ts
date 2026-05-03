import { schema, OutputType } from "./update_POST.schema";

import { db } from "../../helpers/db";
import { getServerUserSession } from "../../helpers/getServerUserSession";
import { handleEndpointError, BusinessRuleError } from "../../helpers/endpointErrorHandler";
import { notifyStatusChange, notifyTicketAssigned } from "../../helpers/supportTicketNotifications";
import { SupportTicketStatus } from "../../helpers/schema";

const ALLOWED_STATUS_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "WAITING_ON_USER", "RESOLVED", "CLOSED"],
  WAITING_ON_USER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: ["OPEN"],
};

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

    if (result.status && result.status !== oldTicket.status) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[oldTicket.status as SupportTicketStatus] || [];
      if (!allowed.includes(result.status)) {
        throw new BusinessRuleError(
          `Invalid status transition: ${oldTicket.status} -> ${result.status}`,
          400
        );
      }
    }

    const requiresResolutionNote =
      result.status !== undefined &&
      result.status !== oldTicket.status &&
      (result.status === "RESOLVED" || result.status === "CLOSED");

    if (requiresResolutionNote && !result.resolutionNote) {
      throw new BusinessRuleError(
        "Resolution note is required when resolving or closing a ticket",
        400
      );
    }

    const updateValues: {
      updatedAt: Date;
      status?: SupportTicketStatus;
      resolvedAt?: Date | null;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      assignedAgentId?: number | null;
    } = { updatedAt: new Date() };

    if (result.status) {
      updateValues.status = result.status;
      if (result.status === "RESOLVED" && oldTicket.status !== "RESOLVED") {
        updateValues.resolvedAt = new Date();
      }
      if (result.status === "OPEN" || result.status === "IN_PROGRESS" || result.status === "WAITING_ON_USER") {
        updateValues.resolvedAt = null;
      }
    }

    if (result.priority) {
      updateValues.priority = result.priority;
    }

    if (result.assignedAgentId !== undefined) {
      updateValues.assignedAgentId = result.assignedAgentId;
    }

    if (
      result.status === "IN_PROGRESS" &&
      oldTicket.assignedAgentId === null &&
      result.assignedAgentId === undefined
    ) {
      updateValues.assignedAgentId = user.id;
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

    if (requiresResolutionNote && result.resolutionNote) {
      await db.insertInto("supportTicketMessage").values({
        ticketId: updatedTicket.id,
        senderId: user.id,
        senderRole: user.role,
        message: `Resolution Note: ${result.resolutionNote}`,
        isInternalNote: true,
      }).execute();
    }

    return new Response(JSON.stringify({ ticket: updatedTicket } satisfies OutputType), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return handleEndpointError(error);
  }
}
