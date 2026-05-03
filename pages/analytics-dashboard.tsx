import { useState } from "react";
import { PageHeader } from "../components/PageHeader";

import { SuccessMetricsCard } from "../components/SuccessMetricsCard";
import { ExportDropdown } from "../components/ExportDropdown";
import { UserRoute } from "../components/ProtectedRoute";
import { useAnalyticsStats } from "../helpers/analyticsQueries";
import { generateAnalyticsReportPDF } from "../helpers/analyticsReportGenerator";
import { useToast } from "../helpers/useToast";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { AnalyticsEmptyState } from "../components/AnalyticsEmptyState";
import { Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/Select";
import styles from "./analytics-dashboard.module.css";

// We'll define a simple Select component inline if not available, but usually it exists. 
// However, the context didn't provide Select. 
// I will use a standard HTML select for the filter to avoid creating too many new files if Select is not in context.
// Actually, I should check context... Select is NOT in provided components.
// I'll stick to standard HTML select styled with a wrapper class.

export default function AnalyticsDashboardPage() {
  const { data: analyticsData, isLoading } = useAnalyticsStats();
  const { showSuccess, showError } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  
  const [dateRange, setDateRange] = useState("30");

  const handleExportReport = async () => {
    if (!analyticsData) {
      showError("Analytics data not available");
      return;
    }

    setIsExporting(true);
    try {
      const pdfBase64 = await generateAnalyticsReportPDF({
        data: analyticsData,
        title: "Success Analytics Report",
      });

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `analytics_report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();

      showSuccess("Analytics report generated successfully");
    } catch (err) {
      console.error(err);
      showError("Failed to generate analytics report");
    } finally {
      setIsExporting(false);
    }
  };

  const hasData = analyticsData && analyticsData.overall.totalDisputes > 0;

  return (
    <UserRoute>
      <div className={styles.container}>
        <PageHeader
          title="How You're Doing"
          subtitle="See how your disputes are going and what's working."
          
        >
          <div className={styles.actions}>
            <div className={styles.filterGroup}>
              <Calendar size={16} className={styles.filterIcon} />
              <select 
                className={styles.dateSelect}
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <ExportDropdown 
              onExportPDF={handleExportReport}
              label="Export Analytics"
              isExporting={isExporting}
            />
          </div>
        </PageHeader>

        {/* Overall Metrics - Always Visible */}
        <div className={styles.metricsSection}>
          <SuccessMetricsCard scope="overall" title="Overall Results" />
        </div>

        {/* Main Content Area */}
        <div className={styles.contentSection}>
          {!isLoading && !hasData ? (
            <AnalyticsEmptyState onRefresh={() => window.location.reload()} />
          ) : (
            <Tabs defaultValue="vector" className={styles.tabs}>
              <div className={styles.tabsHeader}>
                <TabsList>
                  <TabsTrigger value="vector">By Strategy</TabsTrigger>
                  <TabsTrigger value="violation">By Problem Type</TabsTrigger>
                  <TabsTrigger value="creditor">By Creditor</TabsTrigger>
                  <TabsTrigger value="bureau">By Company</TabsTrigger>
                </TabsList>
              </div>

              <div className={styles.tabContentWrapper}>
                <TabsContent value="vector" className={styles.tabContent}>
                  <SuccessMetricsCard scope="vector" title="Results by Strategy" />
                </TabsContent>

                <TabsContent value="violation" className={styles.tabContent}>
                  <SuccessMetricsCard scope="violation" title="Results by Problem Type" />
                </TabsContent>

                <TabsContent value="creditor" className={styles.tabContent}>
                  <SuccessMetricsCard scope="creditor" title="Results by Creditor" />
                </TabsContent>

                <TabsContent value="bureau" className={styles.tabContent}>
                  <SuccessMetricsCard scope="bureau" title="Results by Company" />
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </div>
    </UserRoute>
  );
}