import React, { useMemo, useState, Suspense } from "react";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Send, 
  ShieldAlert,
  Scale,
  Clock,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./Collapsible";

import { Skeleton } from "./Skeleton";
import { Progress } from "./Progress";
import { Button } from "./Button";
import { ComplianceViolationCard } from "./ComplianceViolationCard";
import { ComplianceRescanButton } from "./ComplianceRescanButton";
import { CreatePacketDialog } from "./CreatePacketDialog";
import { ProfileCompletionDialog } from "./ProfileCompletionDialog";
import { SourceReportViewer } from "./SourceReportViewer";
import { Badge } from "./Badge";

const PacketViewer = React.lazy(() => import("./PacketViewer").then(m => ({ default: m.PacketViewer })));

import { useComplianceViolations, useDismissViolation } from "../helpers/complianceViolationQueries";
import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { usePacketReadiness } from "../helpers/usePacketReadiness";
import { useAuth } from "../helpers/useAuth";
import { useTradelineList } from "../helpers/tradelineQueries";
import { useTradelinePackets } from "../helpers/packetQueries";
import { useUserProfile } from "../helpers/useUserProfile";
import { useQueryClient } from "@tanstack/react-query";
import { USER_PROFILE_QUERY_KEY } from "../helpers/useUserProfile";
import { getViolationLabel } from "../helpers/getViolationLabel";
import { getEnrichedExplanation, getEnrichedRecommendedAction } from "../helpers/getEnrichedExplanation";

import styles from "./TradelineComplianceHub.module.css";

const getEntityBadgeLabel = (entity?: string | null) => {
  if (entity === "BUREAU") return "Credit Bureau Issue";
  if (entity === "CREDITOR") return "Creditor Issue";
  if (entity === "COLLECTOR") return "Collection Agency Issue";
  return null;
};

interface TradelineComplianceHubProps {
  tradelineId: number;
  className?: string;
  hideSummaryBar?: boolean;
}

export const TradelineComplianceHub: React.FC<TradelineComplianceHubProps> = ({
  tradelineId,
  className,
  hideSummaryBar = false,
}) => {
  const { authState, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { profile } = useUserProfile();

  // Province alert state
  const [showProvinceDialog, setShowProvinceDialog] = useState(false);
  const isProvinceUnset = !profile?.province;
  
  // Data Fetching
  const { data: violationsData, isLoading: isLoadingViolations } = useComplianceViolations(tradelineId);
  const { data: challengesData, isLoading: isLoadingChallenges } = useObligationInstanceList({ tradelineId });
  const { data: tradelinesData } = useTradelineList();
  const { data: packetsData } = useTradelinePackets(tradelineId);
  const { mutateAsync: dismissViolation } = useDismissViolation();
  
  // Packet Creation State
  const { mutateAsync: validateReadiness, isPending: isValidating } = usePacketReadiness();
  const [isPacketDialogOpen, setIsPacketDialogOpen] = useState(false);
  const [selectedViolationId, setSelectedViolationId] = useState<number | null>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [missingUserFields, setMissingUserFields] = useState<string[]>([]);
  const [viewingSourceReport, setViewingSourceReport] = useState(false);

  // Packet Viewing State
  const [isPacketViewerOpen, setIsPacketViewerOpen] = useState(false);
  const [viewingPacketId, setViewingPacketId] = useState<number | null>(null);
  const [previewPacketData, setPreviewPacketData] = useState<any | null>(null);

  // For autofill resolution
  const currentTradeline = useMemo(() => 
    tradelinesData?.tradelines.find(t => t.id === tradelineId), 
    [tradelinesData, tradelineId]
  );

  // Check if any packet exists for this tradeline
  const hasAnyPacket = useMemo(() => {
    return (packetsData?.packets?.length ?? 0) > 0;
  }, [packetsData]);

  const latestPacketId = useMemo(() => {
    if (!packetsData?.packets || packetsData.packets.length === 0) return null;
    // Sort by id descending (assuming higher ID is newer) or createdAt
    return [...packetsData.packets].sort((a, b) => b.id - a.id)[0].id;
  }, [packetsData]);

  // Violation category priority (lower number = higher priority)
  const getViolationPriority = (category: string | null | undefined): number => {
    switch (category) {
      case 'STATUTE_OF_LIMITATIONS': return 1;
      case 'TEMPORAL_MANIPULATION': return 2;
      case 'BANKRUPTCY_DISCHARGE_VIOLATION': return 3;
      case 'BALANCE_CALCULATION_VIOLATION': return 4;
      case 'ACCOUNT_STATUS_INCONSISTENCY': return 5;
      case 'PAYMENT_HISTORY_MANIPULATION': return 6;
      case 'DOCUMENTATION_CHAIN_FAILURE': return 7;
      default: return 99;
    }
  };

  // Derived Data
  const violations = useMemo(() => {
    if (!violationsData?.obligationTests) return [];
    // Sort by: 1) Severity (ERROR first), 2) Strategic priority, 3) Recency
    return [...violationsData.obligationTests].sort((a, b) => {
      // Severity: ERROR < WARNING (ascending puts ERROR first)
      const severityOrder = { 'ERROR': 1, 'WARNING': 2, 'INFO': 3 };
      const sevA = severityOrder[a.severity as keyof typeof severityOrder] ?? 99;
      const sevB = severityOrder[b.severity as keyof typeof severityOrder] ?? 99;
      if (sevA !== sevB) return sevA - sevB;
      
      // Strategic priority (lower = more important)
      const prioA = getViolationPriority(a.violationCategory);
      const prioB = getViolationPriority(b.violationCategory);
      if (prioA !== prioB) return prioA - prioB;
      
      // Recency (most recent first)
      const dateA = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
      const dateB = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [violationsData]);

  const activeViolations = useMemo(() => {
    return violations.filter(v => !v.userStatus || v.userStatus === "active");
  }, [violations]);

  const dismissedViolations = useMemo(() => {
    return violations.filter(v => v.userStatus === "dismissed" || v.userStatus === "verified");
  }, [violations]);

  const challenges = useMemo(() => {
    if (!challengesData?.instances) return [];
    return challengesData.instances;
  }, [challengesData]);

  // Stats
  const activeIssuesCount = activeViolations.length;
  const challengesSentCount = challenges.filter(c => !!c.challengeSentDate).length;
  const responsesReceivedCount = challenges.filter(c => c.state === "RESPONSE_RECORDED").length;

  const statuteOfLimitationsViolation = useMemo(() => {
    return activeViolations.find(v => v.violationCategory === 'STATUTE_OF_LIMITATIONS');
  }, [activeViolations]);

  const approachingViolation = useMemo(() => {
    return activeViolations.find(v => v.violationCategory === 'STATUTE_APPROACHING');
  }, [activeViolations]);

  const displayViolations = useMemo(() => {
    return activeViolations.filter(v => v.violationCategory !== 'STATUTE_APPROACHING');
  }, [activeViolations]);

  const solPacket = useMemo(() => {
    if (!statuteOfLimitationsViolation || !packetsData?.packets) return null;
    return packetsData.packets.find(
      p => p.creditorObligationTestId === statuteOfLimitationsViolation.id
    );
  }, [statuteOfLimitationsViolation, packetsData]);

  const isSolPacketSent = solPacket?.status?.toUpperCase() === "SENT" || !!solPacket?.sentDate;

  // Handlers
  const handleGeneratePacket = async (violationId: number) => {
    if (authState.type !== "authenticated") return;

    setSelectedViolationId(violationId);

    try {
      const readiness = await validateReadiness({ tradelineId });
      if (readiness.missingUserFields.length > 0) {
        setMissingUserFields(readiness.missingUserFields);
        setShowProfileDialog(true);
      } else {
        setIsPacketDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to validate packet readiness", error);
    }
  };

  const handleDismissViolation = async (violationId: number, status: "dismissed" | "verified", reason?: string) => {
    try {
      await dismissViolation({ violationId, status, reason });
      toast.success(status === "dismissed" ? "Issue dismissed" : "Issue marked as verified");
    } catch (error) {
      toast.error("Failed to update issue status");
    }
  };

  const handleViewPacket = (violationId: number) => {
    // Find the packet for this specific violation
    const packet = packetsData?.packets?.find(p => p.creditorObligationTestId === violationId);
    if (packet) {
      setViewingPacketId(packet.id);
      setIsPacketViewerOpen(true);
    }
  };

  const handleProfileCompleted = async () => {
    setShowProfileDialog(false);
    // If we were blocked, try to proceed
    if (authState.type === "authenticated") {
      try {
        const readiness = await validateReadiness({ tradelineId });
        if (readiness.missingUserFields.length > 0) {
          setMissingUserFields(readiness.missingUserFields);
          setShowProfileDialog(true);
        } else {
          setIsPacketDialogOpen(true);
        }
      } catch (error) {
        console.error("Failed to re-validate packet readiness", error);
      }
    }
  };

  const handleProvinceCompleted = async () => {
    setShowProvinceDialog(false);
    // Invalidate violations so they re-fetch with the correct province
    await queryClient.invalidateQueries({ queryKey: ["compliance", "violations", tradelineId] });
    await queryClient.invalidateQueries({ queryKey: USER_PROFILE_QUERY_KEY });
  };

    const nonAdminDisplayViolations = useMemo(() => {
    // Filter out MULTIPLE_COLLECTOR_VIOLATION — it's already shown by RelatedCollectionAccounts
    const filtered = displayViolations.filter(v => v.violationCategory !== "MULTIPLE_COLLECTOR_VIOLATION");
    const seen = new Set<string>();
    return filtered.filter(v => {
      if (!v.violationCategory) return true;
      if (seen.has(v.violationCategory)) return false;
      seen.add(v.violationCategory);
      return true;
    });
  }, [displayViolations]);

  const topViolation = nonAdminDisplayViolations[0];
  const otherViolations = nonAdminDisplayViolations.slice(1);
  const packetForTopViolation = topViolation ? packetsData?.packets?.find(p => p.creditorObligationTestId === topViolation.id) : null;
  const isTopViolationDisputed = !!(packetForTopViolation && (packetForTopViolation.status?.toUpperCase() === "SENT" || packetForTopViolation.sentDate));

  const topViolationTitle = topViolation ? getViolationLabel(topViolation.violationCategory) : "";
  const topViolationExplanation = topViolation ? getEnrichedExplanation(topViolation) : "";
  const topViolationLinked = topViolation?.obligationState === "ADDRESSED_VIA_LINKED_DISPUTE";
  const topViolationDisputeStatus = topViolationLinked ? "linked" : isTopViolationDisputed ? "sent" : packetForTopViolation ? "created" : "none";

  if (isLoadingViolations || isLoadingChallenges) {
    return (
      <div className={`${styles.container} ${className || ''}`}>
        <Skeleton className={styles.summarySkeleton} />
        <Skeleton className={styles.contentSkeleton} />
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ''}`}>
      {/* Province warning banner */}
      {isProvinceUnset && (
        <div className={styles.provinceWarningBanner}>
          <div className={styles.bannerContent}>
            <AlertTriangle size={24} className={styles.provinceWarningIcon} />
            <div>
              <h4 className={styles.provinceWarningTitle}>We Need Your Province to Check the Right Rules</h4>
              <p className={styles.bannerText}>
                Your province determines which laws protect you and the specific deadlines for credit reporting. Without it, we can only check federal regulations and may miss important provincial protections.
              </p>
            </div>
          </div>
          <Button
            variant="default"
            className={styles.provinceWarningButton}
            onClick={() => setShowProvinceDialog(true)}
          >
            Set Your Province
          </Button>
        </div>
      )}

      {isAdmin && statuteOfLimitationsViolation && (
        <div className={isSolPacketSent ? styles.primaryViolationBannerSent : styles.primaryViolationBanner}>
          <div className={styles.bannerContent}>
            {isSolPacketSent ? (
              <CheckCircle2 size={24} className={styles.bannerIconSent} />
            ) : (
              <ShieldAlert size={24} className={styles.bannerIcon} />
            )}
            <div>
              <h4 className={isSolPacketSent ? styles.bannerTitleSent : styles.bannerTitle}>
                {isSolPacketSent ? "DISPUTE LETTER SENT" : "MAIN PROBLEM"}
              </h4>
              <p className={styles.bannerText}>
                {isSolPacketSent 
                  ? "Your dispute letter for this violation has been sent — awaiting bureau response within 30 days."
                  : solPacket 
                    ? "Dispute letter created — review and send it."
                    : "This debt is past its 6-year reporting term and must be removed from your credit report."}
              </p>
            </div>
          </div>
          <Button 
            variant="default"
            className={isSolPacketSent ? styles.bannerButtonSent : styles.bannerButton}
            onClick={() => solPacket ? handleViewPacket(statuteOfLimitationsViolation.id) : handleGeneratePacket(statuteOfLimitationsViolation.id)}
            disabled={isValidating}
          >
            {isSolPacketSent 
              ? "View Sent Letter"
              : solPacket
                ? "View Dispute Letter"
                : "Create Dispute Letter"}
          </Button>
        </div>
      )}

      {/* Summary Bar */}
      {!hideSummaryBar && (
        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <div className={styles.summaryIconWrapper} data-type="issues">
              <AlertTriangle size={18} />
            </div>
            <div className={styles.summaryText}>
              <span className={styles.summaryLabel}>Problems Found</span>
              <span className={styles.summaryValue}>{activeIssuesCount}</span>
            </div>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryItem}>
            <div className={styles.summaryIconWrapper} data-type="challenges">
              <Send size={18} />
            </div>
            <div className={styles.summaryText}>
              <span className={styles.summaryLabel}>Letters Sent</span>
              <span className={styles.summaryValue}>{challengesSentCount}</span>
            </div>
          </div>
          <div className={styles.summaryDivider} />
          <div className={styles.summaryItem}>
            <div className={styles.summaryIconWrapper} data-type="responses">
              <CheckCircle2 size={18} />
            </div>
            <div className={styles.summaryText}>
              <span className={styles.summaryLabel}>Replies Back</span>
              <span className={styles.summaryValue}>{responsesReceivedCount}</span>
            </div>
          </div>
        </div>
      )}

      {/* Problems Found Section */}
      <div className={styles.contentSection}>
        {isAdmin && (
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>Problems We Found</h3>
              <p className={styles.sectionDescription}>
                We checked your credit report and found problems that should be disputed.
              </p>
            </div>
            <ComplianceRescanButton tradelineId={tradelineId} />
          </div>
        )}

        {isAdmin && displayViolations.length > 0 && (
          <div className={styles.federalBanner}>
            <Scale size={16} className={styles.federalBannerIcon} />
            <p className={styles.federalBannerText}>
              Canada's privacy law (PIPEDA) says your information must be correct and up-to-date. Credit reporting format rules (Metro2) also apply.
            </p>
          </div>
        )}

        {approachingViolation && (
          <div className={styles.approachingCard}>
            <div className={styles.approachingHeader}>
              <Clock className={styles.approachingIcon} size={32} />
              <h3 className={styles.approachingTitle}>{Math.max(1, approachingViolation.technicalDetails?.monthsRemaining ?? 1)} months until this account must be removed</h3>
            </div>
            <div className={styles.approachingContent}>
              <p className={styles.approachingText}>
                Good news! This account is almost past the time limit. In {Math.max(1, approachingViolation.technicalDetails?.monthsRemaining ?? 1)} months, the credit bureau must take it off your report.
              </p>
              <div className={styles.approachingProgressContainer}>
                <div className={styles.approachingProgressLabels}>
                  <span>Account Opened / Delinquent</span>
                  <span>Expected removal: {approachingViolation.technicalDetails?.reportingLimitDate ? new Date(approachingViolation.technicalDetails.reportingLimitDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Soon'}</span>
                </div>
                <Progress 
                  value={Math.max(0, Math.min(100, 100 - ((approachingViolation.technicalDetails?.daysRemaining ?? 0) / ((approachingViolation.technicalDetails?.retentionYears ?? 6) * 365)) * 100))} 
                  className={styles.approachingProgress} 
                />
              </div>
              <p className={styles.approachingAdvice}>
                <strong>Our advice:</strong> Just wait. You don't need to send any letters. When the time is up, it goes away on its own.
              </p>
            </div>
          </div>
        )}

        {(isAdmin ? displayViolations : nonAdminDisplayViolations).length === 0 && !approachingViolation && dismissedViolations.length === 0 ? (
          <div className={styles.emptyState}>
            <CheckCircle2 size={48} className={styles.successIcon} />
            <h3>No Data Errors Found</h3>
            <p>We didn't find any specific data errors with this account. You can still challenge how it's being reported using the options below.</p>
          </div>
        ) : isAdmin ? (
          <div className={styles.violationList}>
            {displayViolations.map((v) => {
              const packetForThisViolation = packetsData?.packets?.find(
                p => p.creditorObligationTestId === v.id
              );
              const hasPacketForThisViolation = !!packetForThisViolation;
              const isDisputed = !!(packetForThisViolation && (packetForThisViolation.status?.toUpperCase() === "SENT" || packetForThisViolation.sentDate));

              return (
                <ComplianceViolationCard
                  key={v.id}
                  violation={v}
                  tradelineId={tradelineId}
                  onGeneratePacket={handleGeneratePacket}
                  disabled={isValidating}
                  reportArtifactId={currentTradeline?.reportArtifactId ?? null}
                  sourceText={currentTradeline?.sourceText ?? null}
                  onViewSource={() => setViewingSourceReport(true)}
                  hasExistingPacket={hasPacketForThisViolation}
                  onViewPacket={() => handleViewPacket(v.id)}
                  isDisputed={isDisputed}
                  onDismiss={handleDismissViolation}
                  isDismissed={false}
                />
              );
            })}
            
            {dismissedViolations.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className={styles.dismissedTrigger}>
                  <span>Dismissed Issues ({dismissedViolations.length})</span>
                  <ChevronDown size={16} />
                </CollapsibleTrigger>
                <CollapsibleContent className={styles.dismissedContent}>
                  <div className={styles.violationList}>
                    {dismissedViolations.map((v) => {
                      const packetForThisViolation = packetsData?.packets?.find(
                        p => p.creditorObligationTestId === v.id
                      );
                      const hasPacketForThisViolation = !!packetForThisViolation;
                      const isDisputed = !!(packetForThisViolation && (packetForThisViolation.status?.toUpperCase() === "SENT" || packetForThisViolation.sentDate));

                      return (
                        <ComplianceViolationCard
                          key={v.id}
                          violation={v}
                          tradelineId={tradelineId}
                          onGeneratePacket={handleGeneratePacket}
                          disabled={isValidating}
                          reportArtifactId={currentTradeline?.reportArtifactId ?? null}
                          sourceText={currentTradeline?.sourceText ?? null}
                          onViewSource={() => setViewingSourceReport(true)}
                          hasExistingPacket={hasPacketForThisViolation}
                          onViewPacket={() => handleViewPacket(v.id)}
                          isDisputed={isDisputed}
                          onDismiss={handleDismissViolation}
                          isDismissed={true}
                          dismissReason={v.userStatusReason ?? undefined}
                        />
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : (
          <div className={styles.nonAdminViolations}>
            {topViolation && (
              <div className={styles.fightCard} data-status={topViolationDisputeStatus}>
                <div className={styles.fightCardHeader}>
                  <div className={styles.fightCardHeaderLeft}>
                    {topViolationDisputeStatus === "sent" || topViolationDisputeStatus === "linked" ? (
                      <CheckCircle2 className={styles.fightCardIcon} size={32} />
                    ) : (
                      <ShieldAlert className={styles.fightCardIcon} size={32} />
                    )}
                    <h3 className={styles.fightCardTitle}>{topViolationTitle}</h3>
                    {topViolation.technicalDetails?.responsibleEntity && getEntityBadgeLabel(topViolation.technicalDetails.responsibleEntity) && (
                      <Badge variant="default" className={styles.entityBadgeOutline}>
                        {getEntityBadgeLabel(topViolation.technicalDetails.responsibleEntity)}
                      </Badge>
                    )}
                  </div>
                  {topViolationDisputeStatus === "sent" && (
                    <Badge variant="success">Letter Sent ✓</Badge>
                  )}
                  {topViolationDisputeStatus === "linked" && (
                    <Badge variant="info">Handled via Linked Account</Badge>
                  )}
                </div>
                <div className={styles.fightCardContent}>
                  <p className={styles.fightCardExplanation}>{topViolationExplanation}</p>
                </div>
                <div className={styles.fightCardFooter}>
                  {topViolationLinked ? (
                    <p className={styles.linkedNoticeText}>A dispute letter was already sent from the linked duplicate account.</p>
                  ) : (
                    <Button 
                      size="lg"
                      onClick={() => packetForTopViolation ? handleViewPacket(topViolation.id) : handleGeneratePacket(topViolation.id)}
                      disabled={isValidating}
                                            variant={isTopViolationDisputed || packetForTopViolation ? "secondary" : "primary"}
                    >
                                        {isTopViolationDisputed 
                        ? "View Your Letter"
                        : packetForTopViolation
                          ? "Review & Send Letter"
                          : "Create Dispute Letter"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {otherViolations.length > 0 && (
              <div className={styles.otherIssuesSection}>
                <h4 className={styles.otherIssuesHeader}>
                  {otherViolations.length} more problem{otherViolations.length !== 1 ? 's' : ''} we found
                </h4>
                <div className={styles.simpleViolationList}>
                  {otherViolations.map(v => {
                    const pForThis = packetsData?.packets?.find(p => p.creditorObligationTestId === v.id);
                    const isDisp = !!(pForThis && (pForThis.status?.toUpperCase() === "SENT" || pForThis.sentDate));
                    const isLinked = v.obligationState === "ADDRESSED_VIA_LINKED_DISPUTE";
                    return (
                      <div key={v.id} className={styles.simpleViolationItem} data-status={isLinked ? "linked" : isDisp ? "sent" : "none"} data-severity={v.severity}>
                        <div className={styles.simpleViolationInfo}>
                          <div className={styles.simpleViolationHeader}>
                            <div className={styles.simpleViolationLabel}>{getViolationLabel(v.violationCategory)}</div>
                            {v.technicalDetails?.responsibleEntity && getEntityBadgeLabel(v.technicalDetails.responsibleEntity) && (
                              <Badge variant="default" className={styles.entityBadgeOutlineSmall}>
                                {getEntityBadgeLabel(v.technicalDetails.responsibleEntity)}
                              </Badge>
                            )}
                            {isLinked && <Badge variant="info">Handled via Linked Account</Badge>}
                            {isDisp && !isLinked && <Badge variant="success">Sent ✓</Badge>}
                          </div>
                          <div className={styles.simpleViolationExplanation}>{getEnrichedExplanation(v)}</div>
                        </div>
                        {isLinked ? (
                          <span className={styles.linkedNoticeTextSmall}>Handled via linked account</span>
                        ) : (
                          <Button
                            size="sm"
                            variant={pForThis ? "default" : "secondary"}
                            onClick={() => pForThis ? handleViewPacket(v.id) : handleGeneratePacket(v.id)}
                            disabled={isValidating}
                          >
                            {isDisp ? "View Sent Letter" : pForThis ? "View Letter" : "Create Letter"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreatePacketDialog
        open={isPacketDialogOpen}
        onOpenChange={(open) => {
          setIsPacketDialogOpen(open);
          if (!open) setSelectedViolationId(null);
        }}
        onPacketCreated={(packetData) => {
          setPreviewPacketData(packetData);
          setViewingPacketId(null);
          setIsPacketViewerOpen(true);
        }}
        autofillViolationId={selectedViolationId || undefined}
        autofillTradelineId={tradelineId}
        autofillBureauId={currentTradeline?.bureauId || undefined}
      />

      <Suspense fallback={<Skeleton className={styles.contentSkeleton} />}>
        <PacketViewer 
          packetId={viewingPacketId}
          previewData={previewPacketData}
          open={isPacketViewerOpen}
          onOpenChange={(open) => {
            setIsPacketViewerOpen(open);
            if (!open) setPreviewPacketData(null);
          }}
          onSaved={(newId) => {
            setPreviewPacketData(null);
            setViewingPacketId(newId);
          }}
        />
      </Suspense>

      <ProfileCompletionDialog
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        missingUserFields={missingUserFields}
        onComplete={handleProfileCompleted}
      />

      <ProfileCompletionDialog
        open={showProvinceDialog}
        onOpenChange={setShowProvinceDialog}
        missingUserFields={["province"]}
        onComplete={handleProvinceCompleted}
      />

      <SourceReportViewer
        reportArtifactId={currentTradeline?.reportArtifactId ?? null}
        sourceText={currentTradeline?.sourceText ?? null}
        open={viewingSourceReport}
        onOpenChange={setViewingSourceReport}
      />
    </div>
  );
};
