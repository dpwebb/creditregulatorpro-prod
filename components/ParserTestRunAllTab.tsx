import React from "react";
import { Play } from "lucide-react";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import styles from "./ParserTestRunAllTab.module.css";

interface ParserTestRunAllTabProps {
  runAllSummary: any;
  isRunning: boolean;
  onRunAll: () => void;
  onViewFailure: (id: number) => void;
}

export function ParserTestRunAllTab({
  runAllSummary,
  isRunning,
  onRunAll,
  onViewFailure
}: ParserTestRunAllTabProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className="text-lg font-semibold">Regression Testing</h3>
          <p className="text-muted-foreground">Run all test cases to ensure no regressions.</p>
        </div>
        <Button onClick={onRunAll} disabled={isRunning}>
          {isRunning ? <Spinner size="sm" /> : <Play size={16} />}
          Run All Tests
        </Button>
      </div>

      {runAllSummary && (
        <div className={styles.summaryCard}>
          <div className={styles.summaryStats}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Total</span>
              <span className={styles.statValue}>{runAllSummary.total}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Passed</span>
              <span className={`${styles.statValue} text-success`}>{runAllSummary.passed}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Failed</span>
              <span className={`${styles.statValue} text-destructive`}>{runAllSummary.failed}</span>
            </div>
          </div>

          {runAllSummary.failures.length > 0 && (
            <div className={styles.failuresList}>
              <h4 className="font-medium mb-2">Failures</h4>
              {runAllSummary.failures.map((fail: any) => (
                <div key={fail.id} className={styles.failureItem}>
                  <span className="font-medium">{fail.name}</span>
                  <span className="text-sm text-muted-foreground">{fail.reason}</span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => onViewFailure(fail.id)}
                  >
                    View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}