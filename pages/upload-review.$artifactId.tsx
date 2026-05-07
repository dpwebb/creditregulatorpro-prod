import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { Save, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { InfractionFindingsPanel } from "../components/InfractionFindingsPanel";
import { OCRReviewPanel } from "../components/OCRReviewPanel";
import { scanForInfractions, InfractionFinding } from "../helpers/regulationInfractionScanner";
import { useReportArtifactWithTradelines } from "../helpers/infractionQueries";
import { useTradelineList } from "../helpers/tradelineQueries";

import { TradelineWithDetails } from "../endpoints/tradeline/list_GET.schema";
import { ScoredTradeline } from "../helpers/ocrQueries";
import styles from "./upload-review.$artifactId.module.css";

// Compatible interface for the scanner, as we are constructing this from DB records
interface ScannableTradeline {
  id?: number;
  creditorId?: number | null;
  accountNumber: string;
  creditorName: string;
  status: string;
  balance: number;
  isCollectionAccount?: boolean;
  dates: {
    dofd?: Date | string;
    closed?: Date | string;
    reported?: Date | string;
    opened?: Date | string;
  };
  amounts: {
    pastDue?: number;
  };
}

// Location state type for OCR Review Mode (from upload page)
interface OCRReviewLocationState {
  reviewSessionId: string;
  extractedData: ScoredTradeline[];
  tradelinesCount: number;
  fileName: string;
  userId: number;
  region: string;
  bytesBase64: string;
  mimeType: string;
}

export default function UploadReviewPage() {
  const { artifactId } = useParams<{ artifactId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as OCRReviewLocationState | null;
  
  // Determine mode: OCR Review (from location state) or Artifact Review (from URL)
  const isOCRReviewMode = !!locationState?.reviewSessionId;
  
  
  const [findings, setFindings] = useState<InfractionFinding[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  // Parse artifact ID from URL
  const parsedArtifactId = artifactId ? parseInt(artifactId, 10) : 0;
  
  // 1. Fetch artifact details (only in Artifact Review Mode)
  const { 
    artifact, 
    tradelines: jsonTradelines, 
    isLoading: isArtifactLoading, 
    error: artifactError 
  } = useReportArtifactWithTradelines(isOCRReviewMode ? 0 : parsedArtifactId);

  // 2. Fetch fresh tradelines from DB (only in Artifact Review Mode)
  const {
    data: tradelineList,
    isLoading: isTradelineListLoading,
    error: tradelineListError
  } = useTradelineList();

  // 3. Resolve which tradelines to scan (only in Artifact Review Mode)
  const effectiveTradelines = useMemo(() => {
    if (isOCRReviewMode) return [];
    if (!artifact) return [];

    // Check for IDs in artifact data
    const data = artifact.data as Record<string, any> | null;
    const tradelineIds = (data?.tradelineIds as number[]) || [];

    // If we have IDs and the DB list is loaded, filter and map DB records
    if (tradelineIds.length > 0 && tradelineList?.tradelines) {
      const dbTradelines = tradelineList.tradelines.filter(tl => 
        tradelineIds.includes(tl.id)
      );

      return dbTradelines.map((tl: TradelineWithDetails) => {
         const balance = typeof tl.currentBalance === 'string' ? parseFloat(tl.currentBalance) : (tl.currentBalance || 0);
         const pastDue = typeof tl.amountPastDue === 'string' ? parseFloat(tl.amountPastDue) : (tl.amountPastDue || 0);

         // Map DB schema to Scanner schema
         return {
           id: tl.id,
           creditorId: tl.creditorId,
           accountNumber: tl.accountNumber,
           // Prefer original creditor, fallback to current creditor
           creditorName: tl.originalCreditorName || tl.creditorName || "Unknown Creditor",
           status: tl.status || "Open",
           balance: isNaN(balance) ? 0 : balance,
                      isCollectionAccount: tl.isCollectionAccount ?? false,
           originalCreditorName: tl.originalCreditorName || undefined,
           dates: {
             dofd: tl.dateOfFirstDelinquency ? new Date(tl.dateOfFirstDelinquency) : undefined,
             closed: tl.dateClosed ? new Date(tl.dateClosed) : undefined,
             reported: undefined, // DB doesn't track 'reported date' yet, checks for stale data will be skipped
             opened: tl.openedDate ? new Date(tl.openedDate) : undefined,
           },
           amounts: {
             pastDue: isNaN(pastDue) ? 0 : pastDue,
           }
         } as ScannableTradeline;
      });
    }

    // Fallback to JSON tradelines if no IDs found in artifact (legacy support)
    return jsonTradelines as ScannableTradeline[];
  }, [isOCRReviewMode, artifact, tradelineList, jsonTradelines]);

  // Run infraction scanner (only in Artifact Review Mode)
  useEffect(() => {
    if (isOCRReviewMode) return;
    
    if (effectiveTradelines.length > 0 && artifact) {
      setIsScanning(true);
      try {
        const results = scanForInfractions(effectiveTradelines as any, {
          reportDate: artifact.reportDate ? new Date(artifact.reportDate) : new Date(0),
          region: "CA"
        });
        setFindings(results);
        
        if (results.length > 0) {
          console.log(`Detected ${results.length} potential regulatory infractions.`);
        }
      } catch (err) {
        console.error("Scan failed", err);
        toast.error("Failed to complete regulatory scan.");
      } finally {
        setIsScanning(false);
      }
    }
  }, [isOCRReviewMode, effectiveTradelines, artifact]);

  const handleOCRReviewComplete = () => {
    toast.success("Review completed successfully");
    // Navigate to dashboard or artifact list
    navigate("/");
  };

  // Loading state
  const isLoading = isOCRReviewMode 
    ? false 
    : (isArtifactLoading || isTradelineListLoading || isScanning);
  
  const error = isOCRReviewMode ? null : (artifactError || tradelineListError);

  // Error state: no location state and no valid artifact ID
  if (!isOCRReviewMode && !parsedArtifactId) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} className={styles.errorIcon} />
        <h2>Invalid Request</h2>
        <p>
          No review data found. Please upload a report to begin the review process.
        </p>
        <Button asChild className={styles.backButton}>
          <Link to="/upload">Go to Upload</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>
          {isScanning ? "Auditing report for Provincial CRA violations..." : "Loading report data..."}
        </p>
      </div>
    );
  }

  if (error || (!isOCRReviewMode && !artifact)) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} className={styles.errorIcon} />
        <h2>Report Not Found</h2>
        <p>
          {error instanceof Error ? error.message : "The requested report artifact could not be retrieved or contains no data."}
        </p>
        <Button asChild className={styles.backButton}>
          <Link to="/upload">Return to Upload</Link>
        </Button>
      </div>
    );
  }

  // Render OCR Review Mode
  if (isOCRReviewMode && locationState) {
    return (
      <div className={styles.container}>
        <Link to="/upload" className={styles.backLink}>
          ← Back to Upload
        </Link>
        <PageHeader
          title="Review Extracted Data"
          subtitle={`${locationState.extractedData.length} Tradelines Extracted • Human Review Required`}
          
        />

        <div className={styles.content}>
          <OCRReviewPanel
            reviewSessionId={locationState.reviewSessionId}
            initialData={locationState.extractedData}
            fileName={locationState.fileName}
            mimeType={locationState.mimeType}
            fileData={locationState.bytesBase64}
            region={locationState.region}
            onComplete={handleOCRReviewComplete}
          />
        </div>
      </div>
    );
  }

  // Render Artifact Review Mode (existing functionality)
  return (
    <div className={styles.container}>
      <Link to="/upload" className={styles.backLink}>
        ← Back to Upload
      </Link>
      <PageHeader
        title="Regulation Infraction Audit"
        subtitle={`Artifact #${parsedArtifactId} • ${effectiveTradelines.length} Tradelines Scanned`}
        
      >
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={() => toast.info("Report download started")}>
            <FileText size={16} /> Download Report
          </Button>
          <Button onClick={() => navigate("/")}>
            <Save size={16} /> Save & Finish
          </Button>
        </div>
      </PageHeader>

      <div className={styles.content}>
        <InfractionFindingsPanel 
          findings={findings}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.disclaimerSection}>
          <p className={styles.disclaimer}>
            * Automated findings are based on Metro2 and Provincial CRA compliance checks. 
            Manual review is recommended before initiating legal disputes.
          </p>
          <p className={styles.strategyNote}>
            <strong>Strategy Note:</strong> The obligation rotation framework is designed to work whether violations are initially found or not. You can always proceed with baseline procedural testing (Sequence 1) to compel creditors to prove their authority and accuracy.
          </p>
        </div>
        
        <div className={styles.footerActions}>
          <Button asChild variant="secondary" size="lg">
            <Link to="/my-accounts">
              Proceed to Manual Tradeline Entry &rarr;
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
