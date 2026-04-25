import React, { useRef, useState, useMemo, Suspense } from "react";
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
import { useReportArtifactViewer } from "../helpers/useReportArtifactViewer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs";

import { Printer, Download, FileText } from "lucide-react";
import { format } from "../helpers/dateUtils";
import { SourceReportTextView } from "./SourceReportTextView";

const SourceReportPdfView = React.lazy(() => import("./SourceReportPdfView").then(m => ({ default: m.SourceReportPdfView })));
import styles from "./SourceReportViewer.module.css";

interface SourceReportViewerProps {
  reportArtifactId: number | null;
  sourceText?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SourceReportViewer({
  reportArtifactId,
  sourceText,
  open,
  onOpenChange,
}: SourceReportViewerProps) {
  const { reportArtifact, isLoading } = useReportArtifactViewer(reportArtifactId);

  const [isPrinting, setIsPrinting] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  // Convert base64 PDF to blob URL for the viewer
  const pdfBlobUrl = useMemo(() => {
    if (!reportArtifact?.storageUrl) return null;

    try {
      // Check if it's a data URL or raw base64
      const base64Data = reportArtifact.storageUrl.startsWith("data:")
        ? reportArtifact.storageUrl.split(",")[1]
        : reportArtifact.storageUrl;

      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Failed to create blob URL from PDF data", e);
      return null;
    }
  }, [reportArtifact?.storageUrl]);

  // Cleanup blob URL on unmount or when artifact changes
  React.useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  const handlePrint = () => {
    if (!pdfBlobUrl) return;
    setIsPrinting(true);

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

    iframe.src = pdfBlobUrl;
  };

  const handleDownload = () => {
    if (!pdfBlobUrl || !reportArtifact) return;

    try {
      const link = document.createElement("a");
      link.href = pdfBlobUrl;
      link.download = `report-${reportArtifact.id}-${format(
        new Date(),
        "yyyyMMdd"
      )}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  const renderContent = () => {
    // If we have source text, we show tabs
    if (sourceText && !isLoading && reportArtifact) {
      return (
        <Tabs defaultValue="pdf" className={styles.tabsContainer}>
          <div className={styles.tabsHeader}>
            <TabsList>
              <TabsTrigger value="pdf">PDF View</TabsTrigger>
              <TabsTrigger value="text">Source Text</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="pdf" className={styles.tabContent}>
            <Suspense fallback={<Skeleton style={{ width: "100%", height: "100%" }} />}>
              <SourceReportPdfView
                pdfBlobUrl={pdfBlobUrl}
                isLoading={isLoading}
                error={null} // We handle error in parent wrapper effectively by not rendering this, but can pass through
                sourceText={sourceText}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="text" className={styles.tabContent}>
            <SourceReportTextView text={sourceText} />
          </TabsContent>
        </Tabs>
      );
    }

    // Default view (loading, error, or no source text)
    return (
      <Suspense fallback={<Skeleton style={{ width: "100%", height: "100%" }} />}>
        <SourceReportPdfView
          pdfBlobUrl={pdfBlobUrl}
          isLoading={isLoading}
          error={null} // We rely on parent's handling or let child handle basic errors
          sourceText={null}
        />
      </Suspense>
    );
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
                  <DialogTitle>Source Report Viewer</DialogTitle>
                  <DialogDescription>
                    {reportArtifactId
                      ? `Viewing Artifact #${reportArtifactId}`
                      : "Loading..."}
                  </DialogDescription>
                </div>
              </div>
              <div className={styles.actions}>
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
            ) : reportArtifact ? (
              <div className={styles.metadataGrid}>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Type</span>
                  <Badge variant="default">
                    {reportArtifact.artifactType || "Unknown"}
                  </Badge>
                </div>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Report Date</span>
                  <span className={styles.value}>
                    {reportArtifact.reportDate
                      ? format(new Date(reportArtifact.reportDate), "MMM d, yyyy")
                      : "-"}
                  </span>
                </div>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Imported</span>
                  <span className={styles.value}>
                    {reportArtifact.createdAt
                      ? format(
                          new Date(reportArtifact.createdAt),
                          "MMM d, yyyy HH:mm"
                        )
                      : "-"}
                  </span>
                </div>
                <div className={styles.metadataItem}>
                  <span className={styles.label}>Metro 2</span>
                  <span className={styles.valueMono}>
                    {reportArtifact.metro2Version || "N/A"}
                  </span>
                </div>
                {reportArtifact.sha256 && (
                  <div className={styles.metadataItem}>
                    <span className={styles.label}>SHA-256</span>
                    <span
                      className={styles.valueMono}
                      title={reportArtifact.sha256}
                    >
                      {reportArtifact.sha256.substring(0, 8)}...
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </DialogHeader>

          <div className={styles.contentArea}>{renderContent()}</div>

          <DialogFooter className={styles.footer}>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Hidden iframe for printing */}
      <iframe
        ref={printFrameRef}
        style={{ display: "none", position: "absolute", width: 0, height: 0 }}
        title="Print Frame"
      />
    </>
  );
}