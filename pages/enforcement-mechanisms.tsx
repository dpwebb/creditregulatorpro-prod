import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  Plus,
  Filter,
  Edit,
  Trash2,
  AlertTriangle,
  Search,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";

import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { EnforcementMechanismDialog } from "../components/EnforcementMechanismDialog";

import {
  useEnforcementMechanisms,
  useCreateEnforcementMechanism,
  useUpdateEnforcementMechanism,
  useDeleteEnforcementMechanism,
} from "../helpers/useEnforcementMechanisms";

import { OutputType as ListOutputType } from "../endpoints/enforcement-mechanism/list_GET.schema";
import { EnforcementMechanismType } from "../helpers/schema";
import styles from "./enforcement-mechanisms.module.css";

// Define the type for the mechanism data
type MechanismData = ListOutputType["mechanisms"][number];

export default function EnforcementMechanismsPage() {
  // Filters
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingMechanism, setEditingMechanism] = useState<MechanismData | null>(null);
  const [deletingMechanism, setDeletingMechanism] = useState<MechanismData | null>(null);

  // Queries & Mutations
  const { data, isLoading, error } = useEnforcementMechanisms({
    jurisdiction: jurisdictionFilter || undefined,
    mechanismType: (typeFilter as EnforcementMechanismType) || undefined,
  });

  const createMutation = useCreateEnforcementMechanism();
  const updateMutation = useUpdateEnforcementMechanism();
  const deleteMutation = useDeleteEnforcementMechanism();

  // Handlers
  const handleCreate = async (formData: any) => {
    try {
      await createMutation.mutateAsync(formData);
      toast.success("Enforcement mechanism created successfully");
    } catch (e) {
      // Error is handled in the mutation hook but we catch here to prevent unhandled promise rejection if needed
      // The toast is already shown by the hook
    }
  };

  const handleUpdate = async (formData: any) => {
    if (!editingMechanism) return;
    try {
      await updateMutation.mutateAsync({
        id: editingMechanism.id,
        ...formData,
      });
      toast.success("Enforcement mechanism updated successfully");
      setEditingMechanism(null);
    } catch (e) {
      // Error handled by hook
    }
  };

  const handleDelete = async () => {
    if (!deletingMechanism) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingMechanism.id });
      toast.success("Enforcement mechanism deleted successfully");
      setDeletingMechanism(null);
    } catch (e) {
      // Error handled by hook
    }
  };

  const getTypeBadgeVariant = (type: EnforcementMechanismType) => {
    switch (type) {
      case "PENALTY":
        return "error"; // Destructive/Red for penalties
      case "ENFORCING_BODY":
        return "default"; // Neutral for bodies
      case "COMPLAINT_PROCEDURE":
        return "info"; // Blue for procedures
      default:
        return "default";
    }
  };

  const formatType = (type: string) => {
    return type.replace(/_/g, " ");
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Enforcement Mechanisms | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Enforcement Mechanisms"
        subtitle="Track penalties, enforcing bodies, and complaint procedures by jurisdiction"
        
      >
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus size={18} />
          New Enforcement Mechanism
        </Button>
      </PageHeader>

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
              <option value="Federal">Federal</option>
              <option value="Ontario">Ontario</option>
              <option value="Nova Scotia">Nova Scotia</option>
              <option value="Quebec">Quebec</option>
              <option value="British Columbia">British Columbia</option>
            </select>
          </div>

          <div className={styles.filterGroup}>
            <Search size={16} className={styles.filterIcon} />
            <select
              className={styles.select}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="PENALTY">Penalty</option>
              <option value="ENFORCING_BODY">Enforcing Body</option>
              <option value="COMPLAINT_PROCEDURE">Complaint Procedure</option>
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
            <p>Failed to load enforcement mechanisms. Please try again.</p>
          </div>
        ) : !data?.mechanisms || data.mechanisms.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No enforcement mechanisms found matching your filters.</p>
          </div>
        ) : (
          <div className={styles.cardList}>
            {data.mechanisms.map((mechanism) => (
              <div key={mechanism.id} className={styles.mechanismCard}>
                <div className={styles.cardTopRow}>
                  <div className={styles.cardHeaderGroup}>
                    <Badge variant={getTypeBadgeVariant(mechanism.mechanismType)}>
                      {formatType(mechanism.mechanismType)}
                    </Badge>
                    <span className={styles.jurisdictionText}>
                      {mechanism.jurisdiction}
                    </span>
                    <span className={styles.deadlineText}>
                      {mechanism.filingDeadlineDays
                        ? `Deadline: ${mechanism.filingDeadlineDays} days`
                        : "No deadline"}
                    </span>
                  </div>
                  <div className={styles.actions}>
                    <button
                      className={styles.actionButton}
                      onClick={() => setEditingMechanism(mechanism)}
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      className={`${styles.actionButton} ${styles.deleteButton}`}
                      onClick={() => setDeletingMechanism(mechanism)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className={styles.cardBottomRow}>
                  <div className={styles.mainInfo}>
                    <div className={styles.name}>{mechanism.name}</div>
                    <div className={styles.description}>
                      {mechanism.description}
                    </div>
                    {mechanism.websiteUrl && (
                      <a
                        href={mechanism.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                      >
                        Visit Website <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div className={styles.detailsList}>
                    {mechanism.mechanismType === "PENALTY" && mechanism.penaltyAmount && (
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Amount:</span>{" "}
                        {mechanism.penaltyAmount}
                      </div>
                    )}
                    {(mechanism.mechanismType === "ENFORCING_BODY" ||
                      mechanism.mechanismType === "COMPLAINT_PROCEDURE") &&
                      mechanism.contactInfo && (
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Contact:</span>
                          <span className={styles.contactInfo}>
                            {mechanism.contactInfo}
                          </span>
                        </div>
                      )}
                    {mechanism.statutoryReference && (
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Ref:</span>{" "}
                        {mechanism.statutoryReference}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <EnforcementMechanismDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        mode="create"
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />

      {/* Edit Dialog */}
      <EnforcementMechanismDialog
        open={!!editingMechanism}
        onOpenChange={(open) => !open && setEditingMechanism(null)}
        mode="edit"
        initialData={editingMechanism || undefined}
        onSubmit={handleUpdate}
        isSubmitting={updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog.Root
        open={!!deletingMechanism}
        onOpenChange={(open) => !open && setDeletingMechanism(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <Dialog.Title className={styles.dialogTitle}>
              Delete Enforcement Mechanism
            </Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Are you sure you want to delete "{deletingMechanism?.name}"? This action cannot be undone.
            </Dialog.Description>
            <div className={styles.dialogFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setDeletingMechanism(null)}
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