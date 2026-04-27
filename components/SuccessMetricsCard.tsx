import React from "react";
import { AlertTriangle } from "lucide-react";
import { useSuccessAnalytics } from "../helpers/analyticsQueries";
import { SuccessMetricsOverallView } from "./SuccessMetricsOverallView";
import { SuccessMetricsListView } from "./SuccessMetricsListView";
import { Skeleton } from "./Skeleton";
import { Button } from "./Button";
import styles from "./SuccessMetricsCard.module.css";

interface SuccessMetricsCardProps {
  scope: 'overall' | 'vector' | 'creditor' | 'bureau' | 'violation';
  title: string;
}

export const SuccessMetricsCard: React.FC<SuccessMetricsCardProps> = ({ scope, title }) => {
  const { data, isLoading, error, refetch } = useSuccessAnalytics(scope);

  if (isLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.loadingContainer}>
          <Skeleton className={styles.skeletonChart} />
          <Skeleton className={styles.skeletonTable} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.card}>
        <div className={styles.errorContainer}>
          <AlertTriangle className={styles.errorIcon} />
          <p>Failed to load analytics data</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Render Overall Stats
  if (scope === 'overall' && data && 'totalChallenges' in data && !Array.isArray(data)) {
    return (
      <SuccessMetricsOverallView 
        data={data as {
          totalChallenges: number;
          successRate: number;
          avgResponseDays: number;
          escalationRate: number;
          exhaustionRate: number;
        }} 
      />
    );
  }

  // Render Charts & Tables for list scopes
  if (Array.isArray(data)) {
    return (
      <SuccessMetricsListView 
        data={data} 
        scope={scope as 'vector' | 'creditor' | 'bureau' | 'violation'} 
        title={title} 
      />
    );
  }

  return null;
};