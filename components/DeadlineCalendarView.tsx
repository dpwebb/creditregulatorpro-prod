import React, { useState } from "react";
import { Calendar, dateFnsLocalizer, Event, View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays, isBefore, isAfter } from "../helpers/dateUtils";
// No date-fns locale needed — our dateUtils format ignores the locale param
const enUS = {};
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useUpcomingDeadlines, useOverdueDeadlines, useCompleteDeadlineMutation } from "../helpers/deadlineQueries";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import "react-big-calendar/lib/css/react-big-calendar.css";
import styles from "./DeadlineCalendarView.module.css";

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format: (date: Date | string, formatStr?: string) => format(new Date(date), formatStr || ""),
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent extends Event {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    type: 'upcoming' | 'overdue';
    eventType: string;
    description: string | null;
    obligationInstanceId: number | null;
    packetId: number | null;
  };
}

export const DeadlineCalendarView: React.FC = () => {
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const { data: upcoming, isLoading: loadingUpcoming } = useUpcomingDeadlines(100);
  const { data: overdue, isLoading: loadingOverdue } = useOverdueDeadlines(100);
  const completeMutation = useCompleteDeadlineMutation();

  const events: CalendarEvent[] = [
    ...(upcoming?.map(d => ({
      id: `upcoming-${d.id}`,
      title: d.title,
      start: new Date(d.deadline),
      end: new Date(d.deadline),
      allDay: true,
      resource: {
        type: 'upcoming' as const,
        eventType: d.eventType,
        description: d.description,
        obligationInstanceId: d.obligationInstanceId,
        packetId: d.packetId
      }
    })) || []),
    ...(overdue?.map(d => ({
      id: `overdue-${d.id}`,
      title: `OVERDUE: ${d.title}`,
      start: new Date(d.deadline),
      end: new Date(d.deadline),
      allDay: true,
      resource: {
        type: 'overdue' as const,
        eventType: d.eventType,
        description: d.description,
        obligationInstanceId: d.obligationInstanceId,
        packetId: d.packetId
      }
    })) || [])
  ];

  const eventPropGetter = (event: CalendarEvent) => {
    const now = new Date();
    const isOverdue = event.resource.type === 'overdue' || isBefore(event.start, now);
    const isUrgent = !isOverdue && isBefore(event.start, addDays(now, 3));
    const isWarning = !isOverdue && !isUrgent && isBefore(event.start, addDays(now, 7));

    let className = styles.eventNormal;
    if (isOverdue) className = styles.eventOverdue;
    else if (isUrgent) className = styles.eventUrgent;
    else if (isWarning) className = styles.eventWarning;

    return { className };
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
  };

  const handleComplete = () => {
    if (selectedEvent) {
      const numericId = parseInt(selectedEvent.id.split('-')[1]);
      completeMutation.mutate({ deadlineEventId: numericId });
      setSelectedEvent(null);
    }
  };

  if (loadingUpcoming || loadingOverdue) {
    return <Skeleton className={styles.skeletonCalendar} />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotOverdue}`} /> Overdue
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotUrgent}`} /> &lt; 3 Days
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotWarning}`} /> &lt; 7 Days
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotNormal}`} /> Upcoming
        </div>
      </div>

      <div className={styles.calendarWrapper}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          eventPropGetter={eventPropGetter}
          onSelectEvent={handleSelectEvent}
          popup
          className={styles.calendar}
        />
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={styles.dialogTitle}>
              {selectedEvent?.resource.type === 'overdue' && <AlertCircle className={styles.iconOverdue} />}
              {selectedEvent?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedEvent?.resource.description || "No description provided."}
            </DialogDescription>
          </DialogHeader>
          
          <div className={styles.eventDetails}>
            <div className={styles.detailRow}>
              <Clock size={16} />
              <span>Deadline: {selectedEvent && format(selectedEvent.start, "PPP")}</span>
            </div>
            {selectedEvent?.resource.obligationInstanceId && (
              <div className={styles.detailRow}>
                <span className={styles.label}>Obligation ID:</span>
                <span>{selectedEvent.resource.obligationInstanceId}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedEvent(null)}>Close</Button>
            <Button onClick={handleComplete} disabled={completeMutation.isPending}>
              <CheckCircle size={16} />
              Mark as Completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};