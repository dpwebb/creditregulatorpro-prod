import React from "react";
import { useParams, Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { BureauBadge } from "../components/BureauBadge";
import { UploadScanSummary } from "../components/UploadScanSummary";
import { useUploadResults } from "../helpers/uploadResultsQueries";
import { useAuth } from "../helpers/useAuth";

import styles from "./upload-results.$artifactId.module.css";

export default function UploadResultsPage() {
  const { artifactId } = useParams<{ artifactId: string }>();
  const parsedId = artifactId ? parseInt(artifactId, 10) : 0;
  
  const { data, isLoading, error, refetch } = useUploadResults(parsedId);
  
  const { isAdmin } = useAuth();

  const isFollowUp = !!data?.crossReference;
  const pageTitle = isFollowUp ? "What Changed" : "What We Found";
  const pageSubtitle = isLoading
    ? "Analyzing report..."
    : isFollowUp
      ? `Compared to ${data!.crossReference!.previousFileName} from ${new Date(data!.crossReference!.previousUploadDate).toLocaleDateString()}`
      : `Analysis complete for ${data?.metadata.bureauName || "Unknown"} report — ${data?.metadata.fileName || "Report"}`;

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} className={styles.errorIcon} />
        <h2>Scan Analysis Failed</h2>
        <p>
          {error instanceof Error ? error.message : "Unable to retrieve scan results."}
        </p>
        <div className={styles.errorActions}>
          <Button onClick={() => refetch()} variant="outline">Retry</Button>
          <Button asChild variant="primary">
            <Link to="/upload">Return to Upload</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
      >
        {data?.metadata?.bureauName && (
          <BureauBadge bureauName={data.metadata.bureauName} size="md" />
        )}
        <Button asChild variant="ghost" size="sm">
          <Link to="/upload"><ArrowLeft size={16} /> Back to Upload</Link>
        </Button>
      </PageHeader>

      <div className={styles.content}>
        
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <h3 className={styles.loadingTitle}>We're reviewing your report!</h3>
            <p className={styles.loadingText}>
              This usually takes about 1 to 3 minutes. Hang tight, you can stay right here on this page while we finish up.
            </p>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar}></div>
            </div>
          </div>
        ) : data ? (
          <>
            {!isAdmin && (
              <div className={styles.nextStepBanner}>
                <div className={styles.nextStepContent}>
                  <h3 className={styles.nextStepTitle}>Great news — we finished checking your report!</h3>
                  <p className={styles.nextStepText}>Your next step is to look at your accounts and see what we found.</p>
                </div>
                <div className={styles.nextStepAction}>
                  <Button asChild variant="primary">
                    <Link to="/my-accounts">Review Your Accounts <ArrowRight size={16} /></Link>
                  </Button>
                </div>
              </div>
            )}
            <UploadScanSummary 
              data={data} 
              artifactId={parsedId} 
            />
          </>
        ) : null}
      </div>

      {!isLoading && data && (
        <div className={styles.footer}>
          <div className={styles.strategyNote}>
            <strong>Tip:</strong> Even if no big problems showed up, it's still worth sending letters. The companies must prove everything is correct.
          </div>
        </div>
      )}
    </div>
  );
}