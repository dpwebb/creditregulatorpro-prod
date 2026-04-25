import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Upload, 
  Search, 
  ScrollText, 
  Mail, 
  Truck, 
  Printer, 
  MessageSquare, 
  RefreshCw, 
  Check, 
  Lock 
} from "lucide-react";

import { OutputType as DashboardStats } from "../endpoints/dashboard/stats_GET.schema";
import { usePacketList } from "../helpers/packetQueries";
import { useReportArtifactList } from "../helpers/reportArtifactQueries";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { DeliveryWizard } from "./DeliveryWizard";

import styles from "./DisputeJourneyTracker.module.css";

interface DisputeJourneyTrackerProps {
  stats?: DashboardStats;
  isLoading?: boolean;
}

export const DisputeJourneyTracker: React.FC<DisputeJourneyTrackerProps> = ({
  stats,
  isLoading = false,
}) => {
    const navigate = useNavigate();
  const [deliveryPacketId, setDeliveryPacketId] = useState<number | null>(null);

  const { data: packetsData, isPending: packetsPending } = usePacketList();
  const { data: artifactsData, isPending: artifactsPending } = useReportArtifactList();

  const isDataLoading = isLoading || packetsPending || artifactsPending;

  // Determine latest artifact
  const latestArtifactId = artifactsData?.artifacts && artifactsData.artifacts.length > 0
    ? artifactsData.artifacts.sort(
        (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
      )[0].id
    : null;

  // Determine packet states
  const packets = packetsData?.packets || [];
  const hasSentPacket = packets.some(
    (p) => p.status?.toLowerCase() === "sent" || p.status?.toLowerCase() === "completed"
  );
  const readyToMailPacket = packets.find(
    (p) => p.status?.toLowerCase() === "ready to mail"
  );
  const hasDraftPackets = packets.some(
    (p) => p.status?.toLowerCase() === "draft"
  );

  // Step Completion Logic
  const isStep1Done = (stats?.totalReportArtifacts || 0) > 0;
  const isStep2Done = (stats?.totalTradelines || 0) > 0;
  const isStep3Done = (stats?.totalPackets || 0) > 0;
  const isStep4Done = hasSentPacket;
  const isStep5Done = (stats?.progress?.responseRate || 0) > 0;
  const isStep6Done = (stats?.totalReportArtifacts || 0) > 1;

  // Current Step Logic (First step that is NOT done)
  let currentStep = 1;
  if (!isStep1Done) currentStep = 1;
  else if (!isStep2Done) currentStep = 2;
  else if (!isStep3Done) currentStep = 3;
  else if (!isStep4Done) currentStep = 4;
  else if (!isStep5Done) currentStep = 5;
  else currentStep = 6;

  if (isDataLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.timeline}>
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className={styles.stepItem}>
              <div className={styles.stepIndicator}>
                <Skeleton className={styles.skeletonCircle} />
              </div>
              <div className={styles.stepContent}>
                <Skeleton style={{ width: "60%", height: "1.5rem", marginBottom: "0.5rem" }} />
                <Skeleton style={{ width: "80%", height: "1rem" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Helper for rendering step UI
  const renderStep = (
    stepNum: number,
    isDone: boolean,
    title: string,
    description: string,
    Icon: React.ElementType,
    actions: React.ReactNode,
    linkTo: string,
    isLast: boolean = false
  ) => {
    const isCurrent = currentStep === stepNum;
    const isLocked = stepNum > currentStep && !(isStep2Done && stepNum >= 3 && stepNum <= 5);
    const showExpanded = isCurrent || 
      (stepNum === 6 && isDone) || 
      (isStep2Done && stepNum >= 3 && stepNum <= 5 && currentStep < 6);
    
    // Step classes
    const stepClass = isDone 
      ? styles.done 
      : (!isLocked && !isDone) 
        ? styles.current 
        : styles.locked;

    return (
      <div className={`${styles.stepItem} ${stepClass}`}>
        {!isLast && <div className={styles.stepConnector} />}
        
        <div className={styles.stepIndicator}>
          {isDone ? (
            <Check size={16} strokeWidth={3} />
          ) : isLocked ? (
            <Lock size={14} />
          ) : (
            <span>{stepNum}</span>
          )}
        </div>

        <div className={styles.stepContent}>
          <div className={styles.stepHeader}>
            {!isLocked ? (
              <Link to={linkTo} className={styles.stepTitleRowLink}>
                <Icon size={20} className={styles.stepIcon} />
                <h3 className={styles.stepTitle}>{title}</h3>
              </Link>
            ) : (
              <div className={styles.stepTitleRow}>
                <Icon size={20} className={styles.stepIcon} />
                <h3 className={styles.stepTitle}>{title}</h3>
              </div>
            )}
          </div>
          
          {showExpanded && (
            <div className={styles.stepExpanded}>
              <p className={styles.stepDesc}>{description}</p>
              <div className={styles.stepActions}>{actions}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.timeline}>
        {renderStep(
          1,
          isStep1Done,
          "Upload Your Report",
          "Send us your credit report so we can check it.",
          Upload,
          <div className={styles.stepOneActions}>
            <Button asChild size="lg">
              <Link to="/upload">Upload Report</Link>
            </Button>
            <Link to="/try-upload?guide=true" className={styles.guideLink}>
              Don't have your report yet? Here's how to get it free →
            </Link>
          </div>,
          "/upload"
        )}

        {renderStep(
          2,
          isStep2Done,
          "See What We Found",
          "We checked your report — tap here to see what we found.",
          Search,
          <Button asChild size="lg">
                        <Link to="/my-accounts?tab=problems">
              View Problems
            </Link>
          </Button>,
          "/my-accounts?tab=problems"
        )}

        {renderStep(
          3,
          isStep3Done,
          "Write Your Dispute Letters",
          isStep3Done 
            ? "You've written letters — you can always write more."
            : "We'll help you write letters to fix the problems.",
          ScrollText,
          <Button asChild size="lg">
            <Link to="/packets?create=true">
              {isStep3Done ? "Write Another Letter" : "Write a Letter"}
            </Link>
          </Button>,
          "/packets"
        )}

        {renderStep(
          4,
          isStep4Done,
          "Mail Your Letters",
          isStep4Done
            ? "You've mailed letters — send more anytime."
            : "Send your letters to the credit companies.",
          Mail,
          isStep4Done ? (
            <Button asChild size="lg">
              <Link to="/packets">Go to Letters</Link>
            </Button>
          ) : (
            <div className={styles.splitActions}>
              <div className={styles.actionCard}>
                <Printer className={styles.actionIcon} />
                <h4>Mail It Yourself</h4>
                <p>Print and take it to the post office.</p>
                <Button asChild variant="outline" className={styles.actionBtn}>
                  <Link to="/packets">Go to Letters</Link>
                </Button>
              </div>
                                                  <div
                className={styles.actionCard}
              >
                <Truck className={styles.actionIconPrimary} />
                <h4>Have Us Send It</h4>
                <p>We print and mail it for you.</p>
                {readyToMailPacket ? (
                  <Button 
                    variant="primary" 
                    className={styles.actionBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeliveryPacketId(readyToMailPacket.id);
                    }}
                  >
                    Send Now
                  </Button>
                ) : (
                  <div className={styles.noLettersNote}>
                    <span>Finish writing a letter first, then come back here to mail it.</span>
                    {hasDraftPackets && (
                      <span className={styles.draftNote}>
                        You have letters in draft — open them from My Letters and mark them ready.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
          "/packets"
        )}

        {renderStep(
          5,
          isStep5Done,
          "Record Their Response",
          isStep5Done
            ? "Great work recording responses — keep updating as you hear back."
            : "When you hear back, tell us what they said.",
          MessageSquare,
          <Button asChild size="lg">
            <Link to="/evidence">Record a Response</Link>
          </Button>,
          "/evidence"
        )}

        {renderStep(
          6,
          isStep6Done,
          "Upload New Report & Compare",
          isStep6Done 
            ? "Keep going! Upload after each response." 
            : "Upload a new report to see what changed.",
          RefreshCw,
          <Button asChild size="lg" variant={isStep6Done ? "secondary" : "primary"}>
            <Link to="/upload">Upload New Report</Link>
          </Button>,
          "/upload",
          true // isLast
        )}
      </div>

      <div className={styles.summarySection}>
        <h3 className={styles.summaryTitle}>Your Numbers</h3>
        <div className={styles.statsGrid}>
                    <Link to="/my-accounts" className={styles.statCard}>
            <span className={styles.statValue}>{stats?.totalTradelines || 0}</span>
            <span className={styles.statLabel}>Accounts</span>
          </Link>
                    <Link to="/packets" className={styles.statCard}>
            <span className={styles.statValue}>{stats?.packetsSentCount || 0}</span>
            <span className={styles.statLabel}>Letters Sent</span>
          </Link>
          <Link to="/my-accounts?tab=problems" className={styles.statCard}>
            <span className={styles.statValue}>{stats?.violationsFoundCount || 0}</span>
            <span className={styles.statLabel}>Problems Found</span>
          </Link>
        </div>
      </div>

      {deliveryPacketId !== null && (
        <DeliveryWizard
          packetId={deliveryPacketId}
          bureauName={readyToMailPacket?.bureauName || "the credit bureau"}
          open={deliveryPacketId !== null}
          onOpenChange={(open) => !open && setDeliveryPacketId(null)}
          initialStep="crp"
        />
      )}
    </div>
  );
};