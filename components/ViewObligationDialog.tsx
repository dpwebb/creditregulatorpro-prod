import React from "react";
import { Selectable } from "kysely";
import { Obligation } from "../helpers/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./Dialog";
import { Button } from "./Button";
import { Badge } from "./Badge";
import styles from "./ViewObligationDialog.module.css";

interface ViewObligationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obligation: Selectable<Obligation> | null;
}

export const ViewObligationDialog = ({
  open,
  onOpenChange,
  obligation,
}: ViewObligationDialogProps) => {
  if (!obligation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.content}>
        <DialogHeader>
          <DialogTitle>Obligation Details</DialogTitle>
        </DialogHeader>

        <div className={styles.body}>
          {obligation.isStatutory && (
            <div className={styles.statutoryBanner}>
              <span className={styles.statutoryIcon}>⚖️</span>
              <div className={styles.statutoryContent}>
                <h4 className={styles.statutoryTitle}>Statutory Obligation</h4>
                <p className={styles.statutoryDesc}>
                  This is a regulatory requirement derived from statute. It cannot be modified.
                </p>
              </div>
            </div>
          )}

          <div className={styles.section}>
            <h3 className={styles.label}>Description</h3>
            <p className={styles.value}>{obligation.description}</p>
          </div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <h3 className={styles.label}>Section</h3>
              <Badge variant="primary">{obligation.section}</Badge>
            </div>

            {obligation.obligationType && (
              <div className={styles.field}>
                <h3 className={styles.label}>Type</h3>
                <Badge variant="default">{obligation.obligationType}</Badge>
              </div>
            )}

            {obligation.jurisdiction && (
              <div className={styles.field}>
                <h3 className={styles.label}>Jurisdiction</h3>
                <p className={styles.value}>{obligation.jurisdiction}</p>
              </div>
            )}

            {obligation.dutyType && (
              <div className={styles.field}>
                <h3 className={styles.label}>Duty Type</h3>
                <Badge variant="info">{obligation.dutyType}</Badge>
              </div>
            )}

            {obligation.timeframeDays !== null &&
              obligation.timeframeDays !== undefined && (
                <div className={styles.field}>
                  <h3 className={styles.label}>Timeframe</h3>
                  <p className={styles.value}>
                    {obligation.timeframeDays} days
                  </p>
                </div>
              )}

            {obligation.region && (
              <div className={styles.field}>
                <h3 className={styles.label}>Region</h3>
                <p className={styles.value}>{obligation.region}</p>
              </div>
            )}
          </div>

          {obligation.statutoryReference && (
            <div className={styles.section}>
              <h3 className={styles.label}>Statutory Reference</h3>
              <code className={styles.reference}>
                {obligation.statutoryReference}
              </code>
            </div>
          )}

          {obligation.notes && (
            <div className={styles.section}>
              <h3 className={styles.label}>Notes</h3>
              <p className={styles.notes}>{obligation.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};