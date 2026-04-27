import React, { useRef, useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./Dialog";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { usePacketViewer } from "../helpers/usePacketViewer";
import { useSavePacket, useDeletePacket } from "../helpers/packetQueries";
import type { PreviewPacket } from "../endpoints/packet/create_POST.schema";

import { Printer, Download, FileText, AlertCircle, Send, CheckCircle2, Save, Trash2, FileCheck } from "lucide-react";
import { format } from "../helpers/dateUtils";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { toast } from "sonner";
import { DeliveryWizard } from "./DeliveryWizard";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import { useUpdatePacketStatus } from "../helpers/useUpdatePacketStatus";
import { PacketDetail } from "../endpoints/packet/get_GET.schema";
import { getPacketPdfUrl } from "../endpoints/packet/pdf_GET.schema";
import { PDF_WORKER_URL } from "../helpers/pdfWorker";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import styles from "./PacketViewer.module.css";

// Extend the packet type locally to include delivery fields that might be returned by backend
// but are not in the strict Pick<...> type of the schema file
type ExtendedPacket = PacketDetail & {
  deliveryMethod?: string | null;
  trackingNumber?: string | null;
  sentDate?: string | Date | null;
  letterDate?: string | Date | null;
  consumerCertification?: boolean | null;
  recipientName?: string | null;
};

interface PacketViewerProps {
  packetId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewData?: PreviewPacket | null;
  onSaved?: (packetId: number) => void;
  onDeleted?: (packetId: number) => void;
  className?: string;
}

/**
 * Converts a base64 PDF string to a blob URL.
 */
function base64ToBlobUrl(base64: string): string {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export function PacketViewer({
  packetId,
  open,
  onOpenChange,
  previewData,
  onSaved,
  onDeleted,
  className,
}: PacketViewerProps) {
  const { packet: rawPacket, isLoading, error } = usePacketViewer(packetId, previewData);
  const packet = rawPacket as ExtendedPacket | null;
  
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDeliveryWizardOpen, setIsDeliveryWizardOpen] = useState(false);
  const [wizardInitialStep, setWizardInitialStep] = useState<"choose" | "crp" | "self">("choose");
  const [createdPacketId, setCreatedPacketId] = useState<number | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    // Reset createdPacketId when new previewData arrives (prevents stale ID from previous send)
  useEffect(() => {
    if (previewData) {
      setCreatedPacketId(null);
    }
  }, [previewData]);

  const effectivePacketId = packetId || createdPacketId;
  const { mutateAsync: savePacket, isPending: isSaving } = useSavePacket();
  const { mutateAsync: deletePacket, isPending: isDeleting } = useDeletePacket();
  const updatePacketStatus = useUpdatePacketStatus();
  
  // State for the resolved blob URL (handles both signed HTTPS URLs and legacy base64)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  useEffect(() => {
    let createdBlobUrl: string | null = null;

    if (previewData?.pdfStorageUrl) {
      try {
        const blobUrl = base64ToBlobUrl(previewData.pdfStorageUrl);
        createdBlobUrl = blobUrl;
        setPdfBlobUrl(blobUrl);
      } catch (e) {
        console.error("Failed to resolve preview PDF URL", e);
        setPdfBlobUrl(null);
      }
    } else if (packet?.id) {
      setPdfBlobUrl(getPacketPdfUrl({ packetId: packet.id }));
    } else {
      setPdfBlobUrl(null);
    }

    return () => {
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [previewData?.pdfStorageUrl, packet?.id]);

  const handleSave = async () => {
    if (createdPacketId) return createdPacketId;
    if (!previewData) return null;
    try {
      const res = await savePacket({
        tradelineId: previewData.tradelineId!,
        bureauId: previewData.bureauId,
        status: previewData.status || "Draft",
        terminalLabel: previewData.terminalLabel,
        content: previewData.content || "",
        pdfStorageUrl: previewData.pdfStorageUrl || "",
        creditorObligationTestId: previewData.creditorObligationTestId,
        signatureMode: previewData.signatureMode,
        type: previewData.type,
        recipientName: previewData.recipientName ?? undefined,
        recipientAddressLine1: previewData.recipientAddressLine1 ?? undefined,
        recipientAddressLine2: previewData.recipientAddressLine2 ?? undefined,
        recipientCity: previewData.recipientCity ?? undefined,
        recipientProvince: previewData.recipientProvince ?? undefined,
        recipientPostalCode: previewData.recipientPostalCode ?? undefined,
      });
      const newId = res.packet.id;
      setCreatedPacketId(newId);
      return newId;
    } catch (e) {
      console.error("Failed to save packet", e);
      return null;
    }
  };

  const handlePrint = async () => {
    let printUrl = pdfBlobUrl;
    if (!printUrl && !previewData) return;
    
    setIsPrinting(true);

    if (previewData) {
      const id = await handleSave();
      if (!id) {
        setIsPrinting(false);
        return;
      }
      printUrl = getPacketPdfUrl({ packetId: id });
    }

    if (!printUrl) {
      setIsPrinting(false);
      return;
    }

    // Use the hidden iframe for printing
    const iframe = printFrameRef.current;
    if (!iframe) {
      setIsPrinting(false);
      return;
    }

    iframe.onload = () => {
      try {
        iframe?.contentWindow?.print();
      } catch (e) {
        console.error("Print failed", e);
      } finally {
        setIsPrinting(false);
      }
    };

    iframe.src = printUrl;
  };

  const handleDeleteClick = async () => {
    if (!packetId) return;
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      setTimeout(() => setIsConfirmingDelete(false), 3000);
      return;
    }
    try {
      await deletePacket({ id: packetId });
      onOpenChange(false);
      onDeleted?.(packetId);
    } catch (e) {
      console.error("Failed to delete packet", e);
    }
  };

  const handleDownload = async () => {
    let targetUrl = pdfBlobUrl;
    let targetId = packet?.id || effectivePacketId;

    if (!targetUrl && !previewData) return;

    if (previewData) {
      const id = await handleSave();
      if (!id) return;
      targetUrl = getPacketPdfUrl({ packetId: id });
      targetId = id;
    }

    if (!targetUrl || !targetId) return;

    try {
      const link = document.createElement("a");
      link.href = targetUrl;
      link.download = `packet-${targetId}-${format(new Date(), "yyyyMMdd")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  // Helper to determine badge variant based on status
  const getStatusVariant = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case "generated":
      case "sent":
        return "success";
      case "pending":
        return "warning";
      case "error":
      case "failed":
        return "error";
      default:
        return "default";
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={styles.dialogContent}>
          <DialogHeader className={styles.header}>
            <div className={styles.headerTop}>
              <div className={styles.titleGroup}>
                <div className={styles.iconWrapper}>
                  <FileText size={20} />
                </div>
                <div>
                  <DialogTitle>Your Letter</DialogTitle>
                  <DialogDescription asChild>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }} className="text-muted-foreground text-sm">
                      <span>{previewData ? "Preview — not saved yet" : packetId ? `Letter #${packetId}` : "Loading..."}</span>
                      {previewData && <Badge variant="warning">Preview</Badge>}
                    </div>
                  </DialogDescription>
                </div>
              </div>
              <div className={styles.actions}>
                {previewData && (
                  <Button variant="primary" size="sm" onClick={async () => {
                    const newId = await handleSave();
                    if (newId) {
                      setCreatedPacketId(newId);
                      setWizardInitialStep("choose");
                      setIsDeliveryWizardOpen(true);
                    }
                  }} disabled={isSaving || isLoading}>
                    <Save size={16} />
                    {isSaving ? "Saving..." : "Save Letter"}
                  </Button>
                )}
                
                {!isLoading && packet && !packet.sentDate && (
                  previewData ? (
                    <Button variant="outline" size="sm" onClick={async () => {
                      const newId = await handleSave();
                      if (newId) {
                        setCreatedPacketId(newId);
                        setWizardInitialStep("choose");
                        setIsDeliveryWizardOpen(true);
                      }
                    }} disabled={isSaving}>
                      <Send size={16} />
                      Send This Letter
                    </Button>
                  ) : packet.status === "Ready to Mail" ? (
                    <Button variant="primary" size="sm" onClick={() => {
                      setWizardInitialStep("self");
                      setIsDeliveryWizardOpen(true);
                    }}>
                      <Send size={16} />
                      Record Mailing
                    </Button>
                  ) : (
                    <>
                      {packet.status === "Draft" && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            updatePacketStatus.mutate(
                              { packetId: packet.id, status: "Ready to Mail" },
                              {
                                onSuccess: () => {
                                  toast.success("Letter marked as ready to mail.");
                                }
                              }
                            );
                          }}
                          disabled={updatePacketStatus.isPending}
                        >
                          <FileCheck size={16} />
                          {updatePacketStatus.isPending ? "Marking..." : "Mark Ready to Mail"}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => {
                        setWizardInitialStep("choose");
                        setIsDeliveryWizardOpen(true);
                      }}>
                        <Send size={16} />
                        Send This Letter
                      </Button>
                    </>
                  )
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  disabled={!pdfBlobUrl || isLoading}
                >
                  <Printer size={16} />
                  {isPrinting ? "Preparing..." : "Print"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownload}
                  disabled={!pdfBlobUrl || isLoading}
                >
                  <Download size={16} />
                  Download
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className={styles.metadataSkeleton}>
                <Skeleton className={styles.skeletonBadge} />
                <Skeleton className={styles.skeletonText} />
                <Skeleton className={styles.skeletonText} />
              </div>
            ) : packet ? (
              <div className={styles.metadataGrid}>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Status</span>
                  <Badge variant={getStatusVariant(packet.status)}>
                    {packet.status || "Unknown"}
                  </Badge>
                </div>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Created</span>
                  <span className={styles.value}>
                    {packet.createdAt
                      ? format(new Date(packet.createdAt), "MMM d, yyyy HH:mm")
                      : "-"}
                  </span>
                </div>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Account #</span>
                  <span className={styles.value}>
                    {packet.tradelineAccountNumber || "N/A"}
                  </span>
                </div>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Final Status</span>
                  <span className={styles.valueMono}>
                    {packet.terminalLabel || "-"}
                  </span>
                </div>
                
                {/* Delivery Information */}
                {packet.sentDate && (
                  <>
                    <div className={styles.metadataItem}>
                      <span className={styles.label}>Sent Date</span>
                      <span className={styles.value}>
                        {format(new Date(packet.sentDate), "MMM d, yyyy")}
                      </span>
                    </div>
                    {packet.deliveryMethod && (
                      <div className={styles.metadataItem}>
                        <span className={styles.label}>Method</span>
                        <span className={styles.value}>{packet.deliveryMethod}</span>
                      </div>
                    )}
                    {packet.trackingNumber && (
                      <div className={styles.metadataItem}>
                        <span className={styles.label}>Tracking #</span>
                        <span className={styles.valueMono}>{packet.trackingNumber}</span>
                      </div>
                    )}
                    {packet.consumerCertification && (
                      <div className={styles.metadataItem}>
                        <span className={styles.label}>Certified</span>
                        <span className={styles.value} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={14} className="text-success" />
                          Yes
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </DialogHeader>

          <div className={styles.contentArea}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <Skeleton className={styles.pdfSkeleton} />
              </div>
            ) : error ? (
              <div className={styles.errorState}>
                <AlertCircle size={32} />
                <p>Could not load the letter</p>
              </div>
            ) : pdfBlobUrl ? (
              <div className={styles.viewerContainer}>
                <Worker workerUrl={PDF_WORKER_URL}>
                  <Viewer
                    fileUrl={pdfBlobUrl}
                    plugins={[defaultLayoutPluginInstance]}
                  />
                </Worker>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <FileText size={48} />
                <p>No letter to show</p>
              </div>
            )}
          </div>

          <DialogFooter className={styles.footer}>
            {!previewData && packetId && (
              <div className={styles.footerLeft}>
                <Button
                  variant={isConfirmingDelete ? "destructive" : "ghost"}
                  className={!isConfirmingDelete ? styles.deleteButtonGhost : undefined}
                  onClick={handleDeleteClick}
                  disabled={isDeleting || isLoading}
                >
                  <Trash2 size={16} />
                  {isDeleting ? "Deleting..." : isConfirmingDelete ? "Really Delete?" : "Delete Letter"}
                </Button>
              </div>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {effectivePacketId && isDeliveryWizardOpen && (
        <DeliveryWizard
          packetId={effectivePacketId}
          bureauName={packet?.recipientName || packet?.bureauName || "the credit bureau"}
          open={isDeliveryWizardOpen}
          onOpenChange={(open) => {
            setIsDeliveryWizardOpen(open);
            if (!open && createdPacketId && onSaved) {
              onSaved(createdPacketId);
            }
          }}
          onComplete={() => {
            setIsDeliveryWizardOpen(false);
            if (createdPacketId && onSaved) {
              onSaved(createdPacketId);
            }
          }}
          onDownloadPdf={handleDownload}
          initialStep={wizardInitialStep}
        />
      )}
      {/* Hidden iframe for printing */}
      <iframe
        ref={printFrameRef}
        style={{ display: "none", position: "absolute", width: 0, height: 0 }}
        title="Print Frame"
      />
    </>
  );
}
