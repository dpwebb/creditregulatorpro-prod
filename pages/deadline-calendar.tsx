import React, { Suspense } from "react";
import { PageHeader } from "../components/PageHeader";

import { DeadlineQuickActions } from "../components/DeadlineQuickActions";
import { Skeleton } from "../components/Skeleton";

const DeadlineCalendarView = React.lazy(() => import("../components/DeadlineCalendarView").then(m => ({ default: m.DeadlineCalendarView })));
import { AutoEscalationPanel } from "../components/AutoEscalationPanel";
import { UserRoute } from "../components/ProtectedRoute";
import { useAuth } from "../helpers/useAuth";
import styles from "./deadline-calendar.module.css";

export default function DeadlineCalendarPage() {
  
  const { authState } = useAuth();
  const isAdmin = authState.type === "authenticated" && authState.user.role === "admin";

  return (
    <UserRoute>
      <div className={styles.container}>
        <PageHeader
          title="Upcoming Deadlines"
          subtitle="See what's coming up and what needs your attention."
          
        >
          <DeadlineQuickActions />
        </PageHeader>

        <div className={styles.contentGrid}>
          <div className={styles.calendarSection}>
            <Suspense fallback={<Skeleton style={{ height: "600px", width: "100%" }} />}>
              <DeadlineCalendarView />
            </Suspense>
          </div>
          
          {isAdmin && (
            <div className={styles.sidebarSection}>
              <AutoEscalationPanel />
            </div>
          )}
        </div>
      </div>
    </UserRoute>
  );
}