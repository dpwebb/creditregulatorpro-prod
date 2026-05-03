import { Database, History, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "../helpers/dateUtils";
import { RetentionStats } from "../helpers/adminRetentionApi";
import { Skeleton } from "./Skeleton";
import { Badge } from "./Badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableContainer } from "./Table";
import styles from "./DataRetentionStats.module.css";

interface Props {
  stats?: RetentionStats;
  isLoading: boolean;
  lastRunSource?: "AUTOMATED" | "MANUAL" | null;
}

const TABLE_NAME_MAPPING: Record<string, string> = {
  "report_artifact": "Credit Reports",
  "tradeline": "Tradelines",
  "packet": "Dispute Packets",
  "evidence_event": "Evidence Logs",
  "audit_log": "Audit Logs",
};

export const DataRetentionStats = ({ stats, isLoading, lastRunSource }: Props) => {
  const hasEligibleData = (stats?.eligibleForDeletion ?? 0) > 0;

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.statsGrid}>
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonCard} />
        </div>
        <Skeleton style={{ height: "200px", width: "100%", borderRadius: "12px" }} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <div className={styles.statLabel}>
              <Database size={14} className={styles.icon} />
              Eligible for Deletion
            </div>
            {hasEligibleData ? (
              <Badge variant="warning">Action Required</Badge>
            ) : (
              <Badge variant="success">Clean</Badge>
            )}
          </div>
          <div className={styles.statValue}>
            {stats?.eligibleForDeletion ?? 0}
            <span className={styles.statUnit}>records</span>
          </div>
          <div className={styles.statSubtext}>
            Older than 1 year (12+ months)
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <div className={styles.statLabel}>
              <History size={14} className={styles.icon} />
              Last Enforcement
            </div>
            {stats?.lastRun && lastRunSource && (
              <Badge variant={lastRunSource === "AUTOMATED" ? "info" : "default"}>
                {lastRunSource === "AUTOMATED" ? "Automated" : "Manual"}
              </Badge>
            )}
          </div>
          <div className={styles.statValue}>
            {stats?.lastRun ? (
              format(new Date(stats.lastRun), "MMM d, yyyy")
            ) : (
              "Never"
            )}
          </div>
          <div className={styles.statSubtext}>
            {stats?.lastRun ? format(new Date(stats.lastRun), "h:mm a") : "No history available"}
          </div>
        </div>
      </div>

      <div className={styles.breakdownSection}>
        <h3 className={styles.sectionTitle}>Data Breakdown</h3>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data Type</TableHead>
                <TableHead>System Table</TableHead>
                <TableHead className={styles.alignRight}>Eligible Records</TableHead>
                <TableHead className={styles.alignRight}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats?.breakdown.map((item) => (
                <TableRow key={item.table}>
                  <TableCell className={styles.dataTypeCell}>
                    {TABLE_NAME_MAPPING[item.table] || item.table}
                  </TableCell>
                  <TableCell className={styles.systemTableCell}>
                    <code>{item.table}</code>
                  </TableCell>
                  <TableCell className={styles.countCell}>
                    {item.count}
                  </TableCell>
                  <TableCell className={styles.statusCell}>
                    {item.count > 0 ? (
                      <div className={styles.statusWarning}>
                        <AlertTriangle size={14} />
                        <span>Pending Purge</span>
                      </div>
                    ) : (
                      <div className={styles.statusOk}>
                        <CheckCircle size={14} />
                        <span>Compliant</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!stats?.breakdown || stats.breakdown.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} style={{ textAlign: "center", color: "var(--muted-foreground)" }}>
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
};