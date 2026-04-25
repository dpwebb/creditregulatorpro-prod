import React from "react";
import { Link } from "react-router-dom";
import { useDriftLogs } from "../helpers/changeDetectionQueries";
import { humanizeLabels } from "../helpers/humanizeLabels";
import { formatDistanceToNow } from "../helpers/dateUtils";
import { Skeleton } from "./Skeleton";
import styles from "./AccountChangesSummary.module.css";

interface AccountChangesSummaryProps {
  tradelineId: number;
  maxItems?: number;
  className?: string;
}

export const AccountChangesSummary = ({
  tradelineId,
  maxItems = 5,
  className = "",
}: AccountChangesSummaryProps) => {
  const { data, isLoading, isError } = useDriftLogs(tradelineId);

  if (isLoading) {
    return (
      <div className={`${styles.container} ${className}`}>
        <h3 className={styles.title}>What Changed</h3>
        <div className={styles.skeletonList}>
          <Skeleton className={styles.skeletonItem} />
          <Skeleton className={styles.skeletonItem} />
          <Skeleton className={styles.skeletonItem} />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={`${styles.container} ${className}`}>
        <h3 className={styles.title}>What Changed</h3>
        <p className={styles.emptyText}>Unable to load changes.</p>
      </div>
    );
  }

  const logs = data.logs || [];
  const hasMore = logs.length > maxItems;
  const visibleLogs = logs.slice(0, maxItems);

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>What Changed</h3>
        {hasMore && (
          <Link to="/change-detection" className={styles.seeAllLink}>
            See all
          </Link>
        )}
      </div>
      
      {logs.length === 0 ? (
        <p className={styles.emptyText}>No changes found on this account.</p>
      ) : (
        <ul className={styles.list}>
          {visibleLogs.map((log) => {
            // Extracting plain English description. 
            // We pass null for the date argument so it doesn't embed the date directly in the sentence,
            // allowing us to render it as a muted element below instead.
            const description = humanizeLabels.humanizeChangeDescription(
              log.fieldName || "unknown",
              log.expectedValue,
              log.actualValue,
              null 
            );
            
            const severityClass = 
              log.severity === "ERROR" ? styles.dotError :
              log.severity === "WARNING" ? styles.dotWarning :
              styles.dotInfo;

            return (
              <li key={log.id} className={styles.listItem}>
                <div className={`${styles.dot} ${severityClass}`} />
                <div className={styles.itemContent}>
                  <p className={styles.description}>{description}</p>
                  {log.detectedAt && (
                    <span className={styles.date}>
                      {formatDistanceToNow(log.detectedAt, { addSuffix: true })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};