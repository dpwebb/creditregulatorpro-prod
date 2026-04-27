import { schema, OutputType } from "./compliance-calendar_GET.schema";

import { getServerUserSession } from "../../helpers/getServerUserSession";
import { db } from "../../helpers/db";
import { handleEndpointError } from "../../helpers/endpointErrorHandler";
import { addDays, isAfter, differenceInDays } from "../../helpers/dateUtils";

export async function handle(request: Request) {
  try {
    const { user } = await getServerUserSession(request);

    // 1. Fetch all packets for the current user with necessary joins
    const packets = await db
      .selectFrom("packet")
      .innerJoin("tradeline", "packet.tradelineId", "tradeline.id")
      .leftJoin("bureau", "tradeline.bureauId", "bureau.id")
      .leftJoin(
        "statuteVersion",
        "packet.statuteVersionId",
        "statuteVersion.id"
      )
      .leftJoin("statute", "statuteVersion.statuteId", "statute.id")
      .select([
        "packet.id as packetId",
        "packet.sentDate",
        "packet.bureauResponseDate",
        "packet.status as packetStatus",
        "packet.createdAt",
        "tradeline.accountNumber",
        "bureau.name as bureauName",
        "statuteVersion.responseClockDays",
        "statute.code as statuteCode",
      ])
      .where("tradeline.userId", "=", user.id)
      .execute();

    const events: OutputType["events"] = [];
    const stats: OutputType["stats"] = {
      totalSent: 0,
      awaitingResponse: 0,
      overdue: 0,
      responded: 0,
      pendingSend: 0,
    };

    const now = new Date();

    for (const packet of packets) {
      // Determine Packet Compliance Status
      let complianceStatus: OutputType["events"][0]["complianceStatus"] =
        "PENDING_SEND";
      let dueDate: Date | null = null;
      let daysOverdue: number | null = null;

      if (packet.sentDate && packet.responseClockDays) {
        dueDate = addDays(new Date(packet.sentDate), packet.responseClockDays);
      }

      if (!packet.sentDate) {
        complianceStatus = "PENDING_SEND";
        stats.pendingSend++;
      } else if (packet.bureauResponseDate) {
        complianceStatus = "RESPONDED";
        stats.responded++;
        stats.totalSent++;
      } else {
        // Sent but not responded
        stats.totalSent++;
        if (dueDate && isAfter(now, dueDate)) {
          complianceStatus = "OVERDUE";
          stats.overdue++;
          daysOverdue = differenceInDays(now, dueDate);
        } else {
          complianceStatus = "ON_TIME";
          stats.awaitingResponse++;
        }
      }

      // Common event props
      const baseEvent = {
        packetId: packet.packetId,
        accountNumber: packet.accountNumber,
        bureauName: packet.bureauName ?? "Unknown Bureau",
        complianceStatus,
        daysOverdue,
        statuteCode: packet.statuteCode ?? null,
        timeframeDays: packet.responseClockDays ?? null,
      };

      // Generate Events

      // 1. PACKET_SENT
      if (packet.sentDate) {
        events.push({
          ...baseEvent,
          id: packet.packetId * 10 + 1, // Synthetic ID
          eventType: "PACKET_SENT",
          date: packet.sentDate,
          title: `Packet Sent`,
          description: `Dispute packet sent to ${baseEvent.bureauName}`,
        });
      }

      // 2. RESPONSE_RECEIVED
      if (packet.bureauResponseDate) {
        events.push({
          ...baseEvent,
          id: packet.packetId * 10 + 2,
          eventType: "RESPONSE_RECEIVED",
          date: packet.bureauResponseDate,
          title: `Response Received`,
          description: `Response received from ${baseEvent.bureauName}`,
        });
      }

      // 3. RESPONSE_DUE (The deadline)
      if (dueDate) {
        events.push({
          ...baseEvent,
          id: packet.packetId * 10 + 3,
          eventType: "RESPONSE_DUE",
          date: dueDate,
          title: `Response Due`,
          description: `Statutory deadline for ${baseEvent.bureauName} response`,
        });

        // 4. OVERDUE (If applicable, add an explicit overdue event at the deadline to highlight it)
        if (complianceStatus === "OVERDUE") {
          events.push({
            ...baseEvent,
            id: packet.packetId * 10 + 4,
            eventType: "OVERDUE",
            date: dueDate, // Anchor to the due date so it shows when it became overdue
            title: `Response Overdue`,
            description: `Response from ${baseEvent.bureauName} is ${daysOverdue} days late`,
          });
        }
      }
    }

    // Sort events by date descending
    events.sort((a, b) => b.date.getTime() - a.date.getTime());

    return new Response(
      JSON.stringify({
        events,
        stats,
      } satisfies OutputType)
    );
    } catch (error) {
    return handleEndpointError(error);
  }
}