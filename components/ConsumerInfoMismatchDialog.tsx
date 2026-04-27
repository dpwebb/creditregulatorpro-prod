import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./Dialog";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { ConsumerInfoComparison } from "../helpers/fuzzyMatcher";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import styles from "./ConsumerInfoMismatchDialog.module.css";

interface ConsumerInfoMismatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  comparison: ConsumerInfoComparison;
  onUpdateProfile: () => void;
  onKeepCurrent: () => void;
  onCancel: () => void;
  isUpdating?: boolean;
}

export const ConsumerInfoMismatchDialog: React.FC<
  ConsumerInfoMismatchDialogProps
> = ({
  open,
  onOpenChange,
  comparison,
  onUpdateProfile,
  onKeepCurrent,
  onCancel,
  isUpdating = false,
}) => {
  const { details, nameMismatch, addressMismatch } = comparison;

  const renderComparisonRow = (
    label: string,
    profileValue: string | null,
    extractedValue: string | null,
    isMismatch: boolean,
    similarity?: number
  ) => {
    return (
      <div className={`${styles.row} ${isMismatch ? styles.mismatchRow : ""}`}>
        <div className={styles.labelCell}>{label}</div>
        <div className={styles.valueCell}>
          <span className={profileValue ? "" : styles.emptyValue}>
            {profileValue || "Not set"}
          </span>
        </div>
        <div className={styles.valueCell}>
          <span className={extractedValue ? "" : styles.emptyValue}>
            {extractedValue || "Not found"}
          </span>
          {isMismatch && extractedValue && profileValue && similarity !== undefined && (
            <span className={styles.similarityBadge}>
              {similarity}% match
            </span>
          )}
        </div>
        <div className={styles.statusCell}>
          {isMismatch ? (
            <XCircle className={styles.errorIcon} size={18} />
          ) : (
            <CheckCircle2 className={styles.successIcon} size={18} />
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <div className={styles.headerWithIcon}>
            <div className={styles.warningIconWrapper}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <DialogTitle>Your Info Doesn't Match</DialogTitle>
              <DialogDescription>
                What we found in your report is different from what's in your profile.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className={styles.alertBanner}>
          <p>
            Your info needs to be right so your letters are correct. Check which one is right.
          </p>
        </div>

        <div className={styles.comparisonTable}>
          <div className={styles.tableHeader}>
            <div className={styles.labelHeader}>Field</div>
            <div className={styles.valueHeader}>Your Profile</div>
            <div className={styles.valueHeader}>From Your Report</div>
            <div className={styles.statusHeader}>Status</div>
          </div>

          <div className={styles.tableBody}>
            {renderComparisonRow(
              "Full Name",
              details.nameComparison.profile,
              details.nameComparison.extracted,
              nameMismatch,
              details.nameComparison.similarity
            )}
            {renderComparisonRow(
              "Address",
              details.addressComparison.profile,
              details.addressComparison.extracted,
              addressMismatch,
              details.addressComparison.similarity
            )}
            {renderComparisonRow(
              "City",
              details.cityComparison.profile,
              details.cityComparison.extracted,
              !details.cityComparison.match
            )}
            {renderComparisonRow(
              "Province",
              details.provinceComparison.profile,
              details.provinceComparison.extracted,
              !details.provinceComparison.match
            )}
            {renderComparisonRow(
              "Postal Code",
              details.postalCodeComparison.profile,
              details.postalCodeComparison.extracted,
              !details.postalCodeComparison.match
            )}
            {renderComparisonRow(
              "Date of Birth",
              details.dobComparison.profile ? new Date(details.dobComparison.profile).toLocaleDateString() : null,
              details.dobComparison.extracted ? new Date(details.dobComparison.extracted).toLocaleDateString() : null,
              !details.dobComparison.match
            )}
            {renderComparisonRow(
              "Phone",
              details.phoneComparison.profile,
              details.phoneComparison.extracted,
              !details.phoneComparison.match
            )}
          </div>
        </div>

        <div className={styles.infoText}>
          <p>
            Small differences like "St" vs "Street" are usually okay. If the report info is newer, you should update your profile.
          </p>
        </div>

        <DialogFooter className={styles.footer}>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isUpdating}
            className={styles.cancelButton}
          >
            Cancel
          </Button>
          <div className={styles.actionButtons}>
            <Button
              variant="secondary"
              onClick={onKeepCurrent}
              disabled={isUpdating}
            >
              Keep What I Have
            </Button>
            <Button
              variant="primary"
              onClick={onUpdateProfile}
              disabled={isUpdating}
            >
              {isUpdating ? "Updating..." : "Use the Report Info"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};