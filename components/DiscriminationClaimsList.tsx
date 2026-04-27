import React, { useState } from "react";
import {
  useDiscriminationClaims,
  useDeleteDiscriminationClaim,
} from "../helpers/useDiscriminationClaims";
import { DiscriminationClaimWithDetails } from "../endpoints/discrimination/list_GET.schema";
import { DiscriminationClaimDialog } from "./DiscriminationClaimDialog";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Edit2,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { format } from "../helpers/dateUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./Dialog";
import { toast } from "sonner";
import styles from "./DiscriminationClaimsList.module.css";

interface DiscriminationClaimsListProps {
  tradelineId: number;
}

export function DiscriminationClaimsList({
  tradelineId,
}: DiscriminationClaimsListProps) {
  const { data: claims, isLoading, error } = useDiscriminationClaims({
    tradelineId,
  });
  const deleteMutation = useDeleteDiscriminationClaim();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<
    DiscriminationClaimWithDetails | undefined
  >(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [claimToDelete, setClaimToDelete] = useState<number | null>(null);

  const handleCreate = () => {
    setSelectedClaim(undefined);
    setIsDialogOpen(true);
  };

  const handleEdit = (claim: DiscriminationClaimWithDetails) => {
    setSelectedClaim(claim);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: number) => {
    setClaimToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (claimToDelete) {
      try {
        await deleteMutation.mutateAsync({ id: claimToDelete });
        toast.success("Claim deleted successfully");
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete claim");
      } finally {
        setDeleteConfirmOpen(false);
        setClaimToDelete(null);
      }
    }
  };

  // Sort claims by reported date (most recent first)
  const sortedClaims = React.useMemo(() => {
    if (!claims) return [];
    return [...claims].sort((a, b) => {
      const dateA = a.reportedDate ? new Date(a.reportedDate).getTime() : 0;
      const dateB = b.reportedDate ? new Date(b.reportedDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [claims]);

  if (isLoading) {
    return <ClaimsListSkeleton />;
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <AlertTriangle className={styles.errorIcon} />
        <p>Failed to load discrimination claims</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Discrimination Claims</h3>
        <Button size="sm" onClick={handleCreate} className={styles.addButton}>
          <Plus size={16} />
          Report Discrimination
        </Button>
      </div>

      {sortedClaims.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No discrimination claims reported for this tradeline.</p>
          <Button variant="outline" size="sm" onClick={handleCreate}>
            File a Report
          </Button>
        </div>
      ) : (
        <div className={styles.list}>
          {sortedClaims.map((claim) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              onEdit={() => handleEdit(claim)}
              onDelete={() => handleDeleteClick(claim.id)}
            />
          ))}
        </div>
      )}

      <DiscriminationClaimDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        tradelineId={tradelineId}
        claim={selectedClaim}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className={styles.deleteDialog}>
          <DialogHeader>
            <DialogTitle>Delete Claim</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this discrimination claim? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
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

function ClaimCard({
  claim,
  onEdit,
  onDelete,
}: {
  claim: DiscriminationClaimWithDetails;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const getStatusVariant = (status: string | null) => {
    switch (status) {
      case "REPORTED":
        return "warning";
      case "UNDER_REVIEW":
        return "info";
      case "RESOLVED":
        return "success";
      case "ESCALATED":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.badges}>
          <Badge variant={getStatusVariant(claim.status)}>
            {claim.status?.replace("_", " ") || "UNKNOWN"}
          </Badge>
          <span className={styles.date}>
            <CalendarIcon size={14} />
            {claim.reportedDate
              ? format(new Date(claim.reportedDate), "MMM d, yyyy")
              : "No date"}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className={styles.menuBtn}>
              <MoreVertical size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={styles.menuContent} align="end">
            <DropdownMenuItem className={styles.menuItem} onSelect={onEdit}>
              <Edit2 size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className={`${styles.menuItem} ${styles.deleteItem}`}
              onSelect={onDelete}
            >
              <Trash2 size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={styles.groundsList}>
        {claim.grounds?.map((ground) => (
          <Badge key={ground} variant="primary" className={styles.groundBadge}>
            {ground.replace(/_/g, " ")}
          </Badge>
        ))}
      </div>

      {claim.description && (
        <p className={styles.description}>
          {claim.description.length > 150
            ? `${claim.description.substring(0, 150)}...`
            : claim.description}
        </p>
      )}
    </div>
  );
}

function ClaimsListSkeleton() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Skeleton style={{ width: "200px", height: "24px" }} />
        <Skeleton style={{ width: "140px", height: "36px" }} />
      </div>
      <div className={styles.list}>
        {[1, 2].map((i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardHeader}>
              <Skeleton style={{ width: "100px", height: "24px" }} />
              <Skeleton style={{ width: "24px", height: "24px" }} />
            </div>
            <div className={styles.groundsList}>
              <Skeleton style={{ width: "80px", height: "20px" }} />
              <Skeleton style={{ width: "100px", height: "20px" }} />
            </div>
            <Skeleton style={{ width: "100%", height: "60px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}