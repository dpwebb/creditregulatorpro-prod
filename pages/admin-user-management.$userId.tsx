import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Shield, CreditCard, CheckCircle2, XCircle, Calendar, Headset, History, FileText, Activity as ActivityIcon, Mail } from "lucide-react";
import { useAdminUserDetail } from "../helpers/useAdminUserDetail";
import { useAdminDeleteUser } from "../helpers/useAdminDeleteUser";
import { useToast } from "../helpers/useToast";
import { formatDate, formatDateTime, formatCurrency } from "../helpers/formatters";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Skeleton } from "../components/Skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "../components/Dialog";
import { Input } from "../components/Input";
import styles from "./admin-user-management.$userId.module.css";

export default function AdminUserDetail() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { userId } = useParams<{ userId: string }>();
  const numericUserId = userId ? parseInt(userId, 10) : undefined;
  const { data, isLoading, isError, error } = useAdminUserDetail(numericUserId);
  const deleteUserMutation = useAdminDeleteUser();
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDeleteUser = () => {
    if (!numericUserId || !data) return;
    deleteUserMutation.mutate(
      { userId: numericUserId, confirmEmail: deleteConfirmEmail },
      {
        onSuccess: (res) => {
          setIsDeleteDialogOpen(false);
          showSuccess(`User ${res.deletedEmail} deleted successfully`);
          navigate("/admin-user-management");
        },
        onError: (err) => {
          showError(err instanceof Error ? err.message : "Failed to delete user");
        }
      }
    );
  };

  if (isError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <XCircle size={48} className={styles.errorIcon} />
          <h2 className={styles.errorTitle}>Failed to load user details</h2>
          <p className={styles.errorDescription}>
            {error instanceof Error ? error.message : "An unknown error occurred"}
          </p>
          <Button asChild variant="outline">
            <Link to="/admin-user-management">
              <ArrowLeft size={16} /> Back to Users
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <Button asChild variant="ghost" className={styles.backButton}>
          <Link to="/admin-user-management">
            <ArrowLeft size={16} /> Back to User Management
          </Link>
        </Button>
      </div>

      {isLoading || !data ? (
        <div className={styles.loadingContainer}>
          <div className={styles.cardsGrid}>
            <Skeleton className={styles.cardSkeleton} />
            <Skeleton className={styles.cardSkeleton} />
          </div>
          <Skeleton className={styles.tabsSkeleton} />
        </div>
      ) : (
        <>
          <div className={styles.cardsGrid}>
            {/* User Profile Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrapper}>
                  <User size={20} className={styles.cardIcon} />
                </div>
                <h3 className={styles.cardTitle}>User Profile</h3>
              </div>
              <div className={styles.cardContent}>
                <div className={styles.profileMain}>
                  {data.user.avatarUrl ? (
                    <img src={data.user.avatarUrl} alt={data.user.displayName} className={styles.avatar} />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {data.user.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className={styles.profileInfo}>
                    <h2 className={styles.displayName}>{data.user.displayName}</h2>
                    <span className={styles.email}>{data.user.email}</span>
                  </div>
                </div>
                
                <div className={styles.profileDetails}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Role</span>
                    <Badge
                      variant={
                        data.user.role === "admin"
                          ? "primary"
                          : data.user.role === "support"
                          ? "info"
                          : "default"
                      }
                      className={styles.roleBadge}
                    >
                      {data.user.role === "admin" && <Shield size={10} />}
                      {data.user.role === "support" && <Headset size={10} />}
                      {data.user.role}
                    </Badge>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Status</span>
                    <div className={styles.statusWrapper}>
                      {data.user.emailVerified ? (
                        <><CheckCircle2 size={16} className={styles.verifiedIcon} /> Verified</>
                      ) : (
                        <><XCircle size={16} className={styles.unverifiedIcon} /> Unverified</>
                      )}
                    </div>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Joined</span>
                    <div className={styles.detailValue}>
                      <Calendar size={14} className={styles.detailIcon} />
                      {formatDate(data.user.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription Card */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrapper}>
                  <CreditCard size={20} className={styles.cardIcon} />
                </div>
                <h3 className={styles.cardTitle}>Subscription</h3>
              </div>
              <div className={styles.cardContent}>
                {data.subscription ? (
                  <div className={styles.subscriptionDetails}>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Plan</span>
                      <span className={styles.detailValue}>
                        {data.subscription.plan.toUpperCase()}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Status</span>
                      <span className={styles.detailValue}>
                        {data.subscription.status.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Price</span>
                      <span className={styles.detailValue}>
                        {data.subscription.priceCad ? formatCurrency(Number(data.subscription.priceCad)) : "Free"}
                      </span>
                    </div>
                    {data.subscription.status === "trialing" && data.subscription.trialEnd && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Trial Ends</span>
                        <span className={styles.detailValue}>{formatDate(data.subscription.trialEnd)}</span>
                      </div>
                    )}
                    {data.subscription.currentPeriodEnd && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Next Billing</span>
                        <span className={styles.detailValue}>{formatDate(data.subscription.currentPeriodEnd)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={styles.emptyCardState}>
                    <CreditCard size={32} className={styles.emptyIcon} />
                    <p>No active subscription record.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className={styles.tabsSection}>
            <Tabs defaultValue="tradelines">
              <TabsList>
                <TabsTrigger value="tradelines">
                  <FileText size={16} className={styles.tabIcon} />
                  Tradelines ({data.tradelines.length})
                </TabsTrigger>
                <TabsTrigger value="packets">
                  <Mail size={16} className={styles.tabIcon} />
                  Dispute Letters ({data.packets.length})
                </TabsTrigger>
                <TabsTrigger value="reports">
                  <History size={16} className={styles.tabIcon} />
                  Reports ({data.reportArtifacts.length})
                </TabsTrigger>
                <TabsTrigger value="activity">
                  <ActivityIcon size={16} className={styles.tabIcon} />
                  Activity ({data.recentActivity.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tradelines" className={styles.tabContent}>
                <div className={styles.listContainer}>
                  {data.tradelines.length === 0 ? (
                    <div className={styles.emptyCard}>No tradelines found.</div>
                  ) : (
                    data.tradelines.map(t => (
                      <div key={t.id} className={styles.listCard}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardHeaderLeft}>
                            <span className={styles.boldText}>{t.creditorName}</span>
                            {t.bureauName && <Badge variant="default">{t.bureauName}</Badge>}
                          </div>
                          <span className={styles.statusText}>{t.status || "-"}</span>
                        </div>
                        <div className={styles.cardBottom}>
                          <span>Balance: {t.balance ? formatCurrency(Number(t.balance)) : "-"}</span>
                          <span>Opened: {t.openedDate ? formatDate(t.openedDate) : "-"}</span>
                          <span>Reported: {t.lastReportedDate ? formatDate(t.lastReportedDate) : "-"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="packets" className={styles.tabContent}>
                <div className={styles.listContainer}>
                  {data.packets.length === 0 ? (
                    <div className={styles.emptyCard}>No dispute letters found.</div>
                  ) : (
                    data.packets.map(p => (
                      <div key={p.id} className={styles.listCard}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardHeaderLeft}>
                            <Badge variant={p.status === "completed" ? "success" : p.status === "failed" ? "error" : "default"}>
                              {p.status || "pending"}
                            </Badge>
                            {p.violationCategory && (
                              <Badge variant="warning" className={styles.actionBadge}>
                                {p.violationCategory.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                              </Badge>
                            )}
                          </div>
                          <span className={styles.terminalLabel}>{p.terminalLabel || "-"}</span>
                        </div>
                        <div className={styles.cardBottom}>
                          <span className={styles.boldText}>{p.creditorName || p.originalCreditorName || p.tradelineAccountNumber || "-"}</span>
                          <span>Delivery: {p.deliveryMethod || "-"}</span>
                          <span>{p.createdAt ? formatDateTime(p.createdAt) : "-"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="reports" className={styles.tabContent}>
                <div className={styles.listContainer}>
                  {data.reportArtifacts.length === 0 ? (
                    <div className={styles.emptyCard}>No reports found.</div>
                  ) : (
                    data.reportArtifacts.map(r => (
                      <div key={r.id} className={styles.listCard}>
                        <div className={styles.cardTop}>
                          <span className={styles.boldText}>{r.artifactType || "Unknown"}</span>
                          <Badge variant="default">{r.region || "CA"}</Badge>
                        </div>
                        <div className={styles.cardBottom}>
                          <span>Report Date: {r.reportDate ? formatDate(r.reportDate) : "-"}</span>
                          <span>Created: {r.createdAt ? formatDateTime(r.createdAt) : "-"}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="activity" className={styles.tabContent}>
                <div className={styles.listContainer}>
                  {data.recentActivity.length === 0 ? (
                    <div className={styles.emptyCard}>No recent activity.</div>
                  ) : (
                    data.recentActivity.map(a => (
                      <div key={a.id} className={styles.listCard}>
                        <div className={styles.cardTop}>
                          <div className={styles.cardHeaderLeft}>
                            <Badge variant="default" className={styles.actionBadge}>
                              {a.actionType.replace(/_/g, " ")}
                            </Badge>
                            <span className={styles.boldText}>{a.entityType}</span>
                          </div>
                          <Badge variant={a.status === "SUCCESS" ? "success" : "error"}>
                            {a.status}
                          </Badge>
                        </div>
                        <div className={styles.cardBottom}>
                          <span className={styles.monoText}>ID: {a.entityId || "-"}</span>
                          <span>{formatDateTime(a.timestamp)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {data.user.role !== "admin" && (
            <div className={styles.dangerZone}>
              <div className={styles.dangerZoneHeader}>
                <h3 className={styles.dangerZoneTitle}>Danger Zone</h3>
                <p className={styles.dangerZoneDescription}>
                  Permanently delete this user and all associated data. This action cannot be undone.
                </p>
              </div>
              <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
                setIsDeleteDialogOpen(open);
                if (!open) setDeleteConfirmEmail("");
              }}>
                <DialogTrigger asChild>
                  <Button variant="destructive">Delete This User</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete User</DialogTitle>
                    <DialogDescription>
                      This will permanently delete the user account and ALL their data. This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className={styles.deleteDialogContent}>
                    <p>
                      Please type the user's email <strong>{data.user.email}</strong> to confirm.
                    </p>
                    <Input
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      placeholder={data.user.email}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={deleteConfirmEmail !== data.user.email || deleteUserMutation.isPending}
                      onClick={handleDeleteUser}
                    >
                      {deleteUserMutation.isPending ? "Deleting..." : "Permanently Delete"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </>
      )}
    </div>
  );
}