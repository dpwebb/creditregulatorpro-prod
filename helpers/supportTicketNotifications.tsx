import { db } from "./db";
import { sendGridEmail } from "./sendGridEmail";

export const notifyNewTicket = async (ticketId: number) => {
  try {
    const ticket = await db
      .selectFrom("supportTicket")
      .where("id", "=", ticketId)
      .select(["subject", "description"])
      .executeTakeFirst();
    if (!ticket) return;

    // Always notify admins
    const admins = await db
      .selectFrom("users")
      .where("role", "=", "admin")
      .select("email")
      .execute();

    // Only notify support agents who have fewer than 10 currently assigned non-closed tickets
    const availableAgents = await db
      .selectFrom("users")
      .where("users.role", "=", "support")
      .select("users.email")
      .where((eb) =>
        eb(
          eb
            .selectFrom("supportTicket as st")
            .select((inner) => inner.fn.countAll<number>().as("assignedCount"))
            .where("st.assignedAgentId", "=", eb.ref("users.id"))
            .where("st.status", "!=", "CLOSED"),
          "<",
          10
        )
      )
      .execute();

    const recipients = [...admins, ...availableAgents];

    for (const recipient of recipients) {
      await sendGridEmail({
        to: recipient.email,
        subject: `New Support Ticket: ${ticket.subject}`,
        html: `
          <p>A new support ticket has been created.</p>
          <p><strong>Subject:</strong> ${ticket.subject}</p>
          <p><a href="https://creditregulatorpro.com/support-tickets/${ticketId}">View Ticket</a></p>
        `,
      }).catch((e) => console.error("Failed to send new ticket notification", e));
    }
  } catch (e) {
    console.error("notifyNewTicket error:", e);
  }
};

export const notifyTicketReply = async (
  ticketId: number,
  senderName: string,
  isAgent: boolean
) => {
  try {
    const ticket = await db
      .selectFrom("supportTicket")
      .innerJoin("users", "users.id", "supportTicket.userId")
      .where("supportTicket.id", "=", ticketId)
      .select([
        "supportTicket.subject",
        "supportTicket.assignedAgentId",
        "users.email as userEmail",
      ])
      .executeTakeFirst();

    if (!ticket) return;

    if (isAgent) {
      // Notify the user who created the ticket
      await sendGridEmail({
        to: ticket.userEmail,
        subject: `New reply on your ticket: ${ticket.subject}`,
        html: `
          <p><strong>${senderName}</strong> has replied to your ticket.</p>
          <p><a href="https://creditregulatorpro.com/support-tickets/${ticketId}">View Reply</a></p>
        `,
      }).catch((e) => console.error("Failed to send reply notification to user", e));
    } else {
      // Notify the assigned agent, if any
      if (ticket.assignedAgentId) {
        const agent = await db
          .selectFrom("users")
          .where("id", "=", ticket.assignedAgentId)
          .select("email")
          .executeTakeFirst();
          
        if (agent) {
          await sendGridEmail({
            to: agent.email,
            subject: `New reply from user on ticket: ${ticket.subject}`,
            html: `
              <p>The user has replied to a ticket assigned to you.</p>
              <p><a href="https://creditregulatorpro.com/support-tickets/${ticketId}">View Reply</a></p>
            `,
          }).catch((e) => console.error("Failed to send reply notification to agent", e));
        }
      }
    }
  } catch (e) {
    console.error("notifyTicketReply error:", e);
  }
};

export const notifyStatusChange = async (ticketId: number, newStatus: string) => {
  try {
    const ticket = await db
      .selectFrom("supportTicket")
      .innerJoin("users", "users.id", "supportTicket.userId")
      .where("supportTicket.id", "=", ticketId)
      .select(["supportTicket.subject", "users.email as userEmail"])
      .executeTakeFirst();

    if (!ticket) return;

    await sendGridEmail({
      to: ticket.userEmail,
      subject: `Ticket Status Update: ${ticket.subject}`,
      html: `
        <p>Your ticket status has been updated to: <strong>${newStatus}</strong>.</p>
        <p><a href="https://creditregulatorpro.com/support-tickets/${ticketId}">View Ticket</a></p>
      `,
    }).catch((e) => console.error("Failed to send status update notification", e));
  } catch (e) {
    console.error("notifyStatusChange error:", e);
  }
};

export const notifyTicketAssigned = async (ticketId: number, agentId: number) => {
  try {
    const ticket = await db
      .selectFrom("supportTicket")
      .where("id", "=", ticketId)
      .select(["subject"])
      .executeTakeFirst();

    if (!ticket) return;

    const agent = await db
      .selectFrom("users")
      .where("id", "=", agentId)
      .select(["email", "displayName"])
      .executeTakeFirst();

    if (!agent) return;

    await sendGridEmail({
      to: agent.email,
      subject: `Ticket Assigned To You: ${ticket.subject}`,
      html: `
        <p>Hello ${agent.displayName},</p>
        <p>A ticket has been assigned to you.</p>
        <p><strong>Subject:</strong> ${ticket.subject}</p>
        <p><a href="https://creditregulatorpro.com/support-tickets/${ticketId}">View Ticket</a></p>
      `,
    }).catch((e) => console.error("Failed to send ticket assignment notification", e));
  } catch (e) {
    console.error("notifyTicketAssigned error:", e);
  }
};