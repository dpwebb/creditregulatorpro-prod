import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Button } from "./Button";
import { useValidatePublish } from "../helpers/useValidatePublish";
import { Skeleton } from "./Skeleton";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import styles from "./PublishChecklistDialog.module.css";

interface PublishChecklistDialogProps {
  versionId: number;
  versionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmRelease: () => void;
}

export const PublishChecklistDialog: React.FC<PublishChecklistDialogProps> = ({
  versionId,
  versionName,
  open,
  onOpenChange,
  onConfirmRelease,
}) => {
  const { data, isLoading, isError, error } = useValidatePublish(versionId, open);

  const passedChecksCount = data?.checks.filter(c => c.status === "pass").length || 0;
  const totalChecks = data?.checks.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.content}>
        <DialogHeader>
          <DialogTitle>Publish Checklist: {versionName}</DialogTitle>
          <DialogDescription>
            Making sure everything is ready.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.skeletonContainer}>
              <Skeleton style={{ height: "2rem", width: "50%", marginBottom: "1rem" }} />
              <Skeleton style={{ height: "4rem", width: "100%" }} />
              <Skeleton style={{ height: "4rem", width: "100%" }} />
              <Skeleton style={{ height: "4rem", width: "100%" }} />
              <Skeleton style={{ height: "4rem", width: "100%" }} />
            </div>
          ) : isError ? (
            <div className={styles.errorState}>
              <AlertTriangle className={styles.errorIcon} />
              <p>Failed to validate publish checks.</p>
              <p className={styles.errorMessage}>{error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
          ) : data ? (
            <div className={styles.checklist}>
              <div className={styles.summary}>
                <span className={styles.summaryText}>
                  {passedChecksCount} of {totalChecks} checks passed
                </span>
                {!data.canRelease && (
                  <span className={styles.summaryWarning}>
                    Fix the failed checks before releasing.
                  </span>
                )}
              </div>

              <div className={styles.list}>
                {data.checks.map(check => (
                  <div key={check.id} className={`${styles.checkItem} ${styles[check.status]}`}>
                    <div className={styles.checkIcon}>
                      {check.status === "pass" && <CheckCircle size={20} />}
                      {check.status === "fail" && <XCircle size={20} />}
                      {check.status === "warning" && <AlertTriangle size={20} />}
                    </div>
                    <div className={styles.checkContent}>
                      <div className={styles.checkLabel}>
                        {check.label}
                        {check.required && <span className={styles.requiredBadge}>Required</span>}
                      </div>
                      <div className={styles.checkMessage}>{check.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            disabled={!data?.canRelease || isLoading} 
            onClick={onConfirmRelease}
          >
            Release Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};