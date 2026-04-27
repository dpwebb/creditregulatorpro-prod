import React from "react";
import { BarChart2, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import styles from "./AnalyticsEmptyState.module.css";

interface AnalyticsEmptyStateProps {
  title?: string;
  description?: string;
  onRefresh?: () => void;
}

export const AnalyticsEmptyState: React.FC<AnalyticsEmptyStateProps> = ({
  title = "No Analytics Data Available",
  description = "We haven't collected enough data to generate analytics yet. Start by processing some disputes.",
  onRefresh,
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <BarChart2 className={styles.icon} size={48} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {onRefresh && (
        <Button variant="outline" onClick={onRefresh} className={styles.button}>
          <RefreshCw size={16} className="mr-2" />
          Refresh Data
        </Button>
      )}
    </div>
  );
};