import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";

import ComplianceCalendarPage from "./compliance-calendar";
import DeadlineCalendarPage from "./deadline-calendar";

import styles from "./calendar.module.css";

export default function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "calendar";

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Calendar & Deadlines | Credit Regulator Pro</title>
      </Helmet>
      
      <Tabs value={currentTab} onValueChange={handleTabChange} className={styles.tabs}>
        <div className={styles.tabsListWrapper}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="deadlines">Deadline List</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="calendar">
          {currentTab === "calendar" && <ComplianceCalendarPage />}
        </TabsContent>
        <TabsContent value="deadlines">
          {currentTab === "deadlines" && <DeadlineCalendarPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}