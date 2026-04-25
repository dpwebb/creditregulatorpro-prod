import React, { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Trash2,
  Download,
  X,
  FileText,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./Dialog";
import { Checkbox } from "./Checkbox";
import styles from "./BulkActionsToolbar.module.css";

interface BulkActionsToolbarProps {
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  allIds: number[];
  onBulkDelete?: (ids: number[]) => Promise<void>;
  onBulkExport?: (ids: number[], format: "csv" | "pdf") => Promise<void>;
  entityName?: string;
  disabled?: boolean;
}

export const BulkActionsToolbar = ({
  selectedIds,
  onSelectionChange,
  allIds,
  onBulkDelete,
  onBulkExport,
  entityName = "items",
  disabled = false,
}: BulkActionsToolbarProps) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const count = selectedIds.size;
  const isVisible = count > 0;

  const handleClearSelection = () => {
    onSelectionChange(new Set());
  };

  const handleDelete = async () => {
    if (!onBulkDelete) return;
    try {
      setIsDeleting(true);
      await onBulkDelete(Array.from(selectedIds));
      setIsDeleteDialogOpen(false);
      onSelectionChange(new Set());
    } catch (error) {
      console.error("Failed to delete items", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExport = async (format: "csv" | "pdf") => {
    if (!onBulkExport) return;
    try {
      setIsExporting(true);
      await onBulkExport(Array.from(selectedIds), format);
    } catch (error) {
      console.error(`Failed to export as ${format}`, error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div
        className={`${styles.toolbarContainer} ${isVisible ? styles.visible : ""}`}
        aria-hidden={!isVisible}
      >
        <div className={styles.toolbarContent}>
          <div className={styles.selectionInfo}>
            <div className={styles.countBadge}>{count}</div>
            <span className={styles.selectionText}>
              {count === 1 ? entityName.slice(0, -1) : entityName} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className={styles.clearButton}
              disabled={disabled || isDeleting || isExporting}
            >
              <X size={14} />
              Clear
            </Button>
          </div>

          <div className={styles.actions}>
            {onBulkExport && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || isDeleting || isExporting}
                    className={styles.actionButton}
                  >
                    {isExporting ? (
                      <Loader2 size={14} className={styles.spinner} />
                    ) : (
                      <Download size={14} />
                    )}
                    Export
                    <ChevronDown size={12} style={{ opacity: 0.5 }} />
                  </Button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className={styles.dropdownContent}
                    sideOffset={5}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className={styles.dropdownItem}
                      onSelect={() => handleExport("csv")}
                    >
                      <FileSpreadsheet size={14} />
                      <span>Export as CSV</span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={styles.dropdownItem}
                      onSelect={() => handleExport("pdf")}
                    >
                      <FileText size={14} />
                      <span>Export as PDF</span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}

            {onBulkDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={disabled || isDeleting || isExporting}
                className={styles.actionButton}
              >
                {isDeleting ? (
                  <Loader2 size={14} className={styles.spinner} />
                ) : (
                  <Trash2 size={14} />
                )}
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {count} items?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {count} selected {entityName}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 size={14} className={styles.spinner} />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Helper component for the "Select All" checkbox in table headers
export const BulkSelectAllCheckbox = ({
  selectedIds,
  allIds,
  onSelectionChange,
  disabled = false,
}: {
  selectedIds: Set<number>;
  allIds: number[];
  onSelectionChange: (ids: Set<number>) => void;
  disabled?: boolean;
}) => {
  const isAllSelected =
    allIds.length > 0 && selectedIds.size === allIds.length;
  // Note: We don't have visual indeterminate state in the current Checkbox component,
  // so we just rely on checked/unchecked state.

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onSelectionChange(new Set(allIds));
    } else {
      onSelectionChange(new Set());
    }
  };

  return (
    <Checkbox
      checked={isAllSelected}
      onChange={handleChange}
      disabled={disabled || allIds.length === 0}
      aria-label="Select all items"
    />
  );
};

// Helper component for individual row checkboxes
export const BulkRowCheckbox = ({
  id,
  selectedIds,
  onSelectionChange,
  disabled = false,
}: {
  id: number;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  disabled?: boolean;
}) => {
  const isSelected = selectedIds.has(id);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSelected = new Set(selectedIds);
    if (e.target.checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    onSelectionChange(newSelected);
  };

  return (
    <Checkbox
      checked={isSelected}
      onChange={handleChange}
      disabled={disabled}
      aria-label={`Select item ${id}`}
      onClick={(e) => e.stopPropagation()} // Prevent row click events
    />
  );
};