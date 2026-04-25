import React, { useMemo } from "react";
import { format, formatDistanceToNow } from "../helpers/dateUtils";
import { 
  CalendarClock, 
  ShieldCheck, 
  ShieldAlert, 
  ShieldX, 
  Snowflake, 
  History 
} from "lucide-react";
import { FreezeWithDetails } from "../endpoints/fraud-freeze/list_GET.schema";
import { Badge } from "./Badge";
import { formatFreezeType } from "../helpers/freezeHelpers";
import styles from "./FreezeTimeline.module.css";

interface FreezeTimelineProps {
  freezes: FreezeWithDetails[];
  className?: string;
}

type TimelineEventType = 
  | "requested" 
  | "activated" 
  | "thawed" 
  | "cancelled" 
  | "expired" 
  | "updated";

interface TimelineEvent {
  id: string;
  date: Date;
  type: TimelineEventType;
  bureauName: string;
  freezeType: string;
  notes?: string | null;
  freezeId: number;
}

export const FreezeTimeline: React.FC<FreezeTimelineProps> = ({
  freezes,
  className,
}) => {
  const events = useMemo(() => {
    const timelineEvents: TimelineEvent[] = [];

    freezes.forEach((freeze) => {
      // 1. Request Event (Always present)
      timelineEvents.push({
        id: `req-${freeze.id}`,
        date: new Date(freeze.requestDate),
        type: "requested",
        bureauName: freeze.bureauName,
        freezeType: freeze.freezeType,
        notes: freeze.notes,
        freezeId: freeze.id,
      });

      // 2. Activation Event
      if (freeze.effectiveDate) {
        timelineEvents.push({
          id: `act-${freeze.id}`,
          date: new Date(freeze.effectiveDate),
          type: "activated",
          bureauName: freeze.bureauName,
          freezeType: freeze.freezeType,
          freezeId: freeze.id,
        });
      }

      // 3. Thaw Event
      if (freeze.thawDate) {
        timelineEvents.push({
          id: `thaw-${freeze.id}`,
          date: new Date(freeze.thawDate),
          type: "thawed",
          bureauName: freeze.bureauName,
          freezeType: freeze.freezeType,
          freezeId: freeze.id,
        });
      }

      // 4. Cancellation/Expiration (Derived from status)
      if (freeze.status === "cancelled") {
        // Use updatedAt as proxy for cancellation date if strictly cancelled
        timelineEvents.push({
          id: `can-${freeze.id}`,
          date: new Date(freeze.updatedAt),
          type: "cancelled",
          bureauName: freeze.bureauName,
          freezeType: freeze.freezeType,
          freezeId: freeze.id,
        });
      } else if (freeze.status === "expired" || (freeze.expirationDate && new Date(freeze.expirationDate) < new Date())) {
        timelineEvents.push({
          id: `exp-${freeze.id}`,
          date: freeze.expirationDate ? new Date(freeze.expirationDate) : new Date(freeze.updatedAt),
          type: "expired",
          bureauName: freeze.bureauName,
          freezeType: freeze.freezeType,
          freezeId: freeze.id,
        });
      }
    });

    // Sort by date descending
    return timelineEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [freezes]);

  if (events.length === 0) {
    return (
      <div className={`${styles.emptyState} ${className || ""}`}>
        <History className={styles.emptyIcon} />
        <p>No timeline events recorded yet.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <h3 className={styles.title}>Protection Timeline</h3>
      <div className={styles.timeline}>
        {events.map((event, index) => (
          <TimelineItem 
            key={event.id} 
            event={event} 
            isLast={index === events.length - 1} 
          />
        ))}
      </div>
    </div>
  );
};

const TimelineItem: React.FC<{ event: TimelineEvent; isLast: boolean }> = ({
  event,
  isLast,
}) => {
  const getEventConfig = (type: TimelineEventType) => {
    switch (type) {
      case "requested":
        return {
          icon: <CalendarClock size={16} />,
          label: "Request Submitted",
          colorClass: styles.blue,
          badgeVariant: "info" as const,
        };
      case "activated":
        return {
          icon: <ShieldCheck size={16} />,
          label: "Protection Activated",
          colorClass: styles.green,
          badgeVariant: "success" as const,
        };
      case "thawed":
        return {
          icon: <Snowflake size={16} />,
          label: "Temporary Thaw",
          colorClass: styles.orange,
          badgeVariant: "warning" as const,
        };
      case "cancelled":
        return {
          icon: <ShieldX size={16} />,
          label: "Protection Cancelled",
          colorClass: styles.red,
          badgeVariant: "error" as const,
        };
      case "expired":
        return {
          icon: <ShieldAlert size={16} />,
          label: "Protection Expired",
          colorClass: styles.gray,
          badgeVariant: "default" as const,
        };
      default:
        return {
          icon: <History size={16} />,
          label: "Updated",
          colorClass: styles.gray,
          badgeVariant: "default" as const,
        };
    }
  };

  const config = getEventConfig(event.type);

  return (
    <div className={`${styles.item} ${isLast ? styles.lastItem : ""}`}>
      <div className={styles.leftColumn}>
        <div className={`${styles.iconWrapper} ${config.colorClass}`}>
          {config.icon}
        </div>
        {!isLast && <div className={styles.connector} />}
      </div>
      <div className={styles.contentColumn}>
        <div className={styles.header}>
          <span className={styles.bureauName}>{event.bureauName}</span>
          <span className={styles.timeAgo}>
            {formatDistanceToNow(event.date, { addSuffix: true })}
          </span>
        </div>
        
        <div className={styles.mainContent}>
          <span className={styles.eventLabel}>{config.label}</span>
          <Badge variant={config.badgeVariant} className={styles.badge}>
            {formatFreezeType(event.freezeType as any)}
          </Badge>
        </div>

        <div className={styles.dateDetail}>
          {format(event.date, "PPP p")}
        </div>

        {event.notes && (
          <div className={styles.notes}>
            Note: {event.notes}
          </div>
        )}
      </div>
    </div>
  );
};