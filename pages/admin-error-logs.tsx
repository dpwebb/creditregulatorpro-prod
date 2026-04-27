import React, { useState } from "react";
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

import { AuditActionTypeArrayValues, AuditEntityTypeArrayValues } from "../helpers/schema";
import styles from "./admin-error-logs.module.css";

const PAGE_SIZE = 100;

function humanizeActionType(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminErrorLogsPage() {
  const { authState } = useAuth();
  
  const [emailSearch, setEmailSearch] = useState("");
  const [actionType, setActionType] = useState<string>("ALL");
  const [entityType, setEntityType] = useState<string>("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);

  const debouncedEmail = useDebounce(emailSearch, 500);

  const { data, isFetching, isError } = useAuditLogs({
    status: "FAILURE",
    actionType: actionType === "ALL" ? undefined : actionType,
    entityType: entityType === "ALL" ? undefined : entityType,
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
    handleFilterChange(() => {
      setEmailSearch("");
      setActionType("ALL");
      setEntityType("ALL");
      setStartDate("");
      setEndDate("");
    });
  };

  const getEmailDisplay = (log: any) => {
    if (log.userEmail) return log.userEmail;
    if (log.details && typeof log.details === "object" && "email" in log.details && typeof log.details.email === "string") {
      return `${log.details.email} (attempted)`;
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
        subtitle="Review failed actions, system errors, and exceptions."
        role={authState.type === "authenticated" ? authState.user.role : undefined}
      />

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
            variant="ghost" 
            onClick={handleClearFilters}
            className={styles.clearFiltersBtn}
            title="Clear all filters"
          >
            <RotateCcw size={16} />
            <span className={styles.clearFiltersText}>Clear</span>
          </Button>
        </div>
      </div>

      <div className={styles.cardList}>
        {isFetching && logs.length === 0 ? (
          <div className={styles.stateCard}>
            <Spinner size="md" />
            <span>Loading errors...</span>
          </div>
        ) : isError ? (
          <div className={styles.stateCard}>
            <XCircle size={48} className={styles.errorStateIcon} />
            <p>Failed to load error logs. Please try again.</p>
          </div>
        ) : logs.length === 0 ? (
          <div className={styles.stateCard}>
            <ShieldCheck size={48} className={styles.emptyIcon} />
            <h3>No Errors Found</h3>
            <p>Great news! There are no recorded system failures matching your criteria.</p>
          </div>
        ) : (
          logs.map((log) => {
            const isExpanded = expandedRows.has(log.id);
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
                  <Badge variant="default" className={styles.entityBadge}>
                    {log.entityType}
                  </Badge>
                  <span className={styles.actionText}>{humanizeActionType(log.actionType)}</span>
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
                        {log.errorMessage}
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
                        <span>Region: {log.region}</span>
                        <span>IP: {log.ipAddress || "—"}</span>
                        <span>User Agent: {log.userAgent || "—"}</span>
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
            Showing {showingFrom}–{showingTo} of {total}
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