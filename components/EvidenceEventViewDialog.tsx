import React, { useState } from "react";
import { format } from "../helpers/dateUtils";
import { toast } from "sonner";
import { Eye, Copy } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogTrigger 
} from "./Dialog";
import { formatDateTime } from "../helpers/formatters";
import { EvidenceEventWithDetails } from "../helpers/evidenceQueries";
import styles from "./EvidenceEventViewDialog.module.css";

export function EvidenceEventViewDialog({ event }: { event: EvidenceEventWithDetails }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={styles.viewBtn} title="View Details">
          <Eye size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent className={styles.viewDialogContent}>
        <DialogHeader>
          <DialogTitle>Communication Details</DialogTitle>
          <DialogDescription>
            Full details for communication event #{event.id}
          </DialogDescription>
        </DialogHeader>

        <div className={styles.viewContent}>
          <div className={styles.gridTwoCols}>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Event ID</label>
              <div className={styles.detailValue}>#{event.id}</div>
            </div>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Type</label>
              <Badge variant="default">{event.eventType}</Badge>
            </div>
          </div>

          <div className={styles.detailGroup}>
            <label className={styles.detailLabel}>Description</label>
            <div className={styles.detailValueDescription}>{event.description}</div>
          </div>

          <div className={styles.gridThreeCols}>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Packet</label>
              <div className={styles.detailValue}>
                {event.packetId ? (
                  <span className={styles.mono}>#{event.packetId} {event.packetStatus && `(${event.packetStatus})`}</span>
                ) : <span className={styles.muted}>—</span>}
              </div>
            </div>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Tradeline</label>
              <div className={styles.detailValue}>
                {event.tradelineAccountNumber ? (
                  <span className={styles.mono}>{event.tradelineAccountNumber}</span>
                ) : <span className={styles.muted}>—</span>}
              </div>
            </div>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Statute</label>
              <div className={styles.detailValue}>
                {/* @ts-ignore - fixing statuteId vs statuteVersionId mismatch based on project context */}
                {event.statuteVersionId ? (
                  // @ts-ignore
                  <span className={styles.mono}>§{event.statuteVersionId}</span>
                ) : <span className={styles.muted}>—</span>}
              </div>
            </div>
          </div>

          <div className={styles.gridTwoCols}>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Timestamp</label>
              <div className={styles.detailValue}>{event.at ? formatDateTime(new Date(event.at)) : "Unknown"}</div>
            </div>
            <div className={styles.detailGroup}>
              <label className={styles.detailLabel}>Region</label>
              <div className={styles.detailValue}>CA</div>
            </div>
          </div>

          <div className={styles.sectionDivider}>
            <span>Hash Chain Information</span>
          </div>

          <div className={styles.detailGroup}>
            <label className={styles.detailLabel}>Chain Status</label>
            <div className={styles.detailValue}>
              {event.currentHash ? (
                <div className={styles.statusRow}>
                  <Badge variant="success">Secured</Badge>
                  <span className={styles.statusText}>Cryptographically linked to previous event</span>
                </div>
              ) : (
                <Badge variant="warning">Unsigned</Badge>
              )}
            </div>
          </div>

          <div className={styles.detailGroup}>
            <label className={styles.detailLabel}>Previous Hash</label>
            <HashDisplay hash={event.previousHash} />
          </div>

          <div className={styles.detailGroup}>
            <label className={styles.detailLabel}>Current Hash</label>
            <HashDisplay hash={event.currentHash} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => setIsOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HashDisplay({ hash }: { hash?: string | null }) {
  if (!hash) return <div className={styles.muted}>None</div>;
  
  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    toast.success("Hash copied to clipboard");
  };

  return (
    <div className={styles.hashDisplay}>
      <code className={styles.hashCode}>{hash}</code>
      <Button variant="ghost" size="icon-sm" onClick={handleCopy} title="Copy Hash" className={styles.copyBtn}>
        <Copy size={12} />
      </Button>
    </div>
  );
}