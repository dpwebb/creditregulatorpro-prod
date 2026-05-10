import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "../helpers/dateUtils";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Eye } from "lucide-react";
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
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { getAuditLogs, InputType } from "../endpoints/admin/audit-logs_GET.schema";
import {
  AuditActionTypeArrayValues,
  AuditEntityTypeArrayValues,
  AuditStatusArrayValues,
} from "../helpers/schema";
import { ErrorSeverityValues } from "../helpers/errorSeverity";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./AuditLogViewer.module.css";

const PAGE_SIZE = 50;

export const AuditLogViewer = () => {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    actionType: "",
    entityType: "",
    status: "",
    severity: "",
    startDate: "",
    endDate: "",
    email: "",
    userId: "",
  });
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const debouncedEmail = useDebounce(filters.email, 500);
  const debouncedUserId = useDebounce(filters.userId, 500);

  const queryParams: InputType = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(filters.actionType ? { actionType: filters.actionType as any } : {}),
    ...(filters.entityType ? { entityType: filters.entityType as any } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(filters.severity ? { severity: filters.severity as any } : {}),
    ...(filters.startDate ? { startDate: filters.startDate } : {}),
    ...(filters.endDate ? { endDate: filters.endDate } : {}),
    ...(debouncedEmail ? { email: debouncedEmail } : {}),
    ...(debouncedUserId ? { userId: Number(debouncedUserId) } : {}),
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit", "logs", queryParams],
    queryFn: () => getAuditLogs(queryParams),
    refetchInterval: 30000, // Auto-refresh every 30s
    placeholderData: (previousData) => previousData,
  });

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0); // Reset to first page on filter change
  };

  const getActionBadgeVariant = (action: string) => {
    if (["CREATE", "UPLOAD", "RESPONSE_RECORDED"].includes(action)) return "success";
    if (["DELETE", "EXHAUSTION_REACHED", "LOGIN_FAILED"].includes(action)) return "error";
    if (["LOGIN", "LOGOUT", "DOWNLOAD"].includes(action)) return "info";
    if (["UPDATE", "CHALLENGE_UPDATED"].includes(action)) return "warning";
    return "default";
  };

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label}>Action Type</label>
          <select
            aria-label="Action Type"
            className={styles.select}
            value={filters.actionType}
            onChange={(e) => handleFilterChange("actionType", e.target.value)}
          >
            <option value="">All Actions</option>
            {AuditActionTypeArrayValues.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Entity Type</label>
          <select
            aria-label="Entity Type"
            className={styles.select}
            value={filters.entityType}
            onChange={(e) => handleFilterChange("entityType", e.target.value)}
          >
            <option value="">All Entities</option>
            {AuditEntityTypeArrayValues.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Status</label>
          <select
            aria-label="Status"
            className={styles.select}
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
          >
            <option value="">All Statuses</option>
            {AuditStatusArrayValues.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Error Severity</label>
          <select
            aria-label="Error Severity"
            className={styles.select}
            value={filters.severity}
            onChange={(e) => handleFilterChange("severity", e.target.value)}
          >
            <option value="">All Severities</option>
            {ErrorSeverityValues.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Start Date</label>
          <input
            aria-label="Start Date"
            type="date"
            className={styles.input}
            value={filters.startDate}
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>End Date</label>
          <input
            aria-label="End Date"
            type="date"
            className={styles.input}
            value={filters.endDate}
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>User Email</label>
          <input
            aria-label="User Email"
            type="text"
            className={styles.input}
            placeholder="Search email..."
            value={filters.email}
            onChange={(e) => handleFilterChange("email", e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>User ID</label>
          <input
            aria-label="User ID"
            type="number"
            min="1"
            className={styles.input}
            placeholder="Exact ID"
            value={filters.userId}
            onChange={(e) => handleFilterChange("userId", e.target.value)}
          />
        </div>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Error Severity</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="w-32" /></TableCell>
                  <TableCell><Skeleton className="w-40" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-12" /></TableCell>
                  <TableCell><Skeleton className="w-20" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-16" /></TableCell>
                </TableRow>
              ))
            ) : data?.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} style={{ textAlign: "center", padding: "2rem" }}>
                  No audit logs found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              data?.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>{log.userEmail || log.userDisplayName || "System"}</TableCell>
                  <TableCell>
                    <Badge variant={getActionBadgeVariant(log.actionType)}>
                      {log.actionType}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.entityType}</TableCell>
                  <TableCell>{log.entityId || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === "SUCCESS" ? "success" : "error"}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.errorSeverity || "-"}</TableCell>
                  <TableCell>{log.ipAddress || "-"}</TableCell>
                  <TableCell>
                    {log.details && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`View details for audit log ${log.id}`}
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye size={14} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <div className={styles.pagination}>
        <div className={styles.pageInfo}>
          Showing {page * PAGE_SIZE + 1} to{" "}
          {Math.min((page + 1) * PAGE_SIZE, data?.total || 0)} of {data?.total || 0} entries
          {isFetching && <span className="ml-2 opacity-50">(Refreshing...)</span>}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || isLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || (page + 1) * PAGE_SIZE >= data.total || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog.Root open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <Dialog.Title className={styles.dialogTitle}>Log Details</Dialog.Title>
            <div className={styles.jsonContainer}>
              <pre>{JSON.stringify(selectedLog?.details, null, 2)}</pre>
            </div>
            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={() => setSelectedLog(null)}>Close</Button>
            </div>
            <Dialog.Close asChild>
              <button className={styles.dialogClose} aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
