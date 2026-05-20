import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileUp, AlertCircle, Info, ChevronDown, ShieldCheck, Phone } from "lucide-react";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { HelpTooltip } from "../components/HelpTooltip";
import { Progress } from "../components/Progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/Collapsible";


import { useUploadReport } from "../helpers/uploadQueries";
import { useAuth } from "../helpers/useAuth";
import { toast } from "sonner";
import { ConsumerInfoMismatchDialog } from "../components/ConsumerInfoMismatchDialog";
import { ConsumerInfoComparison } from "../helpers/fuzzyMatcher";
import { postUserProfile } from "../endpoints/user/profile_POST.schema";
import {
  isQueuedProcessingOutput,
  OutputType as UploadReportOutput,
} from "../endpoints/ingest/report_POST.schema";
import { Helmet } from "react-helmet";
import styles from "./upload.module.css";

const getFriendlyStageName = (stage: string) => {
    if (stage.startsWith("pass_a_")) return "Reading your report...";
  if (stage.startsWith("full_")) return "Reading your report thoroughly...";
  
  switch (stage) {
    case "docstrange_connecting": return "Getting ready...";
    case "docstrange_uploading": return "Sending your file...";
    case "docstrange_processing": return "Reading your report...";
    case "docstrange_parsing": return "Finding your accounts...";
    case "docstrange_validating": return "Double-checking...";
    case "docstrange_complete": return "All done reading!";
    case "initializing": return "Getting ready...";
    case "queued": return "Queued for processing...";
    case "running": return "Processing in the background...";
    case "retry_scheduled": return "Queued for retry...";
    case "dead_lettered": return "Needs operator review...";
    case "user_setup": return "Setting up your profile...";
    case "creating_artifact": return "Saving your report...";
    case "extracting_text": return "Reading your file...";
    case "parsing_tradelines": return "Finding your accounts...";
    case "persisting_tradelines": return "Saving your information...";
    case "storing_comprehensive_data": return "Saving details...";
    case "validation": return "Checking for problems...";
    case "compliance_scanning": return "Looking for rule violations...";
    case "finalizing": return "Almost done...";
    case "complete": return "Done! ✓";
    default: return stage.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }
};

const getEstimatedProgressCap = (_stage: string, actualPercent: number) => {
  if (actualPercent >= 100) return 100;
  return 99;
};

const getProgressIncrement = (currentPercent: number) => {
  if (currentPercent < 35) return 1.2;
  if (currentPercent < 70) return 0.8;
  if (currentPercent < 90) return 0.45;
  return 0.2;
};

export default function UploadPage() {
  
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Dialog state
  const [mismatchDialogOpen, setMismatchDialogOpen] = useState(false);
  const [pendingUploadResult, setPendingUploadResult] = useState<UploadReportOutput | null>(null);
  const [consumerComparison, setConsumerComparison] = useState<ConsumerInfoComparison | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [uploadedArtifactId, setUploadedArtifactId] = useState<string | null>(null);
  
  // Progress state
  const [uploadProgress, setUploadProgress] = useState<{ stage: string; percent: number; message?: string } | null>(null);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const slowProgressTickRef = useRef<number | null>(null);

  const navigate = useNavigate();
  const { authState } = useAuth();
  const { mutate: uploadReport, isPending, error } = useUploadReport((stage, percent, message) => {
    setUploadProgress({ stage, percent, message });
  });

  useEffect(() => {
    if (!isPending || !uploadProgress) {
      setDisplayedProgress(uploadProgress?.percent ?? 0);
      slowProgressTickRef.current = null;
      return;
    }

    setDisplayedProgress((current) => Math.max(current, uploadProgress.percent));

    const intervalId = window.setInterval(() => {
      setDisplayedProgress((current) => {
        if (uploadProgress.percent >= 100) return 100;

        const cap = getEstimatedProgressCap(uploadProgress.stage, uploadProgress.percent);
        const floor = Math.max(current, uploadProgress.percent);

        if (floor >= cap) {
          return floor;
        }

        if (floor < 90) {
          slowProgressTickRef.current = null;
          return Math.min(90, floor + getProgressIncrement(floor));
        }

        const now = Date.now();
        if (slowProgressTickRef.current === null) {
          slowProgressTickRef.current = now;
          return floor;
        }

        if (now - slowProgressTickRef.current >= 10_000) {
          slowProgressTickRef.current = now;
          return Math.min(cap, floor + 1);
        }

        return floor;
      });
    }, 700);

    return () => window.clearInterval(intervalId);
  }, [isPending, uploadProgress]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (e.g. 15MB)
      if (selectedFile.size > 15 * 1024 * 1024) {
        toast.error("File is too large. Maximum size is 15MB.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      
      // Validate file type
      const allowedExtensions = ['.pdf'];
      const fileExtension = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(fileExtension)) {
         toast.error("Unsupported file format. Please upload a PDF credit report.");
         if (fileInputRef.current) fileInputRef.current.value = "";
         return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (authState.type !== "authenticated") {
      toast.error("You must be logged in to upload reports.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(",")[1];
      const mimeType = file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : file.type || "application/pdf";

      setUploadProgress({ stage: "initializing", percent: 0, message: "Preparing upload..." });
      setDisplayedProgress(0);
      slowProgressTickRef.current = null;

      uploadReport(
        {
          bytesBase64: base64Content,
          fileName: file.name,
          mimeType,
          region: "CA",
        },
        {
          onSuccess: (data) => {
            if (isQueuedProcessingOutput(data)) {
              setUploadedArtifactId(String(data.artifactId));
              if (data.queueStatus === "succeeded") {
                setUploadProgress({ stage: "complete", percent: 100, message: data.message });
                toast.success("Your report processing is complete.", {
                  description: "Taking you to the results...",
                });
                navigate(`/upload-results/${data.artifactId}`);
                return;
              }
              setUploadProgress({
                stage: data.queueStatus === "running" ? "running" : data.queueStatus,
                percent: data.queueStatus === "running" ? 35 : 12,
                message: data.message,
              });
              toast.success("Your report is queued", {
                description: "Processing will continue in the background. Results will be available after the ingest worker finishes.",
              });
              return;
            }

            setUploadProgress({ stage: "complete", percent: 100, message: "Upload complete!" });
            // Store the artifact ID for navigation
            setUploadedArtifactId(data.storageUrl);
            
            // Check for consumer info mismatch
            if (data.consumerInfoComparison && !data.consumerInfoComparison.isMatch) {
              setPendingUploadResult(data);

              const cic = data.consumerInfoComparison;
              const extractedDob = cic.extractedInfo.dateOfBirth ? new Date(cic.extractedInfo.dateOfBirth) : null;
              const profileDob = cic.profileInfo.dateOfBirth ? new Date(cic.profileInfo.dateOfBirth) : null;

              // Compute per-field match flags to populate the details and mismatch flags
              const cityMatch = cic.extractedInfo.city === cic.profileInfo.city || !cic.extractedInfo.city || !cic.profileInfo.city;
              const provinceMatch = cic.extractedInfo.province === cic.profileInfo.province || !cic.extractedInfo.province || !cic.profileInfo.province;
              const postalCodeMatch = cic.extractedInfo.postalCode === cic.profileInfo.postalCode || !cic.extractedInfo.postalCode || !cic.profileInfo.postalCode;

              let dobMatch = true;
              if (extractedDob && profileDob) {
                dobMatch = extractedDob.toISOString().split("T")[0] === profileDob.toISOString().split("T")[0];
              }

              const normalizePhone = (p: string) => p.replace(/\D/g, "");
              const phoneMatch =
                !cic.extractedInfo.phone ||
                !cic.profileInfo.phone ||
                normalizePhone(cic.extractedInfo.phone) === normalizePhone(cic.profileInfo.phone);

              const comparisonData: ConsumerInfoComparison = {
                isMatch: cic.isMatch,
                nameMismatch: cic.nameMismatch,
                addressMismatch: cic.addressMismatch,
                cityMismatch: !cityMatch,
                provinceMismatch: !provinceMatch,
                postalCodeMismatch: !postalCodeMatch,
                dobMismatch: !dobMatch,
                phoneMismatch: !phoneMatch,
                extractedInfo: {
                  fullName: cic.extractedInfo.fullName,
                  addressLine1: cic.extractedInfo.addressLine1,
                  addressLine2: null,
                  city: cic.extractedInfo.city,
                  province: cic.extractedInfo.province,
                  postalCode: cic.extractedInfo.postalCode,
                  dateOfBirth: extractedDob,
                  dateOfBirthRaw: extractedDob ? extractedDob.toISOString().split("T")[0] : null,
                  phone: cic.extractedInfo.phone ?? null,
                  previousAddresses: [],
                  confidence: 0,
                },
                profileInfo: {
                  fullName: cic.profileInfo.fullName,
                  addressLine1: cic.profileInfo.addressLine1,
                  city: cic.profileInfo.city,
                  province: cic.profileInfo.province,
                  postalCode: cic.profileInfo.postalCode,
                  dateOfBirth: profileDob,
                  phone: cic.profileInfo.phone ?? null,
                },
                details: {
                  nameComparison: {
                    extracted: cic.extractedInfo.fullName,
                    profile: cic.profileInfo.fullName,
                    similarity: 0, // Not available from backend response
                  },
                  addressComparison: {
                    extracted: cic.extractedInfo.addressLine1,
                    profile: cic.profileInfo.addressLine1,
                    similarity: 0, // Not available from backend response
                  },
                  cityComparison: {
                    extracted: cic.extractedInfo.city,
                    profile: cic.profileInfo.city,
                    match: cityMatch,
                  },
                  provinceComparison: {
                    extracted: cic.extractedInfo.province,
                    profile: cic.profileInfo.province,
                    match: provinceMatch,
                  },
                  postalCodeComparison: {
                    extracted: cic.extractedInfo.postalCode,
                    profile: cic.profileInfo.postalCode,
                    match: postalCodeMatch,
                  },
                  dobComparison: {
                    extracted: extractedDob,
                    profile: profileDob,
                    match: dobMatch,
                  },
                  phoneComparison: {
                    extracted: cic.extractedInfo.phone ?? null,
                    profile: cic.profileInfo.phone ?? null,
                    match: phoneMatch,
                  },
                },
              };

              setConsumerComparison(comparisonData);
              setMismatchDialogOpen(true);
              return;
            }

            toast.success("Your report has been uploaded!", {
              description: `We found ${data.tradelinesCount} accounts. Taking you to the results...`,
            });

            // Navigate to the upload results page to see scan summary
            navigate(`/upload-results/${data.storageUrl}`);
          },
          onError: (_err) => {
            setUploadProgress(null);
            // Error toast handled by useUploadReport hook
          },
        }
      );
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
    };

    reader.readAsDataURL(file);
  };

  const handleUpdateProfile = async () => {
    if (!consumerComparison) return;

    // Validate we have all required fields from extracted info
    const { fullName, addressLine1, city, province, postalCode, dateOfBirth, phone } = consumerComparison.extractedInfo;

    const missingFields: string[] = [];
    if (!fullName) missingFields.push("full name");
    if (!addressLine1) missingFields.push("address");
    if (!city) missingFields.push("city");
    if (!province) missingFields.push("province");
    if (!postalCode) missingFields.push("postal code");

    if (missingFields.length > 0) {
      toast.error(
        `Cannot update profile: missing ${missingFields.join(", ")} from the report. Please update your profile manually in Profile Settings.`
      );
      setMismatchDialogOpen(false);
      navigate("/my-accounts");
      return;
    }

    setIsUpdatingProfile(true);
    try {
      // Call profile update endpoint with extracted info
      await postUserProfile({
        fullName: fullName!,
        addressLine1: addressLine1!,
        addressLine2: null, // Extracted info doesn't usually have line 2 separate
        city: city!,
        province: province!,
        postalCode: postalCode!,
        dateOfBirth,
        phone,
      });
      toast.success("Profile updated with information from report");
      setMismatchDialogOpen(false);
      if (uploadedArtifactId) {
        navigate(`/upload-results/${uploadedArtifactId}`);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update profile");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleKeepCurrent = () => {
    setMismatchDialogOpen(false);
    toast.info("Proceeding with current profile information");
    if (uploadedArtifactId) {
      navigate(`/upload-results/${uploadedArtifactId}`);
    }
  };

  const handleCancelUpload = () => {
    setMismatchDialogOpen(false);
    setPendingUploadResult(null);
    setConsumerComparison(null);
    setUploadedArtifactId(null);
    setUploadProgress(null);
    toast.info("Upload cancelled. You can try again.");
    // Note: The report is technically already uploaded at this point.
    // In a real app we might want to delete it, but for now we just don't navigate.
  };

  return (
        <div className={styles.container}>
      <Helmet>
        <title>Upload Your Report</title>
      </Helmet>

      {consumerComparison && (
        <ConsumerInfoMismatchDialog
          open={mismatchDialogOpen}
          onOpenChange={setMismatchDialogOpen}
          comparison={consumerComparison}
          onUpdateProfile={handleUpdateProfile}
          onKeepCurrent={handleKeepCurrent}
          onCancel={handleCancelUpload}
          isUpdating={isUpdatingProfile}
        />
      )}

      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <UploadCloud size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={styles.title}>Upload Your Credit Report</h1>
              <HelpTooltip 
                title="What Happens Next"
                content="We will read your report and find any problems right away."
              />
            </div>
            <p className={styles.subtitle}>
              Upload the original Equifax or TransUnion PDF and we'll check it for you
            </p>
          </div>
        </div>

        <div className={styles.regionBanner}>
          <Badge variant="default" className={styles.regionBadge}>
            🇨🇦 Canada Only
          </Badge>
          <span className={styles.regionInfo}>
            Your information is kept safe in Canada for 1 year.
          </span>
        </div>

        <div className={styles.helpCard}>
          <Collapsible>
            <CollapsibleTrigger className={styles.helpTrigger}>
              <div className={styles.helpHeader}>
                <Info className={styles.helpIcon} size={20} />
                <span className={styles.helpTitle}>Don't have your credit report yet?</span>
              </div>
              <ChevronDown className={styles.helpTriggerChevron} size={20} />
            </CollapsibleTrigger>
            <CollapsibleContent className={styles.helpContent}>
              <p className={styles.helpText}>You can get your free credit report online in about 5 minutes. Download the original PDF from the bureau, not a photo or scan.</p>
              
              <div className={styles.helpBureausGrid}>
                <div className={styles.helpBureauCard}>
                  <div className={styles.helpBureauHeader}>
                    <ShieldCheck size={20} color="var(--primary)" />
                    <h4>Equifax</h4>
                  </div>
                  <ol className={styles.helpSteps}>
                    <li>Create a free myEquifax account.</li>
                    <li>Log in and find your credit report.</li>
                    <li>Look for "Download" or "Save as PDF".</li>
                  </ol>
                  <Button asChild size="sm" variant="outline" className={styles.helpButton}>
                    <a href="https://my.equifax.ca/" target="_blank" rel="noopener noreferrer">
                      Get Equifax Report
                    </a>
                  </Button>
                  <div className={styles.helpPhone}>
                    <Phone size={14} /> 1-800-465-7166
                  </div>
                </div>

                <div className={styles.helpBureauCard}>
                  <div className={styles.helpBureauHeader}>
                    <ShieldCheck size={20} color="var(--secondary)" />
                    <h4>TransUnion</h4>
                  </div>
                  <ol className={styles.helpSteps}>
                    <li>Go to the TransUnion secure portal.</li>
                    <li>Answer questions to prove who you are.</li>
                    <li>Click the "Download PDF" button.</li>
                  </ol>
                  <Button asChild size="sm" variant="outline" className={styles.helpButton}>
                    <a href="https://ocs.transunion.ca/" target="_blank" rel="noopener noreferrer">
                      Get TransUnion Report
                    </a>
                  </Button>
                  <div className={styles.helpPhone}>
                    <Phone size={14} /> 1-800-663-9980
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className={styles.uploadArea}>
          <div className="flex items-center gap-2">
            <label className={styles.fileLabel}>
              Choose Your File
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className={styles.fileInput}
                accept=".pdf,application/pdf"
              />
            </label>
            <HelpTooltip 
              title="What You Can Upload"
              content="Upload the original downloaded PDF with selectable text. Scanned or photo PDFs are not supported yet. Maximum size: 15MB."
            />
          </div>
          
          {file && (
            <div className={styles.fileInfo}>
              <FileUp size={20} className={styles.fileIcon} />
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>
                {(file.size / 1024).toFixed(2)} KB
              </span>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              onClick={handleUpload}
              disabled={!file || isPending}
              className={styles.uploadButton}
              size="lg"
            >
              {isPending ? "Reading your report..." : "Upload My Report"}
            </Button>
          </div>

          {isPending && uploadProgress && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressStage}>
                  {getFriendlyStageName(uploadProgress.stage)}
                </span>
                <span>{Math.round(displayedProgress)}%</span>
              </div>
              <Progress value={displayedProgress} />
              {uploadProgress.message && (
                <div className={styles.progressMessage}>{uploadProgress.message}</div>
              )}
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <AlertCircle size={16} />
              <span>{error.message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
