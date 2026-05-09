import React, { useEffect, useState } from "react";
import { format } from "../helpers/dateUtils";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../helpers/useAuth";
import {
  Search,
  Users,
  User,
  CheckCircle2,
  XCircle,
  FileText,
  Activity,
  Shield,
  RotateCcw,
  MoreHorizontal,
  UserPlus,
  Headset,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../helpers/useToast";
import { useAdminResetUser } from "../helpers/useAdminResetUser";
import { AdminUsersOutput } from "../helpers/adminQueries";
import { Button } from "../components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/DropdownMenu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/Dialog";

import { Badge } from "../components/Badge";
import { Input } from "../components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/Select";
import { Spinner } from "../components/Spinner";
import { useAdminUsers } from "../helpers/adminQueries";
import { useDebounce } from "../helpers/useDebounce";
import { useCreateSupportAgent } from "../helpers/supportTicketQueries";

import { UserRoleArrayValues } from "../helpers/schema";
import styles from "./admin-user-management.module.css";

export default function AdminUserManagementPage() {
  const PAGE_SIZE = 25;
  const { authState } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("ALL");
  const [page, setPage] = useState(0);

  const { showSuccess, showError } = useToast();
  const resetUserMutation = useAdminResetUser();
  const [resetTarget, setResetTarget] = useState<AdminUsersOutput["users"][number] | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, role]);

  const { data: usersData, isLoading, isError } = useAdminUsers({
    role: role === "ALL" ? undefined : (role as any),
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const users = usersData?.users ?? [];
  const totalUsers = usersData?.total ?? 0;
  const hasPrevPage = page > 0;
  const firstVisible = users.length > 0 ? page * PAGE_SIZE + 1 : 0;
  const lastVisible = page * PAGE_SIZE + users.length;
  const hasNextPage = lastVisible < totalUsers;
  const isResetEmailConfirmed = !!resetTarget && confirmEmail.trim().toLowerCase() === resetTarget.email.trim().toLowerCase();

  const createAgentMutation = useCreateSupportAgent();
  const [isAddAgentOpen, setIsAddAgentOpen] = useState(false);
  const [agentForm, setAgentForm] = useState({ email: "", displayName: "", password: "" });

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault();
    createAgentMutation.mutate(agentForm, {
      onSuccess: (data) => {
        showSuccess(`Successfully created support agent.`, { description: data.user.email });
        setIsAddAgentOpen(false);
        setAgentForm({ email: "", displayName: "", password: "" });
      },
      onError: (err) => {
        showError(err instanceof Error ? err.message : "Failed to create support agent.");
      },
    });
  };

  const handleReset = () => {
    if (!resetTarget) return;
    resetUserMutation.mutate(
      { userId: resetTarget.id },
      {
        onSuccess: (data) => {
          showSuccess(
            `Successfully reset user data. Deleted ${data.deletedReportArtifacts} reports, ${data.deletedTradelines} accounts, and ${data.deletedFreezeRecords} freezes.`,
            { description: `User email: ${data.userEmail}` }
          );
          setResetTarget(null);
          setConfirmEmail("");
        },
        onError: (err) => {
          showError(err instanceof Error ? err.message : "Failed to reset user data.");
        },
      }
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerContainer}>
        <PageHeader
          title={
            <div className={styles.headerTitle}>
              <Users className={styles.headerIcon} />
              User Management
            </div>
          }
          subtitle="Manage users, roles, and view usage statistics."
          
          role={authState.type === "authenticated" ? authState.user.role : undefined}
        />
        <Button onClick={() => setIsAddAgentOpen(true)} className={styles.addAgentBtn}>
          <UserPlus size={16} />
          Add Support Agent
        </Button>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchContainer}>
          <Search className={styles.searchIcon} size={18} />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterGroup}>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className={styles.selectTrigger}>
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Roles</SelectItem>
              {UserRoleArrayValues.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={styles.cardList}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <Spinner size="md" />
            <span>Loading users...</span>
          </div>
        ) : isError ? (
          <div className={styles.errorState}>
            Failed to load users. Please try again.
          </div>
        ) : users.length === 0 ? (
          <div className={styles.emptyState}>
            No users found matching your criteria.
          </div>
        ) : (
          users.map((user) => (
            <div key={user.id} className={styles.userCard}>
              <div className={styles.cardTop}>
                <div className={styles.cardTopLeft}>
                  <div className={styles.userInfo}>
                    <Link to={`/admin-user-management/${user.id}`} className={styles.displayNameLink}>
                      <span className={styles.displayName}>{user.displayName}</span>
                    </Link>
                    <span className={styles.email}>{user.email}</span>
                  </div>
                  <Badge
                    variant={
                      user.role === "admin"
                        ? "primary"
                        : user.role === "support"
                        ? "info"
                        : "default"
                    }
                    className={styles.roleBadge}
                  >
                    {user.role === "admin" && <Shield size={10} />}
                    {user.role === "support" && <Headset size={10} />}
                    {user.role}
                  </Badge>
                  {user.emailVerified ? (
                    <CheckCircle2
                      size={18}
                      className={styles.verifiedIcon}
                      aria-label="Verified"
                    />
                  ) : (
                    <XCircle
                      size={18}
                      className={styles.unverifiedIcon}
                      aria-label="Unverified"
                    />
                  )}
                </div>
                <div className={styles.cardTopRight}>
                  <span className={styles.dateCell}>
                    Joined {format(new Date(user.createdAt), "MMM d, yyyy")}
                  </span>
                </div>
              </div>
              <div className={styles.cardBottom}>
                <div className={styles.statsRow}>
                  <div className={styles.statItem}>
                    <FileText size={14} className={styles.statIcon} />
                    <span>Tradelines: <span className={styles.statValue}>{user.tradelinesCount}</span></span>
                  </div>
                  <div className={styles.statItem}>
                    <FileText size={14} className={styles.statIcon} />
                    <span>Packets: <span className={styles.statValue}>{user.packetsCount}</span></span>
                  </div>
                  <div className={styles.statItem}>
                    <Activity size={14} className={styles.statIcon} />
                    <span>Evidence: <span className={styles.statValue}>{user.evidenceEventsCount}</span></span>
                  </div>
                </div>
                <div className={styles.actionsCell}>
                  {user.role === "admin" ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/admin-user-management/${user.id}`}>View Details</Link>
                    </Button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Actions">
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => navigate(`/admin-user-management/${user.id}`)}>
                          <User size={16} style={{ marginRight: 8 }} />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className={styles.destructiveMenuItem}
                          onClick={() => {
                            setResetTarget(user);
                            setConfirmEmail("");
                          }}
                        >
                          <RotateCcw size={16} style={{ marginRight: 8 }} />
                          Reset User Data
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {!isLoading && !isError && (
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>
            Showing {firstVisible}-{lastVisible} of {totalUsers}
          </span>
          <div className={styles.paginationActions}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(0, prev - 1))}
              disabled={!hasPrevPage}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => prev + 1)}
              disabled={!hasNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isAddAgentOpen} onOpenChange={(open) => { if (!open) setIsAddAgentOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Support Agent</DialogTitle>
            <DialogDescription>
              Create a new support agent account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddAgent}>
            <div className={styles.formGroup}>
              <label htmlFor="agentEmail">Email</label>
              <Input
                id="agentEmail"
                type="email"
                required
                value={agentForm.email}
                onChange={(e) => setAgentForm(prev => ({ ...prev, email: e.target.value }))}
                disabled={createAgentMutation.isPending}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="agentName">Display Name</label>
              <Input
                id="agentName"
                required
                value={agentForm.displayName}
                onChange={(e) => setAgentForm(prev => ({ ...prev, displayName: e.target.value }))}
                disabled={createAgentMutation.isPending}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="agentPassword">Temporary Password</label>
              <Input
                id="agentPassword"
                type="password"
                required
                value={agentForm.password}
                onChange={(e) => setAgentForm(prev => ({ ...prev, password: e.target.value }))}
                disabled={createAgentMutation.isPending}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAddAgentOpen(false)}
                disabled={createAgentMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createAgentMutation.isPending}>
                {createAgentMutation.isPending ? <Spinner size="sm" /> : "Create Agent"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Data</DialogTitle>
            <DialogDescription className={styles.dangerDescription}>
              This will permanently delete ALL credit bureau reports and all derived data (tradelines, packets, obligations, evidence, freezes) for this user. The user account itself will remain intact.
            </DialogDescription>
          </DialogHeader>
          
          {resetTarget && (
            <div className={styles.resetDialogBody}>
              <div className={styles.resetUserInfo}>
                <strong>{resetTarget.displayName}</strong>
                <span>{resetTarget.email}</span>
              </div>
              <div className={styles.confirmSection}>
                <label htmlFor="confirmEmail">Type the user's email to confirm:</label>
                <Input
                  id="confirmEmail"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder={resetTarget.email}
                  disabled={resetUserMutation.isPending}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setResetTarget(null)}
              disabled={resetUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!isResetEmailConfirmed || resetUserMutation.isPending}
              onClick={handleReset}
            >
              {resetUserMutation.isPending ? <Spinner size="sm" /> : "Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
