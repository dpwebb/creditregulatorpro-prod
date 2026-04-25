import React from "react";
import { format } from "../helpers/dateUtils";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./Dialog";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Link } from "react-router-dom";
import styles from "./CalendarEventDialog.module.css";

interface CalendarEventDialogProps {
  event: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export const CalendarEventDialog = ({ event, open, onOpenChange, className }: CalendarEventDialogProps) => {
  if (!event) return null;

  const isPacketEvent = event.resource?.type === "PACKET";
  const isRegulatoryEvent = event.resource?.update;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle className={styles.dialogTitle}>
            {event.title}
          </DialogTitle>
          <DialogDescription>
            {isPacketEvent && (
              <Badge variant={
                event.resource.eventType === 'OVERDUE' ? 'error' :
                event.resource.eventType === 'RESPONSE_DUE' ? 'warning' :
                event.resource.eventType === 'RESPONSE_RECEIVED' ? 'success' : 'info'
              }>
                {event.resource.eventType.replace(/_/g, ' ')}
              </Badge>
            )}
            {isRegulatoryEvent && (
              <Badge variant={
                event.resource.eventType === 'EFFECTIVE_DATE' ? 'error' :
                event.resource.eventType === 'REVIEW_DEADLINE' ? 'warning' :
                event.resource.eventType === 'APPLIED_DATE' ? 'success' : 'info'
              }>
                {event.resource.eventType.replace(/_/g, ' ')}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className={styles.eventDetails}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Date:</span>
            <span className={styles.detailValue}>
              {event.start && format(event.start, "MMMM d, yyyy")}
            </span>
          </div>

          {isPacketEvent && (
            <>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Packet ID:</span>
                <span className={styles.detailValue}>#{event.resource.packetId}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Account Number:</span>
                <span className={styles.detailValue}>{event.resource.accountNumber}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Bureau:</span>
                <span className={styles.detailValue}>{event.resource.bureauName}</span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Compliance Status:</span>
                <span className={styles.detailValue}>
                  <Badge variant={
                    event.resource.complianceStatus === 'OVERDUE' ? 'error' :
                    event.resource.complianceStatus === 'RESPONDED' ? 'success' :
                    event.resource.complianceStatus === 'ON_TIME' ? 'info' : 'default'
                  }>
                    {event.resource.complianceStatus.replace(/_/g, ' ')}
                  </Badge>
                </span>
              </div>

              {event.resource.statuteCode && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Statute Code:</span>
                  <span className={styles.detailValue}>{event.resource.statuteCode}</span>
                </div>
              )}

              {event.resource.timeframeDays && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Response Timeframe:</span>
                  <span className={styles.detailValue}>{event.resource.timeframeDays} days</span>
                </div>
              )}

              {event.resource.daysOverdue !== null && event.resource.daysOverdue > 0 && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Days Overdue:</span>
                  <span className={`${styles.detailValue} ${styles.overdueValue}`}>
                    {event.resource.daysOverdue} days
                  </span>
                </div>
              )}

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Description:</span>
                <p className={styles.descriptionText}>
                  {event.resource.description}
                </p>
              </div>
            </>
          )}

          {isRegulatoryEvent && (
            <>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Jurisdiction:</span>
                <span className={styles.detailValue}>
                  {event.resource.update.jurisdiction}
                </span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status:</span>
                <span className={styles.detailValue}>
                  <Badge variant="default">{event.resource.update.status}</Badge>
                </span>
              </div>

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Description:</span>
                <p className={styles.descriptionText}>
                  {event.resource.update.description}
                </p>
              </div>
            </>
          )}

          {((isPacketEvent && event.resource.complianceStatus === 'OVERDUE') || 
            (isRegulatoryEvent && event.resource.isOverdue)) && (
            <div className={styles.overdueAlert}>
              <AlertTriangle size={16} />
              <span>This item is overdue! Immediate action required.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isPacketEvent && (
            <Button asChild>
              <Link to={`/packets?id=${event.resource.packetId}`}>
                View Packet Details
              </Link>
            </Button>
          )}
          {isRegulatoryEvent && (
            <Button asChild>
              <Link to={`/regulatory-updates?id=${event.resource.update.id}`}>
                View Full Details
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};