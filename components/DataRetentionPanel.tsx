import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./Button";
import {
  getRetentionDeletedCount,
  runRetentionEnforcement,
  getRetentionStats,
} from "../helpers/adminRetentionApi";
import { RETENTION_APPLY_CONFIRMATION } from "../endpoints/admin/retention_POST.schema";
import { useAuditLogs } from "../helpers/useAuditLogs";
import { DataRetentionStats } from "./DataRetentionStats";
import { DataRetentionAutomation } from "./DataRetentionAutomation";
import styles from "./DataRetentionPanel.module.css";

export const DataRetentionPanel = () => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const queryClient = useQueryClient();

  // Fetch retention stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["admin", "retention", "stats"],
    queryFn: getRetentionStats,
  });

  // Fetch audit logs to determine the source of the last run
  // We look for DELETE actions which correspond to retention enforcement
  const { data: auditLogs } = useAuditLogs({
    actionType: "DELETE",
    limit: 5,
    offset: 0,
  });

  // Determine source of last run
  let lastRunSource: "AUTOMATED" | "MANUAL" | null = null;
  if (stats?.lastRun && auditLogs?.logs) {
    // Try to find a log that matches the last run time closely (within a minute)
    // or just assume the most recent DELETE log is the one if dates match
    const lastRunTime = new Date(stats.lastRun).getTime();
    
    const matchingLog = auditLogs.logs.find(log => {
      const logTime = new Date(log.timestamp).getTime();
      return Math.abs(logTime - lastRunTime) < 60 * 1000; // 1 minute window
    });

    if (matchingLog) {
      if (matchingLog.details && typeof matchingLog.details === 'object') {
        const details = matchingLog.details as any;
        if (details.operation === "AUTOMATED_RETENTION_PURGE") {
          lastRunSource = "AUTOMATED";
        } else if (details.operation === "MANUAL_RETENTION_ENFORCEMENT" || matchingLog.userId !== 0) {
          lastRunSource = "MANUAL";
        }
      } else {
        // Fallback heuristic: userId 0 is system (automated)
        lastRunSource = matchingLog.userId === 0 ? "AUTOMATED" : "MANUAL";
      }
    }
  }

  const mutation = useMutation({
    mutationFn: runRetentionEnforcement,
    onSuccess: (data) => {
      const deletedCount = getRetentionDeletedCount(data);
      toast.success("Retention enforcement completed successfully", {
        description: `Deleted ${deletedCount} records.`,
      });
      setIsConfirmOpen(false);
      setIsConfirmed(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "retention"] });
      queryClient.invalidateQueries({ queryKey: ["audit", "logs"] });
    },
    onError: (error) => {
      toast.error("Failed to run retention enforcement", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });

  const handleRunRetention = () => {
    mutation.mutate({ mode: "apply", confirmation: RETENTION_APPLY_CONFIRMATION });
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>Data Retention Policy</h2>
          <p className={styles.description}>
            Credit Regulator Pro Policy: 1 year retention for all operational data. Audit logs are retained permanently for compliance and security auditing purposes.
          </p>
        </div>

        <DataRetentionStats 
          stats={stats} 
          isLoading={isLoadingStats} 
          lastRunSource={lastRunSource} 
        />

        <div className={styles.separator} />

        <DataRetentionAutomation />

        <div className={styles.actionArea}>
          <div className={styles.actionDisclaimer}>
            Preview is the default. Manual and automated destructive apply require explicit confirmation.
          </div>
          <Button 
            variant="destructive" 
            onClick={() => setIsConfirmOpen(true)}
            disabled={mutation.isPending}
            className={styles.runButton}
          >
            <Trash2 size={16} />
            Run Manual Enforcement
          </Button>
        </div>
      </div>

      <Dialog.Root open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <Dialog.Title className={styles.dialogTitle}>Confirm Data Deletion</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              You are about to permanently delete all operational data older than 1 year. This action is irreversible.
            </Dialog.Description>

            <div className={styles.checkboxWrapper}>
              <input
                type="checkbox"
                id="confirm-delete"
                className={styles.checkbox}
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
              />
              <label htmlFor="confirm-delete" className={styles.checkboxLabel}>
                I confirm deletion of data older than 1 year
              </label>
            </div>

            <div className={styles.dialogActions}>
              <Button 
                variant="ghost" 
                onClick={() => setIsConfirmOpen(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={!isConfirmed || mutation.isPending}
                onClick={handleRunRetention}
              >
                {mutation.isPending ? "Processing..." : "Confirm & Delete"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
