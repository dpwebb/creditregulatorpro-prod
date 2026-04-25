import React, { useState } from "react";
import { 
  FileText, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Download,
  Eye
} from "lucide-react";
import { format } from "../helpers/dateUtils";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "./Accordion";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table";
import { EvidenceUploadDialog } from "./EvidenceUploadDialog";
import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { useAttachmentList } from "../helpers/attachmentQueries";
import styles from "./ChallengeEvidencePanel.module.css";

interface ChallengeEvidencePanelProps {
  tradelineId: number;
  compact?: boolean;
  sentOnly?: boolean;
  className?: string;
}

export const ChallengeEvidencePanel: React.FC<ChallengeEvidencePanelProps> = ({
  tradelineId,
  compact = false,
  sentOnly = false,
  className,
}) => {
  const [uploadObligationId, setUploadObligationId] = useState<number | null>(null);
  
  const { 
    data, 
    isLoading: isLoadingInstances 
  } = useObligationInstanceList({ tradelineId });
  
  let instances = data?.instances;

  if (instances && sentOnly) {
    const activeStates = ["CHALLENGED", "NO_RESPONSE", "INSUFFICIENT_RESPONSE", "PROCEDURALLY_EXHAUSTED"];
    instances = instances.filter(i => i.challengeSentDate || activeStates.includes(i.state as string));
  }

  if (isLoadingInstances) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!instances || instances.length === 0) {
    return (
      <div className={`${styles.emptyState} ${className || ""}`}>
        <AlertCircle className={styles.emptyIcon} size={32} />
        <p className={styles.emptyText}>No letters have been created for this account yet.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <Accordion type="single" collapsible className={styles.accordion}>
        {instances.map((instance) => (
          <ChallengeItem 
            key={instance.id} 
            instance={instance} 
            compact={compact}
            onUpload={() => setUploadObligationId(instance.id)}
          />
        ))}
      </Accordion>

      <EvidenceUploadDialog
        open={!!uploadObligationId}
        onOpenChange={(open) => !open && setUploadObligationId(null)}
        obligationInstanceId={uploadObligationId || undefined}
      />
    </div>
  );
};

const ChallengeItem = ({ 
  instance, 
  compact,
  onUpload 
}: { 
  instance: any, 
  compact: boolean,
  onUpload: () => void 
}) => {
  const { data: attachments, isLoading } = useAttachmentList({ 
    obligationInstanceId: instance.id 
  });

  const evidenceCount = attachments?.length || 0;
  const hasEvidence = evidenceCount > 0;

  return (
    <AccordionItem value={instance.id.toString()}>
      <AccordionTrigger className={styles.trigger}>
        <div className={styles.headerContent}>
          <div className={styles.headerMain}>
            <span className={styles.obligationType}>
              {instance.obligationType || "Unknown Obligation"}
            </span>
            <Badge 
              variant={
                instance.state === "PROCEDURALLY_EXHAUSTED" ? "success" :
                instance.state === "CHALLENGED" ? "warning" : "default"
              }
              className={styles.statusBadge}
            >
              {instance.state?.replace(/_/g, " ") || "PENDING"}
            </Badge>
          </div>
          <div className={styles.headerMeta}>
            <span className={styles.date}>
              {instance.createdAt ? format(new Date(instance.createdAt), "MMM d, yyyy") : "-"}
            </span>
            <Badge variant={hasEvidence ? "info" : "default"}>
              {evidenceCount} Evidence
            </Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className={styles.content}>
          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Dispute Vector</span>
              <span className={styles.detailValue}>{instance.disputeVector || "N/A"}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Description</span>
              <span className={styles.detailValue}>{instance.obligationDescription}</span>
            </div>
          </div>

          <div className={styles.evidenceSection}>
            <div className={styles.evidenceHeader}>
              <h4 className={styles.evidenceTitle}>Attached Evidence</h4>
              <Button size="sm" variant="outline" onClick={onUpload}>
                <Upload size={14} />
                Upload
              </Button>
            </div>

            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : evidenceCount === 0 ? (
              <div className={styles.noEvidence}>
                <p>No evidence uploaded yet.</p>
              </div>
            ) : (
              <Table className={styles.evidenceTable}>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    {!compact && <TableHead>Type</TableHead>}
                    {!compact && <TableHead>Size</TableHead>}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attachments?.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>
                        <div className={styles.fileCell}>
                          <FileText size={14} className={styles.fileIcon} />
                          <span>{file.fileName}</span>
                        </div>
                      </TableCell>
                      {!compact && (
                        <TableCell>
                          {file.fileType.split("/")[1]?.toUpperCase()}
                        </TableCell>
                      )}
                      {!compact && (
                        <TableCell>
                          {(file.fileSizeBytes / 1024).toFixed(1)} KB
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {/* storageUrl is omitted from list response, hiding download action for now or could implement specific download handler */}
                        <div className="w-8" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};