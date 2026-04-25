import React, { useState } from "react";
import { Helmet } from "react-helmet";
import {
  Plus,
  Filter,
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
import styles from "./creditor-obligations.module.css";

export default function CreditorObligationsPage() {
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");
  const [dutyTypeFilter, setDutyTypeFilter] = useState<string>("");
  

  // Dialog States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingObligation, setViewingObligation] = useState<Selectable<Obligation> | null>(null);
  const [editingObligation, setEditingObligation] = useState<Selectable<Obligation> | null>(null);
  const [deletingObligation, setDeletingObligation] = useState<Selectable<Obligation> | null>(null);

  // Queries & Mutations
  const { data, isLoading, error } = useObligationList();
  const createMutation = useCreateObligation();
  const updateMutation = useUpdateObligation();
  const deleteMutation = useDeleteObligation();

  // Filter data for CREDITOR section
  const filteredObligations = data?.obligations
    .filter((obs) => obs.section === "CREDITOR")
    .filter((obs) => {
      const matchesSearch =
        obs.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (obs.obligationType && obs.obligationType.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesJurisdiction = jurisdictionFilter ? obs.jurisdiction === jurisdictionFilter : true;
      const matchesDutyType = dutyTypeFilter ? obs.dutyType === dutyTypeFilter : true;
      return matchesSearch && matchesJurisdiction && matchesDutyType;
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
        section: "CREDITOR", // Enforce section
      });
      toast.success("Creditor obligation created successfully");
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
        section: "CREDITOR", // Enforce section
      });
      toast.success("Creditor obligation updated successfully");
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

  // Helper to get unique jurisdictions for filter dropdown
  const uniqueJurisdictions = Array.from(
    new Set(
      data?.obligations
        .filter((o) => o.section === "CREDITOR" && o.jurisdiction)
        .map((o) => o.jurisdiction)
    )
  ).sort();

  // Helper to get unique duty types for filter dropdown
  const uniqueDutyTypes = Array.from(
    new Set(
      data?.obligations
        .filter((o) => o.section === "CREDITOR" && o.dutyType)
        .map((o) => o.dutyType)
    )
  ).sort();

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Creditor Obligations | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Creditor Obligations"
        subtitle="Manage regulatory requirements for creditors and data providers"
        
      >
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus size={18} />
          Add Creditor Obligation
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

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              className={styles.select}
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
            >
              <option value="">All Jurisdictions</option>
              {uniqueJurisdictions.map((j) => (
                <option key={j} value={j as string}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filterGroup}>
            <Filter size={16} className={styles.filterIcon} />
            <select
              className={styles.select}
              value={dutyTypeFilter}
              onChange={(e) => setDutyTypeFilter(e.target.value)}
            >
              <option value="">All Duty Types</option>
              {uniqueDutyTypes.map((d) => (
                <option key={d} value={d as string}>
                  {d}
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
            <p>Failed to load obligations. Please try again.</p>
          </div>
        ) : filteredObligations.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No creditor obligations found matching your filters.</p>
          </div>
        ) : (
          <div className={styles.cardList}>
            {filteredObligations.map((obligation) => (
              <div key={obligation.id} className={styles.card}>
                <div className={styles.cardTopRow}>
                  {obligation.dutyType ? (
                    <Badge variant="default" className={styles.dutyBadge}>
                      {obligation.dutyType}
                    </Badge>
                  ) : (
                    <span className={styles.emptyValue}>-</span>
                  )}
                  <span className={styles.jurisdictionCell}>
                    {obligation.jurisdiction || <span className={styles.emptyValue}>-</span>}
                  </span>
                  <span className={styles.timeframeCell}>
                    {obligation.timeframeDays
                      ? `${obligation.timeframeDays} days`
                      : <span className={styles.emptyValue}>-</span>}
                  </span>
                  <span className={styles.referenceCell}>
                    {obligation.statutoryReference || <span className={styles.emptyValue}>-</span>}
                  </span>
                </div>
                <div className={styles.cardBottomRow}>
                  <div className={styles.cardContentSection}>
                    <div className={styles.description} title={obligation.description}>
                      {obligation.description}
                    </div>
                    {obligation.notes && (
                      <div className={styles.notes} title={obligation.notes}>
                        {obligation.notes}
                      </div>
                    )}
                  </div>
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
                </div>
              </div>
            ))}
          </div>
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
            <DialogTitle>Delete Creditor Obligation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this obligation? This action cannot
              be undone. If this obligation is referenced by any instances,
              deletion will fail.
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