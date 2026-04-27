import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "../helpers/dateUtils";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Eye, RefreshCw } from "lucide-react";
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
import { getAuditLogs, InputType } from "../endpoints/audit/log_GET.schema";
import {
  AuditActionTypeArrayValues,
  AuditEntityTypeArrayValues,
} from "../helpers/schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./AuditLogViewer.module.css";

const PAGE_SIZE = 50;

export const AuditLogViewer = () => {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    actionType: "",
    entityType: "",
    startDate: "",
    endDate: "",
    userSearch: "",
  });
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const debouncedUserSearch = useDebounce(filters.userSearch, 500);

  const queryParams: InputType = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(filters.actionType ? { actionType: filters.actionType as any } : {}),
    ...(filters.entityType ? { entityType: filters.entityType as any } : {}),
    ...(filters.startDate ? { startDate: new Date(filters.startDate) } : {}),
    ...(filters.endDate ? { endDate: new Date(filters.endDate) } : {}),
    // Note: userId filtering would require a separate user lookup, 
    // for now we rely on backend search if implemented or just filter by other fields
  };

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audit", "logs", queryParams, debouncedUserSearch],
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

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label}>Action Type</label>
          <select
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
          <label className={styles.label}>Start Date</label>
          <input
            type="date"
            className={styles.input}
            value={filters.startDate}
            onChange={(e) => handleFilterChange("startDate", e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>End Date</label>
          <input
            type="date"
            className={styles.input}
            value={filters.endDate}
            onChange={(e) => handleFilterChange("endDate", e.target.value)}
          />
        </div>

        {/* Note: User search implementation depends on backend support for string search on user email */}
        {/* <div className={styles.filterGroup}>
          <label className={styles.label}>User Search</label>
          <input
            type="text"
            className={styles.input}
            placeholder="Search user..."
            value={filters.userSearch}
            onChange={(e) => handleFilterChange("userSearch", e.target.value)}
          />
        </div> */}
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
                  <TableCell><Skeleton className="w-12" /></TableCell>
                  <TableCell><Skeleton className="w-20" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-16" /></TableCell>
                </TableRow>
              ))
            ) : data?.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>
                  No audit logs found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              data?.logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>{log.userEmail || "System"}</TableCell>
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
                  <TableCell>{log.ipAddress || "-"}</TableCell>
                  <TableCell>
                    {log.details && (
                      <Button
                        variant="ghost"
                        size="sm"
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