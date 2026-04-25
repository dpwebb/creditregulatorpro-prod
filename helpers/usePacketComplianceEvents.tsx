import { useMemo } from "react";
import { addDays, isPast, isSameMonth, isSameWeek, parseISO } from "./dateUtils";
import { OutputType } from "../endpoints/packet/compliance-calendar_GET.schema";

export type PacketCalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  resource: {
    type: "PACKET";
    eventType: "PACKET_SENT" | "RESPONSE_DUE" | "RESPONSE_RECEIVED" | "OVERDUE";
    packetId: number;
    accountNumber: string;
    bureauName: string;
    complianceStatus: string;
    daysOverdue: number | null;
    statuteCode: string | null;
    timeframeDays: number | null;
    description: string;
  };
};

// Colors matching the design system
const COLORS = {
  RED: "hsl(350 80% 60%)",      // Overdue
  ORANGE: "hsl(40 90% 60%)",    // Response Due
  BLUE: "hsl(210 80% 60%)",     // Packet Sent
  GREEN: "hsl(150 70% 50%)",    // Response Received
  GRAY: "hsl(215 20% 50%)",     // Pending
};

export const usePacketComplianceEvents = (data: OutputType | undefined) => {
  return useMemo(() => {
    if (!data) {
      return {
        events: [],
        stats: {
          totalSent: 0,
          awaitingResponse: 0,
          overdue: 0,
          responded: 0,
          dueThisWeek: 0,
          dueThisMonth: 0,
        }
      };
    }

    const events: PacketCalendarEvent[] = [];
    const now = new Date();
    
    let dueThisWeek = 0;
    let dueThisMonth = 0;

    data.events.forEach((event) => {
      const eventDate = new Date(event.date);
      
      let color = COLORS.BLUE;
      let eventType: PacketCalendarEvent["resource"]["eventType"] = "PACKET_SENT";

      // Determine color and type based on event type and compliance status
      if (event.eventType === "OVERDUE") {
        color = COLORS.RED;
        eventType = "OVERDUE";
      } else if (event.eventType === "RESPONSE_DUE") {
        color = COLORS.ORANGE;
        eventType = "RESPONSE_DUE";
        
        if (isSameWeek(eventDate, now)) dueThisWeek++;
        if (isSameMonth(eventDate, now)) dueThisMonth++;
      } else if (event.eventType === "RESPONSE_RECEIVED") {
        color = COLORS.GREEN;
        eventType = "RESPONSE_RECEIVED";
      } else if (event.eventType === "PACKET_SENT") {
        color = COLORS.BLUE;
        eventType = "PACKET_SENT";
      }

      // Override color for overdue status
      if (event.complianceStatus === "OVERDUE" && event.eventType !== "RESPONSE_RECEIVED") {
        color = COLORS.RED;
      }

      events.push({
        id: `packet-${event.id}`,
        title: `[${event.bureauName}] ${event.title}`,
        start: eventDate,
        end: eventDate,
        allDay: true,
        color,
        resource: {
          type: "PACKET",
          eventType,
          packetId: event.packetId,
          accountNumber: event.accountNumber,
          bureauName: event.bureauName,
          complianceStatus: event.complianceStatus,
          daysOverdue: event.daysOverdue,
          statuteCode: event.statuteCode,
          timeframeDays: event.timeframeDays,
          description: event.description,
        }
      });
    });

    return {
      events,
      stats: {
        totalSent: data.stats.totalSent,
        awaitingResponse: data.stats.awaitingResponse,
        overdue: data.stats.overdue,
        responded: data.stats.responded,
        pendingSend: data.stats.pendingSend,
        dueThisWeek,
        dueThisMonth,
      }
    };
  }, [data]);
};