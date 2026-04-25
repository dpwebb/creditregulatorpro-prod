import React, { useState } from "react";
import { format } from "../helpers/dateUtils";
import { AlertCircle, CheckCircle, Filter, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { Badge } from "./Badge";
import { Spinner } from "./Spinner";
import { useMetro2ValidationLogs } from "../helpers/metro2ValidationQueries";
import { ValidationSeverity } from "../helpers/schema";
import styles from "./Metro2ValidationPanel.module.css";

interface Metro2ValidationPanelProps {
  tradelineId?: number;
  severity?: ValidationSeverity;
  category?: string;
  className?: string;
}

export const Metro2ValidationPanel: React.FC<Metro2ValidationPanelProps> = ({
  tradelineId,
  severity: initialSeverity,
  category: initialCategory,
  className,
}) => {
  const [severityFilter, setSeverityFilter] = useState<
    ValidationSeverity | ""
  >(initialSeverity || "");
  const [categoryFilter, setCategoryFilter] = useState<string>(
    initialCategory || ""
  );

  const { data: logs, isLoading, error } = useMetro2ValidationLogs({
    tradelineId,
    severity: severityFilter || undefined,
    category: categoryFilter || undefined,
  });

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case "ERROR":
        return "error";
      case "WARNING":
        return "warning";
      case "INFO":
        return "info";
      default:
        return "default";
    }
  };

  const getCategoryBadgeVariant = (category: string | null) => {
    const cat = category?.toUpperCase() || "";
    if (cat.includes("DATE")) return "info";
    if (cat.includes("BALANCE")) return "success";
    if (cat.includes("STATUS")) return "warning";
    if (cat.includes("HISTORY")) return "primary";
    if (cat.includes("SEGMENT")) return "warning";
    return "default";
  };

  return (
    <div className={`${styles.panel} ${className || ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Data Deficiency Analysis</h3>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Filter className={styles.filterIcon} size={16} />
            <select
              className={styles.select}
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value as ValidationSeverity | "")
              }
            >
              <option value="">All Severities</option>
              <option value="ERROR">Error</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <select
              className={styles.select}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="DATES">Dates</option>
              <option value="BALANCES">Balances</option>
              <option value="STATUS">Status</option>
              <option value="HISTORY">History</option>
              <option value="SEGMENTS">Segments</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loadingState}>
          <Spinner size="lg" />
          <p>Analyzing Metro2 data for deficiencies...</p>
        </div>
      ) : error ? (
        <div className={styles.errorState}>
          <AlertCircle className={styles.errorIcon} />
          <p>Failed to load analysis logs</p>
        </div>
      ) : !logs || logs.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle className={styles.emptyIcon} />
          <p>No actionable data deficiencies detected matching current filters.</p>
        </div>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Trigger Category</TableHead>
                <TableHead>Rule Name</TableHead>
                <TableHead>Deficiency Details</TableHead>
                <TableHead>Expected / Actual</TableHead>
                <TableHead>Validated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge variant={getSeverityBadgeVariant(log.severity)}>
                      {log.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getCategoryBadgeVariant(log.ruleCategory)}
                    >
                      {log.ruleCategory || "GENERAL"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.cellContent}>
                      <span className={styles.ruleName}>
                        {log.ruleName}
                      </span>
                      {log.metro2Version && (
                        <span className={styles.fieldName}>
                          v{log.metro2Version}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={styles.message}>{log.message}</span>
                  </TableCell>
                  <TableCell>
                    {(log.expectedValue || log.actualValue) && (
                      <div className={styles.comparison}>
                        {log.expectedValue && (
                          <div className={styles.expected}>
                            Exp: {log.expectedValue}
                          </div>
                        )}
                        {log.actualValue && (
                          <div className={styles.actual}>
                            Act: {log.actualValue}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {log.validatedAt
                      ? format(new Date(log.validatedAt), "MMM d, HH:mm")
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
};