import React, { useState, useMemo } from "react";
import { Helmet } from "react-helmet";
import {
  Plus,
  Filter,
  Edit,
  Trash2,
  AlertTriangle,
  Search,
  ExternalLink,
  Eye,
  Calendar as CalendarIcon,
  AlertOctagon,
  Radar,
  Wand2,
  CheckCircle,
  XCircle,
  Archive,
  Sparkles,
  Zap,
  Bell,
  Undo2,
  Check,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";
import { format, addDays, isBefore, isAfter } from "../helpers/dateUtils";

import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Popover, PopoverTrigger, PopoverContent } from "../components/Popover";
import { RegulatoryUpdateDialog } from "../components/RegulatoryUpdateDialog";

import { useRegulatoryScan } from "../helpers/useRegulatoryScan";
import { useGenerateAllRules } from "../helpers/useGenerateAllRules";

import {
  useRegulatoryUpdates,
  useCreateRegulatoryUpdate,
  useUpdateRegulatoryUpdate,
  useDeleteRegulatoryUpdate,
} from "../helpers/useRegulatoryUpdates";


import { useAutoEscalateRegulatory } from "../helpers/useAutoEscalateRegulatory";
import { useRegulatoryRollback } from "../helpers/useRegulatoryRollback";

import {
  useGenerateScanningRule,
} from "../helpers/scanningRuleQueries";
import { DynamicScanningRulesTab } from "../components/DynamicScanningRulesTab";
import { RegulatoryNotificationPanel } from "../components/RegulatoryNotificationPanel";

import { OutputType as ListOutputType } from "../endpoints/regulatory-update/list_GET.schema";
import {
  RegulatoryUpdateStatus,
  RegulatoryChangeType,
  RegulatoryUpdateSource,
  RegulatoryUpdateStatusArrayValues,
  RegulatoryChangeTypeArrayValues,
  RegulatoryUpdateSourceArrayValues,
  DynamicRuleStatus,
} from "../helpers/schema";
import { CANADIAN_JURISDICTIONS } from "../helpers/canadianJurisdictions";
import styles from "./regulatory-updates.module.css";

// Define the type for the update data
type UpdateData = ListOutputType["updates"][number];

export default function RegulatoryUpdatesPage() {
  // Filters
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  
  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingUpdate, setViewingUpdate] = useState<UpdateData | null>(null);
  const [editingUpdate, setEditingUpdate] = useState<UpdateData | null>(null);
  const [deletingUpdate, setDeletingUpdate] = useState<UpdateData | null>(null);
  const [rollingBackUpdate, setRollingBackUpdate] = useState<UpdateData | null>(null);

  // Loading States
  const [generatingRuleId, setGeneratingRuleId] = useState<number | null>(null);

  // Queries & Mutations
  const { data, isLoading, error } = useRegulatoryUpdates({
    jurisdiction: jurisdictionFilter || undefined,
    status: (statusFilter as RegulatoryUpdateStatus) || undefined,
    changeType: (changeTypeFilter as RegulatoryChangeType) || undefined,
    source: (sourceFilter as RegulatoryUpdateSource) || undefined,
  });

  const createMutation = useCreateRegulatoryUpdate();
  const updateMutation = useUpdateRegulatoryUpdate();
  const deleteMutation = useDeleteRegulatoryUpdate();
  const scanMutation = useRegulatoryScan();
  const generateAllRulesMutation = useGenerateAllRules();

  const generateRuleMutation = useGenerateScanningRule();

  const autoEscalateMutation = useAutoEscalateRegulatory();
  const rollbackMutation = useRegulatoryRollback();

  // Statistics
  const stats = useMemo(() => {
    if (!data?.updates) return { total: 0, pending: 0, upcoming: 0 };

    const now = new Date();
    const ninetyDaysFromNow = addDays(now, 90);

    return data.updates.reduce(
      (acc, update) => {
        acc.total++;
        if (
          update.status === "DETECTED" ||
          update.status === "UNDER_REVIEW"
        ) {
          acc.pending++;
        }
        if (
          update.effectiveDate &&
          isAfter(update.effectiveDate, now) &&
          isBefore(update.effectiveDate, ninetyDaysFromNow)
        ) {
          acc.upcoming++;
        }
        return acc;
      },
      { total: 0, pending: 0, upcoming: 0 }
    );
  }, [data]);

  // Handlers
  const handleCreate = async (formData: any) => {
    try {
      await createMutation.mutateAsync(formData);
    } catch (e) {
      // Error handled by hook
    }
  };

  const handleUpdate = async (formData: any) => {
    if (!editingUpdate) return;
    try {
      await updateMutation.mutateAsync({
        id: editingUpdate.id,
        ...formData,
      });
      setEditingUpdate(null);
    } catch (e) {
      // Error handled by hook
    }
  };

  const handleDelete = async () => {
    if (!deletingUpdate) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingUpdate.id });
      setDeletingUpdate(null);
    } catch (e) {
      // Error handled by hook
    }
  };

  const handleGenerateRule = async (id: number) => {
    try {
      setGeneratingRuleId(id);
      await generateRuleMutation.mutateAsync({ regulatoryUpdateId: id });
      toast.success("Scanning rule generated successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate rule");
    } finally {
      setGeneratingRuleId(null);
    }
  };

  const getStatusBadgeVariant = (status: RegulatoryUpdateStatus) => {
    switch (status) {
      case "DETECTED":
        return "warning";
      case "UNDER_REVIEW":
        return "info";
      case "VERIFIED":
        return "success";
      case "APPLIED":
        return "primary";
      case "DISMISSED":
      case "ARCHIVED":
        return "default";
      default:
        return "default";
    }
  };

  const formatEnum = (value: string) => {
    return value.replace(/_/g, " ");
  };

  const isUrgent = (update: UpdateData) => {
    if (update.status !== "DETECTED" && update.status !== "UNDER_REVIEW") return false;
    if (!update.effectiveDate) return false;
    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);
    return isBefore(update.effectiveDate, thirtyDaysFromNow);
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Regulatory Updates | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Regulatory Update Log"
        subtitle="CRITICAL: Track all detected regulatory changes for compliance monitoring"
      >
        <div className={styles.headerActions}>
          <RegulatoryNotificationPanel 
            onViewUpdate={(id) => {
              const update = data?.updates.find(u => u.id === id);
              if (update) setViewingUpdate(update);
            }}
          />
          <Button 
            onClick={() => autoEscalateMutation.mutate()} 
            variant="secondary"
            disabled={autoEscalateMutation.isPending}
          >
            <Zap size={18} />
            {autoEscalateMutation.isPending ? "Escalating..." : "Auto-Escalate"}
          </Button>
          <Button 
            onClick={() => scanMutation.mutate({})} 
            variant="secondary"
            disabled={scanMutation.isPending}
          >
            <Radar size={18} />
            {scanMutation.isPending ? "Scanning..." : "AI Scan"}
          </Button>
          <Button 
            onClick={() => generateAllRulesMutation.mutate()} 
            variant="secondary"
            disabled={generateAllRulesMutation.isPending}
          >
            <Sparkles size={18} />
            {generateAllRulesMutation.isPending ? "Generating..." : "Generate All Rules"}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} variant="primary">
            <Plus size={18} />
            Log New Update
          </Button>
        </div>
      </PageHeader>

      {/* Stats Cards */}
      <div className={styles.statsContainer}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Updates</div>
          <div className={styles.statValue}>
            {isLoading ? <Skeleton className={styles.statSkeleton} /> : stats.total}
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statWarning}`}>
          <div className={styles.statLabel}>Pending Review</div>
          <div className={styles.statValue}>
            {isLoading ? <Skeleton className={styles.statSkeleton} /> : stats.pending}
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statUrgent}`}>
          <div className={styles.statLabel}>Effective Soon (90d)</div>
          <div className={styles.statValue}>
            {isLoading ? <Skeleton className={styles.statSkeleton} /> : stats.upcoming}
          </div>
        </div>
      </div>

      <Tabs defaultValue="updates" className={styles.tabsContainer}>
        <TabsList>
          <TabsTrigger value="updates">Updates Log</TabsTrigger>
          <TabsTrigger value="rules">Dynamic Scanning Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="updates">
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <div className={styles.filterGroup}>
                <Filter size={16} className={styles.filterIcon} />
                <select
                  className={styles.select}
                  value={jurisdictionFilter}
                  onChange={(e) => setJurisdictionFilter(e.target.value)}
                >
                  <option value="">All Jurisdictions</option>
                  {CANADIAN_JURISDICTIONS.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <Search size={16} className={styles.filterIcon} />
                <select
                  className={styles.select}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {RegulatoryUpdateStatusArrayValues.map((status) => (
                    <option key={status} value={status}>
                      {formatEnum(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <select
                  className={styles.select}
                  value={changeTypeFilter}
                  onChange={(e) => setChangeTypeFilter(e.target.value)}
                >
                  <option value="">All Change Types</option>
                  {RegulatoryChangeTypeArrayValues.map((type) => (
                    <option key={type} value={type}>
                      {formatEnum(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterGroup}>
                <select
                  className={styles.select}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="">All Sources</option>
                  {RegulatoryUpdateSourceArrayValues.map((source) => (
                    <option key={source} value={source}>
                      {formatEnum(source)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={styles.content}>
            {isLoading ? (
              <div className={styles.loading}>
                <Skeleton className={styles.skeletonRow} />
                <Skeleton className={styles.skeletonRow} />
                <Skeleton className={styles.skeletonRow} />
              </div>
            ) : error ? (
              <div className={styles.errorState}>
                <AlertTriangle size={32} />
                <p>Failed to load regulatory updates. Please try again.</p>
              </div>
            ) : !data?.updates || data.updates.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No regulatory updates found matching your filters.</p>
              </div>
            ) : (
              <div className={styles.cardList}>
                {data.updates.map((update) => {
                  const urgent = isUrgent(update);
                  const isGenerating = generatingRuleId === update.id;
                  return (
                    <div 
                      key={update.id} 
                      className={`${styles.updateCard} ${urgent ? styles.urgentCard : ""}`}
                      onClick={() => setEditingUpdate(update)}
                    >
                      <div className={styles.cardTopRow}>
                        <div className={styles.statusCell}>
                          <Badge variant={getStatusBadgeVariant(update.status)}>
                            {formatEnum(update.status)}
                          </Badge>
                          {update.notes?.toLowerCase().includes("auto-escalat") && (
                            <span title="Auto-Escalated" className={styles.autoEscalatedIconWrapper}>
                              <Zap size={14} className={styles.autoEscalatedIcon} />
                            </span>
                          )}
                        </div>
                        <span className={styles.jurisdictionText}>{update.jurisdiction}</span>
                        <Badge variant="default" className={styles.typeBadge}>
                          {formatEnum(update.changeType)}
                        </Badge>
                        <span className={styles.dateText}>
                          {update.detectedAt ? format(update.detectedAt, "MMM d, yyyy") : "-"}
                        </span>
                      </div>
                      <div className={styles.cardBottomRow}>
                        <div className={styles.cardTitleSection}>
                          <div className={styles.title} title={update.title}>
                            {update.title}
                          </div>
                          {update.statutoryReference && (
                            <div className={styles.reference}>
                              Ref: {update.statutoryReference}
                            </div>
                          )}
                        </div>
                        <div className={styles.cardMetaSection}>
                          <div className={styles.sourceCell}>
                            <span className={styles.sourceText}>{formatEnum(update.source)}</span>
                            {update.sourceUrl && (
                              <a
                                href={update.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.linkIcon}
                                title="Open Source URL"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                          <div className={styles.actions}>
                            <button
                              className={styles.actionButton}
                              onClick={(e) => { e.stopPropagation(); handleGenerateRule(update.id); }}
                              disabled={isGenerating}
                              title="Generate Rule"
                            >
                              <Wand2 size={16} className={isGenerating ? styles.spin : ""} />
                            </button>
                            <button
                              className={styles.actionButton}
                              onClick={(e) => { e.stopPropagation(); setViewingUpdate(update); }}
                              title="View Details"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              className={styles.actionButton}
                              onClick={(e) => { e.stopPropagation(); setEditingUpdate(update); }}
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            {update.status === "APPLIED" && (
                              <button
                                className={styles.actionButton}
                                onClick={(e) => { e.stopPropagation(); setRollingBackUpdate(update); }}
                                title="Rollback"
                              >
                                <Undo2 size={16} />
                              </button>
                            )}
                            <button
                              className={`${styles.actionButton} ${styles.deleteButton}`}
                              onClick={(e) => { e.stopPropagation(); setDeletingUpdate(update); }}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <DynamicScanningRulesTab />
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <RegulatoryUpdateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />

      {/* Edit Dialog */}
      <RegulatoryUpdateDialog
        open={!!editingUpdate}
        onOpenChange={(open) => !open && setEditingUpdate(null)}
        mode="edit"
        initialData={editingUpdate || undefined}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      {/* View Dialog */}
      <RegulatoryUpdateDialog
        open={!!viewingUpdate}
        onOpenChange={(open) => !open && setViewingUpdate(null)}
        mode="view"
        initialData={viewingUpdate || undefined}
        onSubmit={async () => {}} // No-op for view
        isSubmitting={false}
      />

      {/* Delete Confirmation Dialog */}
      {/* Rollback Confirmation Dialog */}
      <Dialog.Root
        open={!!rollingBackUpdate}
        onOpenChange={(open) => !open && setRollingBackUpdate(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <Dialog.Title className={styles.dialogTitle}>
              Rollback Regulatory Update
            </Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Are you sure you want to rollback "{rollingBackUpdate?.title}"? This will revert its status to VERIFIED and may impact generated rules.
            </Dialog.Description>
            <div className={styles.dialogFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setRollingBackUpdate(null)}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteButton}
                onClick={async () => {
                  if (rollingBackUpdate) {
                    await rollbackMutation.mutateAsync({ id: rollingBackUpdate.id });
                    setRollingBackUpdate(null);
                  }
                }}
                disabled={rollbackMutation.isPending}
              >
                {rollbackMutation.isPending ? "Rolling back..." : "Rollback"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={!!deletingUpdate}
        onOpenChange={(open) => !open && setDeletingUpdate(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <Dialog.Title className={styles.dialogTitle}>
              Delete Regulatory Update
            </Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Are you sure you want to delete "{deletingUpdate?.title}"? This action cannot be undone and may impact compliance tracking.
            </Dialog.Description>
            <div className={styles.dialogFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setDeletingUpdate(null)}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteButton}
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}