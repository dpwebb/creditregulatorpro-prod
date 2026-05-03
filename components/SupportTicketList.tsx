import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FilterX } from "lucide-react";
import { useSupportTicketList } from "../helpers/supportTicketQueries";
import { useAuth } from "../helpers/useAuth";
import { useDebounce } from "../helpers/useDebounce";
import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./Table";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Input } from "./Input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./Select";
import { Skeleton } from "./Skeleton";
import { formatDistanceToNow } from "../helpers/dateUtils";
import { InputType as ListInput } from "../endpoints/support-ticket/list_GET.schema";
import {
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
} from "../helpers/schema";
import styles from "./SupportTicketList.module.css";

export const formatEnum = (val?: string) => {
  if (!val) return "";
  return val
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
};

export const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case "OPEN":
      return "info";
    case "IN_PROGRESS":
      return "primary";
    case "WAITING_ON_USER":
      return "warning";
    case "RESOLVED":
      return "success";
    case "CLOSED":
      return "default";
    default:
      return "default";
  }
};

export const getPriorityBadgeVariant = (priority: string) => {
  switch (priority) {
    case "LOW":
      return "default";
    case "MEDIUM":
      return "primary";
    case "HIGH":
      return "warning";
    case "URGENT":
      return "error";
    default:
      return "default";
  }
};

const getAgingBadge = (updatedAt: Date) => {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageHours = Math.max(0, Math.floor(ageMs / (60 * 60 * 1000)));
  if (ageHours >= 72) {
    return { label: `Stale ${Math.floor(ageHours / 24)}d`, variant: "error" as const };
  }
  if (ageHours >= 24) {
    return { label: `Stale ${Math.floor(ageHours / 24)}d`, variant: "warning" as const };
  }
  return { label: "Active", variant: "success" as const };
};

export const SupportTicketList = () => {
  const { authState } = useAuth();
  const role = authState.type === "authenticated" ? authState.user.role : "user";
  const navigate = useNavigate();

  const pageSize = 10;
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ListInput>({ limit: pageSize, offset: 0 });
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 400);

  const { data, isPending } = useSupportTicketList({
    ...filters,
    search: debouncedSearch || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const showAgentColumn = role !== "user";

  const updateFilter = (updates: Partial<ListInput>) => {
    setFilters((p) => ({ ...p, ...updates }));
    setPage(0);
  };

  const applyPreset = (preset: "UNASSIGNED" | "HIGH_PRIORITY" | "WAITING" | "OVERDUE" | "CLEAR") => {
    if (preset === "UNASSIGNED") {
      updateFilter({ assignment: "UNASSIGNED", status: undefined, staleHours: undefined });
      return;
    }
    if (preset === "HIGH_PRIORITY") {
      updateFilter({ priority: "HIGH", status: undefined });
      return;
    }
    if (preset === "WAITING") {
      updateFilter({ status: "WAITING_ON_USER", staleHours: undefined });
      return;
    }
    if (preset === "OVERDUE") {
      updateFilter({ staleHours: 48 });
      return;
    }
    setSearchInput("");
    updateFilter({
      status: undefined,
      category: undefined,
      priority: undefined,
      assignment: undefined,
      staleHours: undefined,
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(e.target.value);
    setPage(0);
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchWrapper}>
        <Search className={styles.searchIcon} size={16} />
        <Input
          className={styles.searchInput}
          placeholder="Search by subject or description..."
          value={searchInput}
          onChange={handleSearchChange}
        />
      </div>

      {showAgentColumn && (
        <div className={styles.presetRow}>
          <Button size="sm" variant="outline" onClick={() => applyPreset("UNASSIGNED")}>
            Unassigned
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("HIGH_PRIORITY")}>
            High Priority
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("WAITING")}>
            Waiting on User
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("OVERDUE")}>
            Overdue
          </Button>
          <Button size="sm" variant="ghost" onClick={() => applyPreset("CLEAR")}>
            <FilterX size={14} /> Clear
          </Button>
        </div>
      )}

      <div className={styles.filters}>
        <Select
          value={filters.status || "__empty"}
          onValueChange={(v) =>
            updateFilter({ status: v === "__empty" ? undefined : (v as SupportTicketStatus) })
          }
        >
          <SelectTrigger className={styles.filterSelect}>
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty">All Statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="WAITING_ON_USER">Waiting on User</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.category || "__empty"}
          onValueChange={(v) =>
            updateFilter({ category: v === "__empty" ? undefined : (v as SupportTicketCategory) })
          }
        >
          <SelectTrigger className={styles.filterSelect}>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty">All Categories</SelectItem>
            <SelectItem value="ACCOUNT">Account</SelectItem>
            <SelectItem value="BILLING">Billing</SelectItem>
            <SelectItem value="DISPUTE_HELP">Dispute Help</SelectItem>
            <SelectItem value="TECHNICAL">Technical</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.priority || "__empty"}
          onValueChange={(v) =>
            updateFilter({ priority: v === "__empty" ? undefined : (v as SupportTicketPriority) })
          }
        >
          <SelectTrigger className={styles.filterSelect}>
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty">All Priorities</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>

        {showAgentColumn && (
          <Select
            value={filters.assignment || "__empty"}
            onValueChange={(v) =>
              updateFilter({
                assignment: v === "__empty" ? undefined : (v as ListInput["assignment"]),
              })
            }
          >
            <SelectTrigger className={styles.filterSelect}>
              <SelectValue placeholder="Assignment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty">All Assignments</SelectItem>
              <SelectItem value="MINE">Mine</SelectItem>
              <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
              <SelectItem value="ASSIGNED">Assigned</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              {showAgentColumn && <TableHead>Assigned Agent</TableHead>}
              <TableHead>Aging</TableHead>
              <TableHead>Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className={styles.skeleton} /></TableCell>
                  <TableCell><Skeleton className={styles.skeleton} /></TableCell>
                  <TableCell><Skeleton className={styles.skeleton} /></TableCell>
                  <TableCell><Skeleton className={styles.skeleton} /></TableCell>
                  {showAgentColumn && <TableCell><Skeleton className={styles.skeleton} /></TableCell>}
                  <TableCell><Skeleton className={styles.skeleton} /></TableCell>
                  <TableCell><Skeleton className={styles.skeleton} /></TableCell>
                </TableRow>
              ))
            ) : !data || data.tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showAgentColumn ? 7 : 6} className={styles.emptyState}>
                  No support tickets found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              data.tickets.map((ticket) => {
                const aging = getAgingBadge(ticket.updatedAt);
                return (
                  <TableRow
                    key={ticket.id}
                    onClick={() => navigate(`/support-tickets/${ticket.id}`)}
                    className={styles.row}
                  >
                    <TableCell className={styles.subjectCell}>
                      <div className={styles.subjectText}>{ticket.subject}</div>
                      {role !== "user" && <div className={styles.userName}>{ticket.userDisplayName}</div>}
                      {ticket.latestMessagePreview && (
                        <div className={styles.previewText}>{ticket.latestMessagePreview}</div>
                      )}
                    </TableCell>
                    <TableCell>{formatEnum(ticket.category)}</TableCell>
                    <TableCell>
                      <Badge variant={getPriorityBadgeVariant(ticket.priority)}>{formatEnum(ticket.priority)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(ticket.status)}>{formatEnum(ticket.status)}</Badge>
                    </TableCell>
                    {showAgentColumn && (
                      <TableCell className={styles.agentCell}>
                        {ticket.assignedAgentName || <span className={styles.unassigned}>Unassigned</span>}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={aging.variant}>{aging.label}</Badge>
                    </TableCell>
                    <TableCell className={styles.dateCell}>
                      {formatDistanceToNow(ticket.updatedAt, { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {data && typeof data.total === "number" && (
        <div className={styles.pagination}>
          <span className={styles.paginationText}>
            Showing {data.tickets.length > 0 ? page * pageSize + 1 : 0}-{Math.min((page + 1) * pageSize, data.total)} of {data.total}
          </span>
          <div className={styles.paginationControls}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * pageSize >= data.total}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
