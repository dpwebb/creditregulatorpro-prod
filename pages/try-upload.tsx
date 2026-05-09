import { useState, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet";
import { Link, useSearchParams } from "react-router-dom";
import { Home } from "lucide-react";
import { FileDropzone } from "../components/FileDropzone";
import { CreditReportGuide } from "../components/CreditReportGuide";
import { Spinner } from "../components/Spinner";
import { Progress } from "../components/Progress";
import { AnonymousUploadPreview } from "../components/AnonymousUploadPreview";
import { useAnonymousUpload } from "../helpers/useAnonymousUpload";
import { storeAnonymousReportForSignup } from "../helpers/anonymousReportHandoff";
import { toast } from "sonner";
import styles from "./try-upload.module.css";

const ESTIMATED_ANALYSIS_DURATION_MS = 90_000;
const MIN_ANALYSIS_PROGRESS = 8;
const MAX_ANALYSIS_PROGRESS = 95;

// Helper function to read file as base64 safely
const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as string."));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

export default function TryUploadPage() {
  const uploadMutation = useAnonymousUpload();
  const [searchParams] = useSearchParams();
  const defaultIsGuide = searchParams.get("guide") === "true";
  const [activeTab, setActiveTab] = useState<"upload" | "guide">(defaultIsGuide ? "guide" : "upload");
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Local state to store successful result payload
  const [resultData, setResultData] = useState<{
    problemCount: number;
    sampleProblems: { type: string; title: string; detail: string; solution?: string; urgency?: string }[];
  } | null>(null);

  useEffect(() => {
    if (!uploadMutation.isPending) {
      setAnalysisProgress(0);
      return;
    }

    const startedAt = Date.now();
    setAnalysisProgress(MIN_ANALYSIS_PROGRESS);

    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progressRange = MAX_ANALYSIS_PROGRESS - MIN_ANALYSIS_PROGRESS;
      const estimatedProgress =
        MIN_ANALYSIS_PROGRESS + (elapsed / ESTIMATED_ANALYSIS_DURATION_MS) * progressRange;

      setAnalysisProgress(Math.min(MAX_ANALYSIS_PROGRESS, Math.round(estimatedProgress)));
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [uploadMutation.isPending]);

  const handleErrorMessage = useCallback((files: File[], errorType: 'type' | 'size' | 'count') => {
    if (errorType === 'type' && files.length > 0) {
      const fileName = files[0].name.toLowerCase();
      if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        return "This looks like a picture, not a PDF file. Please upload the actual PDF you downloaded from Equifax or TransUnion.";
      }
      if (fileName.match(/\.(html|htm)$/)) {
        return "This is a web page file, not a PDF. Go back to the bureau website and look for a 'Download PDF' or 'Save as PDF' button.";
      }
      if (fileName.match(/\.(doc|docx)$/)) {
        return "This is a Word document, not a PDF. Your credit report should be a .pdf file from Equifax or TransUnion.";
      }
      return "This file type isn't supported. We need a PDF file (.pdf) — the kind you download from Equifax or TransUnion.";
    }
    return undefined;
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    
    const file = files[0];
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Please upload a PDF format credit report.");
      return;
    }
    const mimeType = "application/pdf";

    try {
      const base64Data = await readFileAsBase64(file);

      uploadMutation.mutate(
        {
          bytesBase64: base64Data,
          fileName: file.name,
          mimeType,
          region: "CA",
        },
        {
          onSuccess: (data) => {
            storeAnonymousReportForSignup({
              bytesBase64: base64Data,
              fileName: file.name,
              mimeType,
              region: "CA",
            });
            sessionStorage.removeItem("crp_anon_artifact_id");
            sessionStorage.removeItem("crp_anon_claim_token");
            
            setResultData({
              problemCount: data.problemCount,
              sampleProblems: data.sampleProblems,
            });
            toast.success("Analysis complete!");
          },
          onError: (err) => {
            toast.error(err.message || "Upload failed. Please try again.");
          },
        }
      );
    } catch (error) {
      toast.error("An error occurred while reading the file.");
      console.error(error);
    }
  };

  return (
    <div className={styles.pageContainer}>
      <Helmet>
        <title>Try It Free - Upload Credit Report | Credit Regulator Pro</title>
        <meta
          name="description"
          content="Upload your Canadian credit report to uncover errors and compliance findings instantly, no account needed."
        />
      </Helmet>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logoLink}>
            <img
              src="/brand/logo-horizontal.png"
              alt="Credit Regulator Pro"
              className={styles.logoImage}
            />
          </Link>
          <Link to="/" className={styles.homeButton} aria-label="Go to homepage">
            <Home size={18} aria-hidden="true" />
            <span>Home</span>
          </Link>
        </div>
      </header>

      <main className={styles.mainContent}>
        {!resultData && !uploadMutation.isPending && (
          <>
            <div className={styles.heroText}>
              <h1 className={styles.title}>Try It Free — Upload Your Credit Report</h1>
              <p className={styles.subtitle}>
                See how many problems we find. Secure, fast, and no account needed.
              </p>
            </div>
            
            <div className={styles.tabsContainer}>
              <button 
                className={`${styles.tabButton} ${activeTab === "upload" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("upload")}
              >
                Upload Your Report
              </button>
              <button 
                className={`${styles.tabButton} ${activeTab === "guide" ? styles.activeTab : ""}`}
                onClick={() => setActiveTab("guide")}
              >
                Get Your Free Report
              </button>
            </div>

            {activeTab === "upload" ? (
              <div className={styles.uploadSection}>
                <FileDropzone
                  accept=".pdf,application/pdf"
                  maxFiles={1}
                  maxSize={20 * 1024 * 1024} // 20 MB
                  onFilesSelected={handleFilesSelected}
                  errorMessageOverride={handleErrorMessage}
                  title="Drop your PDF credit report here"
                  subtitle="Original Equifax or TransUnion PDF only"
                />
                <div className={styles.helpTextContainer}>
                  <p className={styles.helpText}>
                    Not sure if you have the right file? It should be the original downloaded PDF from Equifax or TransUnion Canada, not a photo or scan.
                  </p>
                  <button 
                    className={styles.helpLink} 
                    onClick={() => setActiveTab("guide")}
                  >
                    Need help getting your report?
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.guideSection}>
                <CreditReportGuide onSwitchToUpload={() => setActiveTab("upload")} />
              </div>
            )}
          </>
        )}

        {uploadMutation.isPending && (
          <div className={styles.loadingContainer}>
            <Spinner size="lg" />
            <div className={styles.loadingText}>Reading Your Report...</div>
            <div className={styles.progressGroup}>
              <div className={styles.progressHeader}>
                <span>Estimated progress</span>
                <span>{analysisProgress}%</span>
              </div>
              <Progress value={analysisProgress} className={styles.analysisProgress} />
            </div>
            <div className={styles.loadingSubText}>
              Checking your report for problems. This usually takes 30–90 seconds.
            </div>
          </div>
        )}

        {resultData && !uploadMutation.isPending && (
          <AnonymousUploadPreview
            problemCount={resultData.problemCount}
            sampleProblems={resultData.sampleProblems}
          />
        )}
      </main>
    </div>
  );
}
