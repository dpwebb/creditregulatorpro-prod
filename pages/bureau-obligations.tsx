import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  Plus,
  Eye,
  Edit,
  Trash2,
  AlertTriangle,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Selectable } from "kysely";

import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { Input } from "../components/Input";
import {
  TableContainer,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/Table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/Dialog";
import { UnifiedObligationFormDialog } from "../components/UnifiedObligationFormDialog";
import { ViewObligationDialog } from "../components/ViewObligationDialog";
import {
  useObligationList,
  useCreateObligation,
  useUpdateObligation,
  useDeleteObligation,
} from "../helpers/obligationQueries";

import { Obligation, ObligationSection } from "../helpers/schema";
import styles from "./bureau-obligations.module.css";

export default function BureauObligationsPage() {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  const [viewingObligation, setViewingObligation] = useState<Selectable<Obligation> | null>(null);
  const [editingObligation, setEditingObligation] = useState<Selectable<Obligation> | null>(null);
  const [deletingObligation, setDeletingObligation] = useState<Selectable<Obligation> | null>(null);

  // Queries & Mutations
  const { data, isLoading, error } = useObligationList();
  const createMutation = useCreateObligation();
  const updateMutation = useUpdateObligation();
  const deleteMutation = useDeleteObligation();

  // Filter data for CREDIT_BUREAU section
  const filteredObligations = data?.obligations
    .filter((obs) => obs.section === "CREDIT_BUREAU")
    .filter((obs) => {
      const matchesSearch =
        obs.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (obs.obligationType && obs.obligationType.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSearch;
    }) || [];

  // Handlers
  const handleCreate = async (formData: {
    description: string;
    obligationType: string | null;
    section: ObligationSection;
    jurisdiction?: string;
    statutoryReference?: string;
    timeframeDays?: number;
    notes?: string;
    dutyType?: string;
    region?: string;
  }) => {
    try {
      await createMutation.mutateAsync({
        ...formData,
        section: "CREDIT_BUREAU", // Enforce section
      });
      toast.success("Bureau obligation created successfully");
      setIsCreateOpen(false);
    } catch (e) {
      toast.error("Failed to create obligation");
      console.error(e);
    }
  };

  const handleUpdate = async (formData: {
    description: string;
    obligationType: string | null;
    section: ObligationSection;
    jurisdiction?: string;
    statutoryReference?: string;
    timeframeDays?: number;
    notes?: string;
    dutyType?: string;
    region?: string;
  }) => {
    if (!editingObligation) return;
    try {
      await updateMutation.mutateAsync({
        id: editingObligation.id,
        ...formData,
        section: "CREDIT_BUREAU", // Enforce section
      });
      toast.success("Bureau obligation updated successfully");
      setEditingObligation(null);
    } catch (e) {
      toast.error("Failed to update obligation");
      console.error(e);
    }
  };

  const handleDelete = async () => {
    if (!deletingObligation) return;
    try {
      await deleteMutation.mutateAsync({ id: deletingObligation.id });
      toast.success("Obligation deleted successfully");
      setDeletingObligation(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete obligation";
      toast.error(message);
      console.error(e);
    }
  };

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Bureau Obligations | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Bureau Obligations"
        subtitle="Manage regulatory requirements for credit reporting agencies"
        
      >
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus size={18} />
          Add Bureau Obligation
        </Button>
      </PageHeader>

      <div className={styles.toolbar}>
        <div className={styles.searchContainer}>
          <Search size={16} className={styles.searchIcon} />
          <Input
            placeholder="Search obligations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
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
            <p>Failed to load obligations. Please try again.</p>
          </div>
        ) : filteredObligations.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No bureau obligations found matching your search.</p>
          </div>
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.tableHeader}>Description</TableHead>
                  <TableHead className={styles.tableHeader}>Type</TableHead>
                  <TableHead className={`${styles.tableHeader} ${styles.actionsHeader}`}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredObligations.map((obligation) => (
                  <TableRow key={obligation.id} className={styles.row}>
                    <TableCell className={styles.descriptionCell}>
                      <div className={styles.description} title={obligation.description}>
                        {obligation.description}
                      </div>
                      {obligation.notes && (
                        <div className={styles.notes} title={obligation.notes}>
                          {obligation.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {obligation.obligationType ? (
                        <Badge variant="default" className={styles.typeBadge}>
                          {obligation.obligationType}
                        </Badge>
                      ) : (
                        <span className={styles.emptyValue}>-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className={styles.actions}>
                        <button
                          className={styles.actionButton}
                          onClick={() => setViewingObligation(obligation)}
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        {!obligation.isStatutory && (
                          <>
                            <button
                              className={styles.actionButton}
                              onClick={() => setEditingObligation(obligation)}
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              className={`${styles.actionButton} ${styles.deleteButton}`}
                              onClick={() => setDeletingObligation(obligation)}
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </div>

      {/* View Details Dialog */}
      <ViewObligationDialog
        open={!!viewingObligation}
        onOpenChange={(open) => !open && setViewingObligation(null)}
        obligation={viewingObligation}
      />

      {/* Create/Edit Dialog */}
      <UnifiedObligationFormDialog
        open={isCreateOpen || !!editingObligation}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingObligation(null);
          }
        }}
        mode={editingObligation ? "edit" : "create"}
        initialData={editingObligation || undefined}
        onSubmit={editingObligation ? handleUpdate : handleCreate}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingObligation}
        onOpenChange={(open) => !open && setDeletingObligation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Bureau Obligation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this obligation? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeletingObligation(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}