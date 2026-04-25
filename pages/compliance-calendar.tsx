import React, { useState, useEffect, Suspense } from "react";
import type { View } from "react-big-calendar";
import { format } from "../helpers/dateUtils";

const ComplianceCalendarContent = React.lazy(() => 
  import("../components/ComplianceCalendarContent").then(m => ({ default: m.ComplianceCalendarContent }))
);
import { 
  RefreshCw,
  X
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { HelpTooltip } from "../components/HelpTooltip";
import { Skeleton } from "../components/Skeleton";
import { useRegulatoryUpdates } from "../helpers/useRegulatoryUpdates";
import { useToast } from "../helpers/useToast";
import { useCalendarEvents } from "../helpers/useCalendarEvents";
import { useComplianceCalendar } from "../helpers/useComplianceCalendar";
import { usePacketComplianceEvents } from "../helpers/usePacketComplianceEvents";
import { postCheckDeadlines } from "../endpoints/calendar/check-deadlines_POST.schema";
import { ComplianceCalendarStats } from "../components/ComplianceCalendarStats";
import { CalendarEventDialog } from "../components/CalendarEventDialog";

import styles from "./compliance-calendar.module.css";

export default function ComplianceCalendarPage() {
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isCheckingDeadlines, setIsCheckingDeadlines] = useState(false);
  const [showOverdueList, setShowOverdueList] = useState(false);
  const [deadlineStats, setDeadlineStats] = useState<{
    criticalCount: number;
    overdueItems: any[];
  } | null>(null);
  
  const { showSuccess, showError, showWarning } = useToast();

  // Fetch regulatory updates
  const { data: updatesData, isFetching: isLoadingRegulatory } = useRegulatoryUpdates();
  
  // Fetch packet compliance data
  const { data: packetData, isFetching: isLoadingPackets } = useComplianceCalendar();
  
  // Transform to calendar events
  const { events: regulatoryEvents, stats: regulatoryStats } = useCalendarEvents(updatesData?.updates || []);
  const { events: packetEvents, stats: packetStats } = usePacketComplianceEvents(packetData);
  

  // Combine all events
  const allEvents = [...regulatoryEvents, ...packetEvents];
  
  const overduePackets = packetEvents.filter(e => 
    e.resource.eventType === 'OVERDUE' || e.resource.complianceStatus === 'OVERDUE'
  );

  // Calculate total critical count
  const totalCriticalCount = (deadlineStats?.criticalCount || 0) + (packetStats.overdue || 0);

  const isLoading = isLoadingRegulatory || isLoadingPackets;

  // Check deadlines on mount
  useEffect(() => {
    handleCheckDeadlines(true);
  }, []);

  const handleCheckDeadlines = async (silent = false) => {
    try {
      setIsCheckingDeadlines(true);
      const result = await postCheckDeadlines({});
      setDeadlineStats({
        criticalCount: result.criticalCount,
        overdueItems: result.overdueItems
      });
      
      if (!silent) {
        const totalOverdue = result.criticalCount + (packetStats.overdue || 0);
        if (totalOverdue > 0) {
          showError(`Found ${totalOverdue} critical overdue items!`, { duration: 5000 });
        } else {
          showSuccess("All deadlines are currently met.");
        }
      }
    } catch (error) {
      console.error("Failed to check deadlines:", error);
      if (!silent) showError("Failed to check deadlines");
    } finally {
      setIsCheckingDeadlines(false);
    }
  };

  const handleNavigate = (newDate: Date) => {
    setDate(newDate);
  };

  const handleViewChange = (newView: View) => {
    setView(newView);
  };

  const eventStyleGetter = (event: any) => {
    return {
      style: {
        backgroundColor: event.color,
        borderRadius: '4px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  return (
    <div className={styles.container}>
      <PageHeader 
        title="Important Dates" 
        subtitle="See when things are due and what's coming up"
        
      >
        <div className={styles.headerActions}>
          <div className={styles.helpAction}>
            <span className={styles.helpLabel}>
              Auto-Alerts
              <HelpTooltip 
                title="Automatic Escalation"
                content="If nobody responds in 48 hours, we'll send an alert."
              />
            </span>
          </div>
          <Button 
            variant="outline" 
            onClick={() => handleCheckDeadlines(false)}
            disabled={isCheckingDeadlines}
          >
            <RefreshCw size={16} className={isCheckingDeadlines ? styles.spinning : ''} />
            Check Deadlines
          </Button>
        </div>
      </PageHeader>

      {/* Stats Overview */}
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          How Things Are Going
          <HelpTooltip 
            title="Compliance Metrics"
            content="A quick look at all your due dates. Red means you need to act now."
          />
        </h3>
      </div>
      <ComplianceCalendarStats 
        criticalCount={totalCriticalCount} 
        regulatoryStats={regulatoryStats}
        packetStats={packetStats}
        onOverdueClick={() => setShowOverdueList(!showOverdueList)}
      />

      {showOverdueList && (
        <div className={styles.overdueListContainer}>
          <div className={styles.overdueListHeader}>
            <h4 className={styles.overdueListTitle}>Overdue — Act Now</h4>
            <Button variant="outline" onClick={() => setShowOverdueList(false)} className={styles.closeListBtn}>
              <X size={16} />
              <span className="sr-only">Close</span>
            </Button>
          </div>
          
          <div className={styles.overdueListContent}>
            {(!deadlineStats?.overdueItems || deadlineStats.overdueItems.length === 0) && overduePackets.length === 0 ? (
              <div className={styles.emptyState}>No overdue items found.</div>
            ) : (
              <div className={styles.overdueListItems}>
                {deadlineStats?.overdueItems?.map(item => (
                  <div key={`reg-${item.id}`} className={styles.overdueItemCard}>
                    <div className={styles.overdueItemMeta}>Regulatory &bull; {item.jurisdiction} &bull; {item.daysOverdue} days overdue</div>
                    <div className={styles.overdueItemTitle}>{item.title}</div>
                    <div className={styles.overdueItemDetail}>Due: {format(new Date(item.dueDate), "MMM d, yyyy")} &bull; Type: {item.type}</div>
                  </div>
                ))}
                
                {overduePackets.map(item => (
                  <div key={item.id} className={styles.overdueItemCard}>
                    <div className={styles.overdueItemMeta}>Packet &bull; {item.resource.bureauName} &bull; {item.resource.daysOverdue || '?'} days overdue</div>
                    <div className={styles.overdueItemTitle}>{item.title}</div>
                    <div className={styles.overdueItemDetail}>Due: {format(item.start, "MMM d, yyyy")} &bull; Acct: {item.resource.accountNumber}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calendar Container */}
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          Timeline
          <HelpTooltip 
            title="How to Use This Calendar"
            content="You can see things by month, week, or as a list. Click on something to learn more."
          />
        </h3>
        <div className={styles.legend}>
           <span className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: 'var(--error)' }}></span>
              Overdue
           </span>
           <span className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: 'var(--warning)' }}></span>
              Due Soon
           </span>
           <span className={styles.legendItem}>
              <span className={styles.dot} style={{ backgroundColor: 'var(--success)' }}></span>
              Completed
           </span>
           <HelpTooltip 
             title="Event Types" 
             content="You'll see government deadlines and due dates for your dispute letters."
           />
        </div>
      </div>
      <Suspense fallback={<Skeleton className={styles.calendarPlaceholder} />}>
        <ComplianceCalendarContent
          events={allEvents}
          isLoading={isLoading}
          view={view}
          date={date}
          onView={handleViewChange}
          onNavigate={handleNavigate}
          onSelectEvent={(event) => setSelectedEvent(event)}
          eventStyleGetter={eventStyleGetter}
        />
      </Suspense>

      {/* Event Details Dialog */}
      <CalendarEventDialog 
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </div>
  );
}