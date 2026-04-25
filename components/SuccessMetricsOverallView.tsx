import React from "react";
import { 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  ShieldAlert,
  AlertTriangle 
} from "lucide-react";
import { DashboardStatCard } from "./DashboardStatCard";
import styles from "./SuccessMetricsOverallView.module.css";

interface SuccessMetricsOverallViewProps {
  data: {
    totalChallenges: number;
    successRate: number;
    avgResponseDays: number;
    escalationRate: number;
    exhaustionRate: number;
  };
}

export const SuccessMetricsOverallView: React.FC<SuccessMetricsOverallViewProps> = ({ data }) => {
  return (
    <div className={styles.statsGrid}>
      <DashboardStatCard
        title="Total Challenges"
        value={data.totalChallenges.toLocaleString()}
        icon={TrendingUp}
        link="/obligations"
        accentColor="primary"
      />
      <DashboardStatCard
        title="Success Rate"
        value={`${data.successRate}%`}
        icon={CheckCircle2}
        link="/analytics-dashboard"
        accentColor="success"
      />
      <DashboardStatCard
        title="Avg Response Time"
        value={`${data.avgResponseDays}d`}
        icon={Clock}
        link="/analytics-dashboard"
        accentColor="info"
      />
      <DashboardStatCard
        title="Escalation Rate"
        value={`${data.escalationRate}%`}
        icon={ShieldAlert}
        link="/deadline-calendar"
        accentColor="warning"
      />
      <DashboardStatCard
        title="Exhaustion Rate"
        value={`${data.exhaustionRate}%`}
        icon={AlertTriangle}
        link="/obligations"
        accentColor="destructive"
      />
    </div>
  );
};