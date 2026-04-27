import React, { useEffect } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import { searchPlugin } from "@react-pdf-viewer/search";
import { AlertCircle, FileText } from "lucide-react";
import { Skeleton } from "./Skeleton";
import { PDF_WORKER_URL } from "../helpers/pdfWorker";
import "@react-pdf-viewer/core/lib/styles/index.css";

import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import "@react-pdf-viewer/search/lib/styles/index.css";
import styles from "./SourceReportPdfView.module.css";

interface SourceReportPdfViewProps {
  pdfBlobUrl: string | null;
  isLoading: boolean;
  error: unknown;
  sourceText?: string | null;
}

export function SourceReportPdfView({
  pdfBlobUrl,
  isLoading,
  error,
  sourceText,
}: SourceReportPdfViewProps) {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  const searchPluginInstance = searchPlugin();
  const { highlight } = searchPluginInstance;

  // Effect to trigger search when PDF loads and sourceText is available
  useEffect(() => {
    if (sourceText && pdfBlobUrl) {
      // Heuristic: Take the first 8 words to avoid extremely long search queries
      // that might fail due to minor OCR discrepancies or line breaks.
      const words = sourceText.trim().split(/\s+/);
      const keyword = words.slice(0, 8).join(" ");
      
      if (keyword) {
        // Add a small delay to ensure the document is rendered
        const timer = setTimeout(() => {
          highlight({
            keyword,
            matchCase: false,
          });
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [sourceText, pdfBlobUrl, highlight]);

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Skeleton className={styles.pdfSkeleton} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <AlertCircle size={32} />
        <p>Failed to load report artifact</p>
      </div>
    );
  }

  if (!pdfBlobUrl) {
    return (
      <div className={styles.emptyState}>
        <FileText size={48} />
        <p>No PDF content available for this artifact</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {sourceText && (
        <div className={styles.highlightNotice}>
          Attempting to highlight relevant section based on source text...
        </div>
      )}
      <div className={styles.viewerContainer}>
        <Worker workerUrl={PDF_WORKER_URL}>
          <Viewer
            fileUrl={pdfBlobUrl}
            plugins={[defaultLayoutPluginInstance, searchPluginInstance]}
          />
        </Worker>
      </div>
    </div>
  );
}
