import React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { useAuth } from "../helpers/useAuth";

import AnalyticsDashboardPage from "./analytics-dashboard";
import DisputeRotationAnalyticsPage from "./dispute-rotation-analytics";

import styles from "./progress.module.css";

export default function ProgressPage() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";

  const handleTabChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", value);
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Your Progress | Credit Regulator Pro</title>
      </Helmet>
      
      {isAdmin ? (
        <Tabs value={currentTab} onValueChange={handleTabChange} className={styles.tabs}>
          <div className={styles.tabsListWrapper}>
            <TabsList className={styles.tabsList}>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="strategy">Strategy Analysis</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            {currentTab === "overview" && <AnalyticsDashboardPage />}
          </TabsContent>
          <TabsContent value="strategy">
            {currentTab === "strategy" && <DisputeRotationAnalyticsPage />}
          </TabsContent>
        </Tabs>
      ) : (
        <AnalyticsDashboardPage />
      )}
    </div>
  );
}