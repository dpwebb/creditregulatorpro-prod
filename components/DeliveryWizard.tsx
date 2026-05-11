import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Truck,
  Printer,
  CheckCircle2,
  ChevronLeft,
  FileImage,
  PenTool,
  Mail,
  Tag,
  AlertCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./Dialog";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { Input } from "./Input";
import { Badge } from "./Badge";
import { Spinner } from "./Spinner";
import { StripePaymentDialog } from "./StripePaymentDialog";
import { getSignatureList } from "../endpoints/consumer-signature/list_GET.schema";

import { getPacketPdfUrl } from "../endpoints/packet/pdf_GET.schema";
import { usePacketDelivery } from "../helpers/usePacketDelivery";
import { useSendFirstClass } from "../helpers/useSendFirstClass";
import { usePostalPricing } from "../helpers/postalBillingQueries";
import { useUpdatePacketStatus } from "../helpers/useUpdatePacketStatus";
import { getBureauDisputeAddress } from "../helpers/bureauDisputeAddresses";
import { PDF_WORKER_URL } from "../helpers/pdfWorker";

import "@react-pdf-viewer/core/lib/styles/index.css";
import styles from "./DeliveryWizard.module.css";

export interface DeliveryWizardProps {
  packetId: number;
  bureauName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  onDownloadPdf?: () => void;
  initialStep?: "choose" | "crp" | "self";
}

type Step = "choose" | "crp-review" | "crp" | "self" | "done";

export const DeliveryWizard: React.FC<DeliveryWizardProps> = ({
  packetId,
  bureauName,
  open,
  onOpenChange,
  onComplete,
  onDownloadPdf,
  initialStep = "choose",
}) => {
  const [step, setStep] = useState<Step>(
    initialStep === "crp" ? "crp-review" : initialStep
  );
  const [flow, setFlow] = useState<"crp" | "self" | null>(
    initialStep === "crp" ? "crp" : initialStep === "self" ? "self" : null
  );

  // State for CRP mail-for-you path
  const [crpReviewed, setCrpReviewed] = useState(false);
  const [crpApproved, setCrpApproved] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [isStripeOpen, setIsStripeOpen] = useState(false);
  const [crpError, setCrpError] = useState<string | null>(null);

  // State for Self path
  const [showSelfForm, setShowSelfForm] = useState(false);
  const [mailMethod, setMailMethod] = useState<"regular" | "registered">("regular");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sentDate, setSentDate] = useState(new Date().toISOString().split("T")[0]);
  const [selfReviewed, setSelfReviewed] = useState(false);
  const [selfApproved, setSelfApproved] = useState(false);

  const sendFirstClass = useSendFirstClass();
  const packetDelivery = usePacketDelivery();
  const { firstClassCost, isLoading: isPricingLoading } = usePostalPricing();
  const updateStatus = useUpdatePacketStatus();

  const displayName = bureauName;
  const bureauAddress = getBureauDisputeAddress(bureauName);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setStep(initialStep === "crp" ? "crp-review" : initialStep);
      setFlow(initialStep === "crp" ? "crp" : initialStep === "self" ? "self" : null);
      setCrpReviewed(false);
      setCrpApproved(false);
      setZoomLevel(1.0);
      setShowSelfForm(false);
      setMailMethod("regular");
      setTrackingNumber("");
      setSentDate(new Date().toISOString().split("T")[0]);
      setSelfReviewed(false);
      setSelfApproved(false);
      setCrpError(null);
    }
  }, [open, initialStep]);

  // Query to check if signature exists
  const { data: sigData, isPending: isSigPending } = useQuery({
    queryKey: ["consumer-signatures", "document_signing"],
    queryFn: () =>
      getSignatureList({ signatureType: "document_signing", limit: 1 }),
    enabled: open && step === "crp",
  });

  const hasSignature = sigData?.signatures && sigData.signatures.length > 0;

  const handleCrpSuccess = (paymentIntentId?: string) => {
    setCrpError(null);
    sendFirstClass.mutate(
      {
        packetId,
        paymentIntentId,
        userReviewed: true,
        userApproved: true,
      },
      {
        onSuccess: () => {
          setStep("done");
          setIsStripeOpen(false);
        },
        onError: (err) => {
          setCrpError(err.message || "Failed to send packet.");
          setIsStripeOpen(false);
        }
      }
    );
  };

  const handleSelfSubmit = () => {
    packetDelivery.mutate(
      {
        packetId,
        deliveryMethod: mailMethod,
        trackingNumber: trackingNumber || undefined,
        sentDate: new Date(sentDate),
        userReviewed: true,
        userApproved: true,
        consumerCertification: true,
      },
      {
        onSuccess: () => {
          setStep("done");
        },
      }
    );
  };

  const handleDoLater = () => {
    updateStatus.mutate(
      { packetId, status: "Ready to Mail" },
      {
        onSuccess: () => {
          toast.success("No problem! Your letter is marked as ready to mail. You can record your mailing info anytime.");
          onOpenChange(false);
        }
      }
    );
  };

  // Render the progress bar based on the current flow
  const renderProgressBar = () => {
    const isCrp = (flow as string) === "crp" || step === "crp-review" || step === "crp" || (step === "done" && (flow as string) === "crp");
    const skipChoose = initialStep !== "choose";

    if (isCrp) {
      if (skipChoose) {
        const pState = step === "crp-review" ? 1 : step === "crp" ? 2 : 3;
        return (
          <div className={styles.progressContainer}>
            <div className={`${styles.progressStep} ${pState >= 1 ? styles.active : ""}`}>1. Review</div>
            <div className={styles.progressLine} />
            <div className={`${styles.progressStep} ${pState >= 2 ? styles.active : ""}`}>2. Confirm</div>
            <div className={styles.progressLine} />
            <div className={`${styles.progressStep} ${pState >= 3 ? styles.active : ""}`}>3. Done!</div>
          </div>
        );
      } else {
        const pState = step === "choose" ? 1 : step === "crp-review" ? 2 : step === "crp" ? 3 : 4;
        return (
          <div className={styles.progressContainer}>
            <div className={`${styles.progressStep} ${pState >= 1 ? styles.active : ""}`}>1. Pick</div>
            <div className={styles.progressLine} />
            <div className={`${styles.progressStep} ${pState >= 2 ? styles.active : ""}`}>2. Review</div>
            <div className={styles.progressLine} />
            <div className={`${styles.progressStep} ${pState >= 3 ? styles.active : ""}`}>3. Confirm</div>
            <div className={styles.progressLine} />
            <div className={`${styles.progressStep} ${pState >= 4 ? styles.active : ""}`}>4. Done!</div>
          </div>
        );
      }
    }

    // Default / Self flow
    const pState = step === "choose" ? 1 : step === "self" ? 2 : 3;
    return (
      <div className={styles.progressContainer}>
        <div className={`${styles.progressStep} ${pState >= 1 ? styles.active : ""}`}>
          1. Pick
        </div>
        <div className={styles.progressLine} />
        <div className={`${styles.progressStep} ${pState >= 2 ? styles.active : ""}`}>
          2. Check
        </div>
        <div className={styles.progressLine} />
        <div className={`${styles.progressStep} ${pState >= 3 ? styles.active : ""}`}>
          3. Finished!
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={styles.dialogContent}>
          <DialogHeader className={styles.header}>
            {renderProgressBar()}
            
            {step === "choose" && (
              <>
                <DialogTitle>How do you want to send this?</DialogTitle>
                <DialogDescription>
                  You stay in control. If we mail it, we act only as a mailing service.
                </DialogDescription>
              </>
            )}
            {step === "crp-review" && (
              <>
                <DialogTitle>Review Your Letter</DialogTitle>
                <DialogDescription>
                  Make sure this is the right letter and it's going to the right place.
                </DialogDescription>
              </>
            )}
            {step === "crp" && (
              <DialogTitle>Let us mail it for you</DialogTitle>
            )}
            {step === "self" && (
              <DialogTitle>Print and mail it yourself</DialogTitle>
            )}
            {step === "done" && (
              <DialogTitle>All done!</DialogTitle>
            )}
          </DialogHeader>

          <div className={styles.body}>
            {/* STEP 1: CHOOSE */}
            {step === "choose" && (
              <div className={styles.chooseOptions}>
                <button
                  type="button"
                  className={styles.optionCard}
                  onClick={() => {
                    setFlow("crp");
                    setStep("crp-review");
                  }}
                >
                  <div className={styles.optionIconWrapper}>
                    <Truck className={styles.optionIcon} />
                  </div>
                  <div className={styles.optionContent}>
                    <h3 className={styles.optionTitle}>Let us mail it for you</h3>
                    <p className={styles.optionDesc}>
                      We print your approved letter, add your approved signature and saved ID image, and mail it as a service.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  className={styles.optionCard}
                  onClick={() => {
                    setFlow("self");
                    setStep("self");
                  }}
                >
                  <div className={styles.optionIconWrapper}>
                    <Printer className={styles.optionIcon} />
                  </div>
                  <div className={styles.optionContent}>
                    <h3 className={styles.optionTitle}>
                      I'll print and mail it myself
                    </h3>
                    <p className={styles.optionDesc}>
                      Download your letter, print it, and take it to the post office.
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* STEP 2A: CRP SEND - REVIEW */}
            {step === "crp-review" && (
              <div className={styles.stepContent}>
                <div className={styles.destinationBox}>
                  <p className={styles.destinationHeading}>This letter will be sent to:</p>
                  {bureauAddress ? (
                    <div className={styles.destinationAddress}>
                      <p className={styles.destinationName}>{bureauAddress.bureauName}</p>
                      <p>{bureauAddress.department}</p>
                      <p>{bureauAddress.addressLine1}</p>
                      <p>{bureauAddress.city}, {bureauAddress.province} {bureauAddress.postalCode}</p>
                    </div>
                  ) : (
                    <>
                      <p className={styles.destinationName}>{bureauName}</p>
                      <p className={styles.destinationNote}>The full address is on your letter.</p>
                    </>
                  )}
                  <div className={styles.destinationWrong}>
                    <p>Wrong address? You'll need to create a new letter.</p>
                    <Button variant="link" onClick={() => onOpenChange(false)}>Close to start over</Button>
                  </div>
                </div>

                <div className={styles.pdfViewerWrapper}>
                  <div className={styles.zoomToolbar}>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}
                      disabled={zoomLevel <= 0.5}
                      aria-label="Zoom out"
                    >
                      <ZoomOut size={16} />
                    </Button>
                    <span className={styles.zoomText}>{Math.round(zoomLevel * 100)}%</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setZoomLevel(z => Math.min(3.0, z + 0.25))}
                      disabled={zoomLevel >= 3.0}
                      aria-label="Zoom in"
                    >
                      <ZoomIn size={16} />
                    </Button>
                  </div>
                  <div className={styles.pdfContainer}>
                    <Worker workerUrl={PDF_WORKER_URL}>
                      <Viewer 
                        key={`pdf-zoom-${zoomLevel}`}
                        fileUrl={getPacketPdfUrl({ packetId })} 
                        defaultScale={zoomLevel}
                      />
                    </Worker>
                  </div>
                </div>

                <Button
                  size="lg"
                  className={styles.primaryAction}
                  onClick={() => setStep("crp")}
                >
                  This looks right — continue
                </Button>

                {initialStep === "choose" && (
                  <Button
                    variant="ghost"
                    className={styles.backButton}
                    onClick={() => {
                      setStep("choose");
                      setFlow(null);
                    }}
                  >
                    <ChevronLeft size={16} /> Back
                  </Button>
                )}
              </div>
            )}

            {/* STEP 2B: CRP SEND - CONFIRM */}
            {step === "crp" && (
              <div className={styles.stepContent}>
                <div className={styles.summaryBox}>
                    <p className={styles.summaryText}>
                    We will print and mail your approved letter with your saved ID image to <strong>{displayName}</strong> as a mailing service.
                  </p>
                  <div className={styles.costBox}>
                    {isPricingLoading ? (
                      <Spinner size="sm" />
                    ) : (
                      <>
                        <span className={styles.costAmount}>
                          ${(firstClassCost ?? 0).toFixed(2)} CAD
                        </span>
                        <span className={styles.costLabel}>This is what it costs.</span>
                      </>
                    )}
                  </div>
                </div>

                {isSigPending ? (
                  <div className={styles.loadingBox}>
                    <Spinner size="md" />
                    <p>Checking signature...</p>
                  </div>
                ) : !hasSignature ? (
                  <div className={styles.alertBox}>
                    <AlertCircle className={styles.alertIcon} />
                    <div className={styles.alertContent}>
                      <p className={styles.alertTitle}>We need your signature first</p>
                      <p className={styles.alertDesc}>
                        We cannot mail the letter without your signature.
                      </p>
                      <Button asChild variant="outline" className={styles.alertAction}>
                        <Link to="/my-info?tab=profile">Go to Profile</Link>
                      </Button>
                    </div>
                  </div>
                ) : crpError ? (
                  <div className={styles.errorBox}>
                    <AlertCircle className={styles.errorIcon} />
                    <div className={styles.errorContent}>
                      <p className={styles.errorTitle}>We hit a snag</p>
                      <p className={styles.errorDesc}>{crpError}</p>
                      
                      <div className={styles.errorGuidance}>
                        <p className={styles.errorGuidanceTitle}>What should I do?</p>
                        {crpError.toLowerCase().includes("profile settings") ? (
                          <p>Please update your mailing address so we can verify it. <Link to="/my-info?tab=profile" className={styles.errorLink}>Go to Profile Settings</Link></p>
                        ) : crpError.toLowerCase().includes("recipient address") ? (
                           <p>The address we are sending this to could not be verified. You need to close this window and create a new letter with the correct address.</p>
                        ) : (
                           <p>Your payment (if any) was refunded. Please try again later or contact support.</p>
                        )}
                      </div>

                      <Button variant="outline" size="sm" onClick={() => setCrpError(null)} className={styles.errorRetryAction}>
                        Clear and Try Again
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.confirmBox}>
                    <div className={styles.checkboxGroup}>
                      <div className={styles.checkboxRow}>
                        <Checkbox
                          id="crp-reviewed"
                          checked={crpReviewed}
                          onChange={(e) => setCrpReviewed(e.target.checked)}
                        />
                        <label htmlFor="crp-reviewed">
                          I checked this letter and it looks right.
                        </label>
                      </div>
                      <div className={styles.checkboxRow}>
                        <Checkbox
                          id="crp-approved"
                          checked={crpApproved}
                          onChange={(e) => setCrpApproved(e.target.checked)}
                        />
                        <label htmlFor="crp-approved">
                          Everything in this letter is true, and I understand Credit Regulator Pro does not represent me.
                        </label>
                      </div>
                    </div>

                    <Button
                      size="lg"
                      className={styles.primaryAction}
                      disabled={!crpReviewed || !crpApproved || sendFirstClass.isPending}
                      onClick={() => setIsStripeOpen(true)}
                    >
                      {sendFirstClass.isPending ? <Spinner size="sm" /> : "Pay & Send"}
                    </Button>
                  </div>
                )}

                <Button
                  variant="ghost"
                  className={styles.backButton}
                  onClick={() => setStep("crp-review")}
                >
                  <ChevronLeft size={16} /> Back
                </Button>
              </div>
            )}

            {/* STEP 2C: SELF MAIL */}
            {step === "self" && (
              <div className={styles.stepContent}>
                {!showSelfForm ? (
                  <>
                    <Button
                      size="lg"
                      className={styles.downloadAction}
                      onClick={onDownloadPdf}
                    >
                      <Printer size={18} />
                      Download Your Letter
                    </Button>

                    <div className={styles.checklist}>
                      <div className={styles.checklistItem}>
                        <Printer size={20} className={styles.checklistIcon} />
                        <span>Print the letter</span>
                      </div>
                      <div className={styles.checklistItem}>
                        <PenTool size={20} className={styles.checklistIcon} />
                        <span>Sign it</span>
                      </div>
                      <div className={styles.checklistItem}>
                        <FileImage size={20} className={styles.checklistIcon} />
                        <span>Include the ID image page</span>
                      </div>
                      <div className={styles.checklistItem}>
                        <Mail size={20} className={styles.checklistIcon} />
                        <span>Mail it at the post office</span>
                      </div>
                      <div className={styles.checklistItem}>
                        <Tag size={20} className={styles.checklistIcon} />
                        <span>Save your tracking number</span>
                      </div>
                    </div>

                    <div className={styles.actionRow}>
                      <Button
                        size="lg"
                        className={styles.primaryAction}
                        onClick={() => setShowSelfForm(true)}
                      >
                        I Already Mailed It
                      </Button>
                      <Button
                        size="lg"
                        variant="secondary"
                        onClick={handleDoLater}
                      >
                        I'll Do This Later
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className={styles.selfForm}>
                    <div className={styles.radioGroup}>
                      <button
                        type="button"
                        className={`${styles.radioOption} ${
                          mailMethod === "regular" ? styles.radioSelected : ""
                        }`}
                        onClick={() => setMailMethod("regular")}
                      >
                        Regular Mail
                      </button>
                      <button
                        type="button"
                        className={`${styles.radioOption} ${
                          mailMethod === "registered" ? styles.radioSelected : ""
                        }`}
                        onClick={() => setMailMethod("registered")}
                      >
                        Registered Mail
                        <Badge variant="primary" className={styles.radioBadge}>
                          Recommended
                        </Badge>
                      </button>
                    </div>

                    {mailMethod === "registered" && (
                      <div className={styles.formField}>
                        <label>Tracking Number</label>
                        <Input
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          placeholder="e.g. RW123456789CA"
                        />
                      </div>
                    )}

                    <div className={styles.formField}>
                      <label>Date Sent</label>
                      <Input
                        type="date"
                        value={sentDate}
                        onChange={(e) => setSentDate(e.target.value)}
                      />
                    </div>

                    <div className={styles.checkboxGroup}>
                      <div className={styles.checkboxRow}>
                        <Checkbox
                          id="self-reviewed"
                          checked={selfReviewed}
                          onChange={(e) => setSelfReviewed(e.target.checked)}
                        />
                        <label htmlFor="self-reviewed">
                          I checked this letter and it looks right.
                        </label>
                      </div>
                      <div className={styles.checkboxRow}>
                        <Checkbox
                          id="self-approved"
                          checked={selfApproved}
                          onChange={(e) => setSelfApproved(e.target.checked)}
                        />
                        <label htmlFor="self-approved">
                          Everything in this letter is true.
                        </label>
                      </div>
                    </div>

                    <Button
                      size="lg"
                      className={styles.primaryAction}
                      disabled={
                        !selfReviewed ||
                        !selfApproved ||
                        packetDelivery.isPending ||
                        (mailMethod === "registered" && !trackingNumber.trim())
                      }
                      onClick={handleSelfSubmit}
                    >
                      {packetDelivery.isPending ? <Spinner size="sm" /> : "Save"}
                    </Button>

                    <Button
                      variant="ghost"
                      className={styles.backButton}
                      onClick={() => setShowSelfForm(false)}
                    >
                      <ChevronLeft size={16} /> Back
                    </Button>
                  </div>
                )}

                {!showSelfForm && initialStep === "choose" && (
                  <Button
                    variant="ghost"
                    className={styles.backButton}
                    onClick={() => {
                      setStep("choose");
                      setFlow(null);
                    }}
                  >
                    <ChevronLeft size={16} /> Back
                  </Button>
                )}
              </div>
            )}

            {/* STEP 3: DONE */}
            {step === "done" && (
              <div className={styles.doneContent}>
                <CheckCircle2 className={styles.doneIcon} />
                <h2 className={styles.doneTitle}>Great job!</h2>
                <p className={styles.doneDesc}>
                  Your letter is on its way. You can always check its status in your Packets list.
                </p>
                <div className={styles.doneActions}>
                  <Button
                    size="lg"
                    className={styles.primaryAction}
                    onClick={() => {
                      if (onComplete) onComplete();
                      onOpenChange(false);
                    }}
                  >
                    Close
                  </Button>
                  <Button variant="outline" size="lg" asChild>
                    <Link
                      to="/packets"
                      onClick={() => {
                        if (onComplete) onComplete();
                        onOpenChange(false);
                      }}
                    >
                      View My Packets
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {isStripeOpen && (
        <StripePaymentDialog
          packetId={packetId}
          open={isStripeOpen}
          onOpenChange={setIsStripeOpen}
          mailType="first_class"
          baseCost={firstClassCost}
          surchargeRate={0}
          totalCost={firstClassCost}
          onPaymentSuccess={handleCrpSuccess}
        />
      )}
    </>
  );
};
