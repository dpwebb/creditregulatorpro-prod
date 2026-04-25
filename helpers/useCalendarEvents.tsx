import { useMemo } from "react";
import { addDays, isPast, isFuture, isSameMonth, isSameWeek, parseISO } from "./dateUtils";
import { OutputType } from "../endpoints/regulatory-update/list_GET.schema";

export type CalendarEventType = 
  | "EFFECTIVE_DATE" 
  | "REVIEW_DEADLINE" 
  | "DETECTED_DATE" 
  | "APPLIED_DATE";

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  color: string;
  resource: {
    update: OutputType["updates"][0];
    eventType: CalendarEventType;
    isOverdue: boolean;
    urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  };
}

// Colors matching the design system
const COLORS = {
  RED: "hsl(350 80% 60%)",      // Overdue / Critical
  ORANGE: "hsl(40 90% 60%)",    // Upcoming / High Urgency
  YELLOW: "hsl(45 90% 50%)",    // Warning / Medium Urgency
  BLUE: "hsl(210 80% 60%)",     // Info / Detection
  GREEN: "hsl(150 70% 50%)",    // Success / Applied
  PURPLE: "hsl(280 80% 60%)",   // Verified / Application Deadline
  GRAY: "hsl(215 20% 50%)",     // Archived / Dismissed
};

export const useCalendarEvents = (updates: OutputType["updates"]) => {
  return useMemo(() => {
    const events: CalendarEvent[] = [];
    const now = new Date();
    
    let dueThisWeek = 0;
    let dueThisMonth = 0;
    let appliedYTD = 0;

    updates.forEach((update) => {
      const jurisdictionPrefix = `[${update.jurisdiction}]`;
      
      // 1. Effective Date Events
      if (update.effectiveDate) {
        const effectiveDate = new Date(update.effectiveDate);
        const isOverdue = isPast(effectiveDate) && 
          !["APPLIED", "DISMISSED", "ARCHIVED"].includes(update.status);
        
        let color = COLORS.BLUE;
        let urgency: CalendarEvent["resource"]["urgency"] = "LOW";

        if (isOverdue) {
          color = COLORS.RED;
          urgency = "CRITICAL";
        } else if (update.status === "VERIFIED") {
          color = COLORS.PURPLE;
          urgency = "HIGH";
        } else if (isFuture(effectiveDate) && addDays(now, 30) > effectiveDate) {
          color = COLORS.ORANGE;
          urgency = "HIGH";
        }

        events.push({
          id: `eff-${update.id}`,
          title: `${jurisdictionPrefix} Effective: ${update.title}`,
          start: effectiveDate,
          end: effectiveDate,
          allDay: true,
          color,
          resource: {
            update,
            eventType: "EFFECTIVE_DATE",
            isOverdue,
            urgency
          }
        });

        // Stats counting
        if (isSameMonth(effectiveDate, now)) dueThisMonth++;
        if (isSameWeek(effectiveDate, now)) dueThisWeek++;
      }

      // 2. Review Deadline Events (Detected + 30 days)
      if (update.detectedAt && update.status === "DETECTED") {
        const detectedDate = new Date(update.detectedAt);
        const reviewDeadline = addDays(detectedDate, 30);
        const isOverdue = isPast(reviewDeadline);
        
        events.push({
          id: `rev-${update.id}`,
          title: `${jurisdictionPrefix} Review Due: ${update.title}`,
          start: reviewDeadline,
          end: reviewDeadline,
          allDay: true,
          color: isOverdue ? COLORS.RED : COLORS.YELLOW,
          resource: {
            update,
            eventType: "REVIEW_DEADLINE",
            isOverdue,
            urgency: isOverdue ? "CRITICAL" : "MEDIUM"
          }
        });

        if (isSameMonth(reviewDeadline, now)) dueThisMonth++;
        if (isSameWeek(reviewDeadline, now)) dueThisWeek++;
      }

      // 3. Detected Date (Informational)
      if (update.detectedAt) {
        const detectedDate = new Date(update.detectedAt);
        events.push({
          id: `det-${update.id}`,
          title: `${jurisdictionPrefix} Detected: ${update.title}`,
          start: detectedDate,
          end: detectedDate,
          allDay: true,
          color: COLORS.BLUE,
          resource: {
            update,
            eventType: "DETECTED_DATE",
            isOverdue: false,
            urgency: "NONE"
          }
        });
      }

      // 4. Applied Date (Historical)
      if (update.appliedAt) {
        const appliedDate = new Date(update.appliedAt);
        events.push({
          id: `app-${update.id}`,
          title: `${jurisdictionPrefix} Applied: ${update.title}`,
          start: appliedDate,
          end: appliedDate,
          allDay: true,
          color: COLORS.GREEN,
          resource: {
            update,
            eventType: "APPLIED_DATE",
            isOverdue: false,
            urgency: "NONE"
          }
        });
        
        if (appliedDate.getFullYear() === now.getFullYear()) {
          appliedYTD++;
        }
      }
    });

    return {
      events,
      stats: {
        dueThisWeek,
        dueThisMonth,
        appliedYTD
      }
    };
  }, [updates]);
};