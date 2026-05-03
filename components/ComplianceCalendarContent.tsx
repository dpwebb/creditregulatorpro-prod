import { Calendar, dateFnsLocalizer, View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "../helpers/dateUtils";
import { Skeleton } from "./Skeleton";
import { ComplianceCalendarToolbar } from "./ComplianceCalendarToolbar";

import "react-big-calendar/lib/css/react-big-calendar.css";
import styles from "./ComplianceCalendarContent.module.css";

// No date-fns locale needed — our dateUtils format ignores the locale param
const enUS = {};
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

interface ComplianceCalendarContentProps {
  events: any[];
  isLoading: boolean;
  view: View;
  date: Date;
  onView: (view: View) => void;
  onNavigate: (date: Date) => void;
  onSelectEvent: (event: any) => void;
  eventStyleGetter: (event: any) => any;
}

export const ComplianceCalendarContent = ({
  events,
  isLoading,
  view,
  date,
  onView,
  onNavigate,
  onSelectEvent,
  eventStyleGetter,
}: ComplianceCalendarContentProps) => {
  return (
    <div className={styles.calendarWrapper}>
      {isLoading ? (
        <div className={styles.loadingState}>
          <Skeleton className="w-full h-full" />
        </div>
      ) : (
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          className={styles.calendarComponent}
          view={view}
          onView={onView}
          date={date}
          onNavigate={onNavigate}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={onSelectEvent}
          components={{
            toolbar: (props) => (
              <ComplianceCalendarToolbar 
                date={props.date} 
                view={props.view} 
                onNavigate={props.onNavigate} 
                onView={props.onView} 
              />
            )
          }}
          popup
        />
      )}
    </div>
  );
};