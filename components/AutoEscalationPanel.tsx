import React, { useState } from "react";
import { ShieldAlert, RefreshCw, AlertTriangle, Zap } from "lucide-react";
import {
  useEscalationScanMutation,
  useTriggerEscalationMutation,
  useAutoTriggerEscalationMutation,
} from "../helpers/escalationQueries";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Badge } from "./Badge";
import styles from "./AutoEscalationPanel.module.css";

export const AutoEscalationPanel: React.FC = () => {
  const [scanResult, setScanResult] = useState<{
    id: number;
    tradelineId: number | null;
    disputeVector: string | null;
    responseDeadline: Date | null;
  }[]>([]);
  
  const [selectedObligation, setSelectedObligation] = useState<number | null>(null);
  const [showAutoTriggerConfirm, setShowAutoTriggerConfirm] = useState(false);

  const scanMutation = useEscalationScanMutation();
  const triggerMutation = useTriggerEscalationMutation();
  const autoTriggerMutation = useAutoTriggerEscalationMutation();

  const handleScan = () => {
    scanMutation.mutate(undefined, {
      onSuccess: (data) => {
        setScanResult(data.obligationsReadyForEscalation);
      }
    });
  };

  const handleTrigger = () => {
    if (selectedObligation) {
      triggerMutation.mutate(
        { obligationInstanceId: selectedObligation },
        {
          onSuccess: () => {
            // Remove from list
            setScanResult((prev) => prev.filter((o) => o.id !== selectedObligation));
            setSelectedObligation(null);
          },
        },
      );
    }
  };

  const handleAutoTrigger = () => {
    autoTriggerMutation.mutate(undefined, {
      onSuccess: () => {
        // Clear the list since items were processed
        setScanResult([]);
        setShowAutoTriggerConfirm(false);
        // Refresh scan to see if anything remains or new things appeared
        handleScan();
      },
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <ShieldAlert className={styles.icon} />
          <h3 className={styles.title}>Auto-Escalation</h3>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {scanResult.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAutoTriggerConfirm(true)}
              disabled={autoTriggerMutation.isPending}
              title="Auto-trigger all escalations"
            >
              <Zap size={16} /> Auto-Escalate All
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleScan}
            disabled={scanMutation.isPending}
            title="Scan for escalations"
          >
            <RefreshCw
              size={16}
              className={scanMutation.isPending ? styles.spinning : ""}
            />
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        {scanResult.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No obligations currently flagged for escalation.</p>
            <Button variant="ghost" size="sm" onClick={handleScan}>Run Scan</Button>
          </div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHeader}>
              <span>Ready for Escalation</span>
              <Badge variant="warning">{scanResult.length}</Badge>
            </div>
            {scanResult.map(item => (
              <div key={item.id} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.itemTitle}>Obligation #{item.id}</span>
                  <span className={styles.itemMeta}>
                    Vector: {item.disputeVector || 'N/A'}
                  </span>
                </div>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => setSelectedObligation(item.id)}
                >
                  Escalate
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedObligation}
        onOpenChange={(open) => !open && setSelectedObligation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={styles.dialogTitle}>
              <AlertTriangle className={styles.warningIcon} />
              Confirm Escalation
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to trigger an escalation for Obligation #
              {selectedObligation}? This will generate a new obligation instance with
              increased pressure score and updated dispute vector.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSelectedObligation(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTrigger}
              disabled={triggerMutation.isPending}
            >
              {triggerMutation.isPending ? "Escalating..." : "Confirm Escalation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAutoTriggerConfirm}
        onOpenChange={(open) => !open && setShowAutoTriggerConfirm(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={styles.dialogTitle}>
              <Zap className={styles.warningIcon} />
              Confirm Auto-Escalation
            </DialogTitle>
            <DialogDescription>
              This will automatically trigger escalation for all{" "}
              <strong>{scanResult.length}</strong> eligible obligations found in the scan.
              <br />
              <br />
              Each obligation will be processed to generate new instances with updated
              pressure scores and vectors. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowAutoTriggerConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAutoTrigger}
              disabled={autoTriggerMutation.isPending}
            >
              {autoTriggerMutation.isPending
                ? "Processing Batch..."
                : "Proceed with Auto-Escalation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};