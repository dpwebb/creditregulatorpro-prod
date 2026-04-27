import React, { useState, useMemo } from "react";
import { 
  Check, 
  X, 
  AlertTriangle, 
  Save, 
  FileText, 
  Percent,
  Calendar as CalendarIcon,
  DollarSign,
  Hash,
  Building2,
  Activity
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "./Table";
import { Button } from "./Button";
import { Input } from "./Input";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { ScoredTradeline, useApproveReview, useRejectReview } from "../helpers/ocrQueries";
import styles from "./OCRReviewPanel.module.css";

const getConfidenceColor = (score: number) => {
  if (score >= 0.8) return "success";
  if (score >= 0.5) return "warning";
  return "error";
};

interface ConfidenceBadgeProps {
  score: number;
  className?: string;
}

const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ score, className }) => (
  <div 
    className={`${styles.confidenceDot} ${styles[getConfidenceColor(score)]} ${className || ""}`}
    title={`Confidence: ${Math.round(score * 100)}%`}
  />
);

interface OCRReviewPanelProps {
  reviewSessionId: string;
  initialData: ScoredTradeline[];
  fileName: string;
  mimeType: string;
  fileData: string; // Base64
  region: string;
  onComplete?: () => void;
  className?: string;
}

export const OCRReviewPanel: React.FC<OCRReviewPanelProps> = ({
  reviewSessionId,
  initialData,
  fileName,
  mimeType,
  fileData,
  region,
  onComplete,
  className,
}) => {
  const [tradelines, setTradelines] = useState<ScoredTradeline[]>(initialData);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);

  const approveMutation = useApproveReview();
  const rejectMutation = useRejectReview();

  // Calculate overall confidence score
  const overallScore = useMemo(() => {
    if (tradelines.length === 0) return 0;
    const sum = tradelines.reduce((acc, tl) => acc + (tl.confidence?.overall || 0), 0);
    return Math.round((sum / tradelines.length) * 100);
  }, [tradelines]);

  const handleFieldChange = (
    index: number, 
    field: keyof ScoredTradeline | string, 
    value: any,
    nestedField?: string
  ) => {
    const newTradelines = [...tradelines];
    const tradeline = { ...newTradelines[index] };

    if (nestedField && typeof tradeline[field as keyof ScoredTradeline] === 'object') {
      // Handle nested updates like dates.opened or amounts.high
      (tradeline[field as keyof ScoredTradeline] as any) = {
        ...(tradeline[field as keyof ScoredTradeline] as any),
        [nestedField]: value
      };
    } else {
      (tradeline[field as keyof ScoredTradeline] as any) = value;
    }

    newTradelines[index] = tradeline;
    setTradelines(newTradelines);
  };

  const handleApprove = async () => {
    // Transform ScoredTradeline back to the schema expected by the API
    // The API expects dates as Date objects, but inputs might give strings
    const cleanedTradelines = tradelines.map(tl => ({
      accountNumber: tl.accountNumber,
      creditorName: tl.creditorName,
      accountType: tl.accountType,
      balance: Number(tl.balance),
      status: tl.status,
      dates: {
        opened: tl.dates.opened ? new Date(tl.dates.opened) : null,
        reported: tl.dates.reported ? new Date(tl.dates.reported) : null,
        closed: tl.dates.closed ? new Date(tl.dates.closed) : null,
        dofd: tl.dates.dofd ? new Date(tl.dates.dofd) : null,
      },
      amounts: {
        high: tl.amounts.high ? Number(tl.amounts.high) : undefined,
        pastDue: tl.amounts.pastDue ? Number(tl.amounts.pastDue) : undefined,
      },
      remarkCodes: tl.remarkCodes
    }));

    try {
      await approveMutation.mutateAsync({
        reviewSessionId,
        region,
        fileName,
        mimeType,
        bytesBase64: fileData,
        tradelines: cleanedTradelines,
      });
      onComplete?.();
    } catch (e) {
      // Error handled by mutation hook
    }
  };

  const handleReject = async () => {
    try {
      await rejectMutation.mutateAsync({
        reviewSessionId,
        reason: rejectReason,
      });
      setIsRejectDialogOpen(false);
      onComplete?.();
    } catch (e) {
      // Error handled by mutation hook
    }
  };

  if (approveMutation.isPending || rejectMutation.isPending) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <div className={styles.loadingState}>
          <Skeleton className={styles.loadingSkeleton} />
          <p>Processing review...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.fileInfo}>
            <FileText className={styles.icon} />
            <div>
              <h2 className={styles.title}>Review Extraction</h2>
              <p className={styles.subtitle}>{fileName}</p>
            </div>
          </div>
          <div className={styles.scoreContainer}>
            <span className={styles.scoreLabel}>Extraction Quality</span>
            <Badge variant={getConfidenceColor(overallScore / 100)}>
              <Percent size={12} className="mr-1" />
              {overallScore}%
            </Badge>
          </div>
        </div>
        <div className={styles.actions}>
          <Button 
            variant="destructive" 
            onClick={() => setIsRejectDialogOpen(true)}
            disabled={approveMutation.isPending}
          >
            <X size={16} /> Reject
          </Button>
          <Button 
            variant="primary" 
            onClick={handleApprove}
            disabled={approveMutation.isPending}
          >
            <Save size={16} /> Approve & Save
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        {tradelines.length === 0 ? (
          <div className={styles.emptyState}>
            <AlertTriangle size={48} className={styles.emptyIcon} />
            <h3>No Tradelines Detected</h3>
            <p>The OCR process could not identify any tradelines in this document.</p>
          </div>
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Creditor / Account #</TableHead>
                  <TableHead>Type / Status</TableHead>
                  <TableHead>Balance / Amounts</TableHead>
                  <TableHead>Dates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tradelines.map((tl, idx) => (
                  <TableRow key={idx} className={styles.row}>
                    <TableCell className={styles.cellGroup}>
                      <div className={styles.fieldGroup}>
                        <div className={styles.inputWrapper}>
                          <Building2 size={14} className={styles.inputIcon} />
                          <Input
                            value={tl.creditorName}
                            onChange={(e) => handleFieldChange(idx, "creditorName", e.target.value)}
                            className={styles.input}
                            placeholder="Creditor Name"
                          />
                          <ConfidenceBadge score={tl.confidence?.creditorName || 0} />
                        </div>
                        <div className={styles.inputWrapper}>
                          <Hash size={14} className={styles.inputIcon} />
                          <Input
                            value={tl.accountNumber}
                            onChange={(e) => handleFieldChange(idx, "accountNumber", e.target.value)}
                            className={styles.input}
                            placeholder="Account Number"
                          />
                          <ConfidenceBadge score={tl.confidence?.accountNumber || 0} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={styles.cellGroup}>
                      <div className={styles.fieldGroup}>
                        <div className={styles.inputWrapper}>
                          <Activity size={14} className={styles.inputIcon} />
                          <Input
                            value={tl.accountType}
                            onChange={(e) => handleFieldChange(idx, "accountType", e.target.value)}
                            className={styles.input}
                            placeholder="Account Type"
                          />
                          <ConfidenceBadge score={tl.confidence?.accountType || 0} />
                        </div>
                        <div className={styles.inputWrapper}>
                          <span className={styles.labelIcon}>St</span>
                          <Input
                            value={tl.status}
                            onChange={(e) => handleFieldChange(idx, "status", e.target.value)}
                            className={styles.input}
                            placeholder="Status (e.g. R1)"
                          />
                          <ConfidenceBadge score={tl.confidence?.status || 0} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={styles.cellGroup}>
                      <div className={styles.fieldGroup}>
                        <div className={styles.inputWrapper}>
                          <DollarSign size={14} className={styles.inputIcon} />
                          <Input
                            type="number"
                            value={tl.balance}
                            onChange={(e) => handleFieldChange(idx, "balance", parseFloat(e.target.value))}
                            className={styles.input}
                            placeholder="Balance"
                          />
                          <ConfidenceBadge score={tl.confidence?.balance || 0} />
                        </div>
                        <div className={styles.subFields}>
                          <div className={styles.miniInputWrapper}>
                            <label>High:</label>
                            <Input
                              type="number"
                              value={tl.amounts.high || ""}
                              onChange={(e) => handleFieldChange(idx, "amounts", parseFloat(e.target.value), "high")}
                              className={styles.miniInput}
                            />
                          </div>
                          <div className={styles.miniInputWrapper}>
                            <label>Past Due:</label>
                            <Input
                              type="number"
                              value={tl.amounts.pastDue || ""}
                              onChange={(e) => handleFieldChange(idx, "amounts", parseFloat(e.target.value), "pastDue")}
                              className={`${styles.miniInput} ${tl.amounts.pastDue ? styles.hasPastDue : ''}`}
                            />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className={styles.cellGroup}>
                      <div className={styles.dateGrid}>
                        <div className={styles.dateField}>
                          <label>Opened</label>
                          <div className={styles.inputWrapper}>
                            <Input
                              type="date"
                              value={tl.dates.opened ? new Date(tl.dates.opened).toISOString().slice(0, 10) : ""}
                              onChange={(e) => handleFieldChange(idx, "dates", e.target.value, "opened")}
                              className={styles.dateInput}
                            />
                            <ConfidenceBadge score={tl.confidence?.dates?.opened || 0} />
                          </div>
                        </div>
                        <div className={styles.dateField}>
                          <label>Reported</label>
                          <div className={styles.inputWrapper}>
                            <Input
                              type="date"
                              value={tl.dates.reported ? new Date(tl.dates.reported).toISOString().slice(0, 10) : ""}
                              onChange={(e) => handleFieldChange(idx, "dates", e.target.value, "reported")}
                              className={styles.dateInput}
                            />
                            <ConfidenceBadge score={tl.confidence?.dates?.reported || 0} />
                          </div>
                        </div>
                        <div className={styles.dateField}>
                          <label>DOFD</label>
                          <div className={styles.inputWrapper}>
                            <Input
                              type="date"
                              value={tl.dates.dofd ? new Date(tl.dates.dofd).toISOString().slice(0, 10) : ""}
                              onChange={(e) => handleFieldChange(idx, "dates", e.target.value, "dofd")}
                              className={styles.dateInput}
                            />
                            <ConfidenceBadge score={tl.confidence?.dates?.dofd || 0} />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog.Root open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogOverlay} />
          <Dialog.Content className={styles.dialogContent}>
            <Dialog.Title className={styles.dialogTitle}>Reject Review</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Please provide a reason for rejecting this extraction. This will be logged for audit purposes.
            </Dialog.Description>
            
            <textarea
              className={styles.reasonInput}
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />

            <div className={styles.dialogActions}>
              <Button variant="ghost" onClick={() => setIsRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
              >
                Confirm Reject
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};