import React, { useMemo, useState } from "react";
import { format } from "../helpers/dateUtils";
import { useAuth } from "../helpers/useAuth";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Search,
  ServerCrash,
  ShieldCheck,
  XCircle,
  RotateCcw,
  ChevronLeft,
  Layers3,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/Select";
import { Spinner } from "../components/Spinner";
import { useAuditLogs } from "../helpers/adminQueries";
import { useDebounce } from "../helpers/useDebounce";
import {
  AuditActionTypeArrayValues,
  AuditEntityTypeArrayValues,
} from "../helpers/schema";
import { ErrorSeverityValues } from "../helpers/errorSeverity";
import styles from "./admin-error-logs.module.css";

const PAGE_SIZE = 100;

function humanizeActionType(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function initialDateRange() {
  const now = new Date();
  const previousDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    startDate: previousDay.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

function getSeverityBadgeVariant(severity: string | null | undefined) {
  if (severity === "CRITICAL") return "error";
  if (severity === "HIGH") return "warning";
  if (severity === "MEDIUM") return "info";
  return "default";
}

export default function AdminErrorLogsPage() {
  const { authState } = useAuth();
  const defaultRange = initialDateRange();

  const [emailSearch, setEmailSearch] = useState("");
  const [actionType, setActionType] = useState<string>("ALL");
  const [entityType, setEntityType] = useState<string>("ALL");
  const [severity, setSeverity] = useState<string>("ALL");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [hideDuplicates, setHideDuplicates] = useState(false);

  const debouncedEmail = useDebounce(emailSearch, 500);

  const { data, isFetching, isError } = useAuditLogs({
    status: "FAILURE",
    actionType: actionType === "ALL" ? undefined : (actionType as any),
    entityType: entityType === "ALL" ? undefined : (entityType as any),
    severity: severity === "ALL" ? undefined : (severity as any),
    email: debouncedEmail || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, total);

  const fingerprintCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      const key = log.errorFingerprint || `id-${log.id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [logs]);

  const visibleLogs = useMemo(() => {
    if (!hideDuplicates) return logs;
    const seen = new Set<string>();
    const deduped: typeof logs = [];
    for (const log of logs) {
      const key = log.errorFingerprint || `id-${log.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(log);
    }
    return deduped;
  }, [hideDuplicates, logs]);

  const severitySummary = useMemo(() => {
    const counts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const log of logs) {
      if (log.errorSeverity && log.errorSeverity in counts) {
        counts[log.errorSeverity as keyof typeof counts]++;
      }
    }
    return counts;
  }, [logs]);

  const toggleRow = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleFilterChange = (fn: () => void) => {
    setPage(0);
    fn();
  };

  const handleClearFilters = () => {
    const nextRange = initialDateRange();
    handleFilterChange(() => {
      setEmailSearch("");
      setActionType("ALL");
      setEntityType("ALL");
      setSeverity("ALL");
      setStartDate(nextRange.startDate);
      setEndDate(nextRange.endDate);
    });
  };

  const getEmailDisplay = (log: any) => {
    if (log.userEmail) return log.userEmail;
    if (
      log.details &&
      typeof log.details === "object" &&
      "email" in log.details &&
      typeof (log.details as any).email === "string"
    ) {
      return `${(log.details as any).email} (attempted)`;
    }
    return "System";
  };

  return (
    <div className={styles.container}>
      <PageHeader
        title={
          <div className={styles.headerTitle}>
            <ServerCrash className={styles.headerIcon} />
            System Error Logs
          </div>
        }
        subtitle="Review failed actions, grouped patterns, and error context."
        role={authState.type === "authenticated" ? authState.user.role : undefined}
      />

      <div className={styles.summaryRow}>
        <Badge variant="error">Total: {total}</Badge>
        <Badge variant="error">Critical: {severitySummary.CRITICAL}</Badge>
        <Badge variant="warning">High: {severitySummary.HIGH}</Badge>
        <Badge variant="info">Medium: {severitySummary.MEDIUM}</Badge>
        <Badge variant="default">Low: {severitySummary.LOW}</Badge>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchContainer}>
          <Search className={styles.searchIcon} size={18} />
          <Input
            placeholder="Search by email..."
            value={emailSearch}
            onChange={(e) => handleFilterChange(() => setEmailSearch(e.target.value))}
            className={styles.searchInput}
            type="email"
          />
        </div>

        <div className={styles.filterGroup}>
          <Select value={actionType} onValueChange={(val) => handleFilterChange(() => setActionType(val))}>
            <SelectTrigger className={styles.selectTrigger}>
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Actions</SelectItem>
              {AuditActionTypeArrayValues.map((type) => (
                <SelectItem key={type} value={type}>
                  {humanizeActionType(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={entityType} onValueChange={(val) => handleFilterChange(() => setEntityType(val))}>
            <SelectTrigger className={styles.selectTrigger}>
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Entities</SelectItem>
              {AuditEntityTypeArrayValues.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={severity} onValueChange={(val) => handleFilterChange(() => setSeverity(val))}>
            <SelectTrigger className={styles.selectTrigger}>
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Severities</SelectItem>
              {ErrorSeverityValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className={styles.dateInputWrapper}>
            <Calendar className={styles.inputIcon} size={16} />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => handleFilterChange(() => setStartDate(e.target.value))}
              className={styles.dateInput}
            />
          </div>
          <span className={styles.dateSeparator}>to</span>
          <div className={styles.dateInputWrapper}>
            <Calendar className={styles.inputIcon} size={16} />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => handleFilterChange(() => setEndDate(e.target.value))}
              className={styles.dateInput}
            />
          </div>

          <Button
            variant={hideDuplicates ? "secondary" : "ghost"}
            onClick={() => setHideDuplicates((prev) => !prev)}
            className={styles.groupToggleBtn}
            title="Hide duplicate fingerprints on this page"
          >
            <Layers3 size={16} />
            <span className={styles.groupToggleText}>Hide Duplicates</span>
          </Button>

          <Button
            variant="ghost"
            onClick={handleClearFilters}
            className={styles.clearFiltersBtn}
            title="Clear all filters"
          >
            <RotateCcw size={16} />
            <span className={styles.clearFiltersText}>Reset (Last 24h)</span>
          </Button>
        </div>
      </div>

      <div className={styles.cardList}>
        {isFetching && visibleLogs.length === 0 ? (
          <div className={styles.stateCard}>
            <Spinner size="md" />
            <span>Loading errors...</span>
          </div>
        ) : isError ? (
          <div className={styles.stateCard}>
            <XCircle size={48} className={styles.errorStateIcon} />
            <p>Failed to load error logs. Please try again.</p>
          </div>
        ) : visibleLogs.length === 0 ? (
          <div className={styles.stateCard}>
            <ShieldCheck size={48} className={styles.emptyIcon} />
            <h3>No Errors Found</h3>
            <p>There are no recorded failures matching your criteria.</p>
          </div>
        ) : (
          visibleLogs.map((log) => {
            const isExpanded = expandedRows.has(log.id);
            const fingerprintKey = log.errorFingerprint || `id-${log.id}`;
            const similarCount = fingerprintCounts.get(fingerprintKey) || 1;

            return (
              <div
                key={log.id}
                className={`${styles.card} ${isExpanded ? styles.expanded : ""} ${isFetching ? styles.cardFetching : ""}`}
                onClick={() => toggleRow(log.id)}
              >
                <div className={styles.cardTopRow}>
                  <span className={styles.timestamp}>
                    {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                  </span>
                  <Badge variant={getSeverityBadgeVariant(log.errorSeverity)} className={styles.severityBadge}>
                    {log.errorSeverity || "UNCLASSIFIED"}
                  </Badge>
                  <Badge variant="default" className={styles.entityBadge}>
                    {log.entityType}
                  </Badge>
                  <span className={styles.actionText}>{humanizeActionType(log.actionType)}</span>
                  {similarCount > 1 && (
                    <Badge variant="warning" className={styles.duplicateBadge}>
                      Similar in page: {similarCount}
                    </Badge>
                  )}
                  <span className={styles.userEmail}>
                    {getEmailDisplay(log)}
                  </span>
                </div>

                <div className={styles.cardBottomRow}>
                  <div className={styles.errorMessageTruncated}>
                    <XCircle size={14} className={styles.errorIcon} />
                    {log.errorMessage || "Unknown Error"}
                  </div>
                  <div className={styles.expandIcon}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.cardDetails} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.errorDetailContainer}>
                      <div className={styles.errorHeader}>
                        <AlertTriangle size={20} />
                        <h4>Error Details</h4>
                      </div>
                      <div className={styles.errorMessageFull}>
                        {log.errorMessage || "No error message provided"}
                      </div>
                      {Boolean(log.details) && (
                        <div className={styles.jsonContainer}>
                          <span className={styles.jsonLabel}>Context Data:</span>
                          <pre className={styles.jsonBlock}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </div>
                      )}
                      <div className={styles.metaInfo}>
                        <span>ID: {log.id}</span>
                        <span>Fingerprint: {log.errorFingerprint || "-"}</span>
                        <span>Region: {log.region}</span>
                        <span>Request ID: {log.requestId || "-"}</span>
                        <span>Route: {log.routeContext || "-"}</span>
                        <span>IP: {log.ipAddress || "-"}</span>
                        <span>User Agent: {log.userAgent || "-"}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {total > 0 && (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Showing {showingFrom}-{showingTo} of {total}
            {hideDuplicates && ` (visible on page: ${visibleLogs.length})`}
          </span>
          <div className={styles.paginationControls}>
            <button
              className={styles.paginationBtn}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <span className={styles.paginationPage}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              className={styles.paginationBtn}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || isFetching}
              aria-label="Next page"
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
