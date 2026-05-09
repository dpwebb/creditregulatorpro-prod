import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet";

import { 
  History, 
  AlertTriangle,
  LayoutDashboard,
  TrendingUp,
  ClipboardCheck,
  ShieldAlert,
  ShieldCheck,
  BarChart3,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/Collapsible";
import { TradelineHeader } from "../components/TradelineHeader";
import { CrossBureauComparison } from "../components/CrossBureauComparison";
import { BureauBadge } from "../components/BureauBadge";
import { BureauCommunicationDialog } from "../components/BureauCommunicationDialog";
import { TradelineValidationSection } from "../components/TradelineValidationSection";
import { TradelineDriftPanel } from "../components/TradelineDriftPanel";
import { TradelineComplianceHub } from "../components/TradelineComplianceHub";
import { TradelineExportSection } from "../components/TradelineExportSection";
import { TradelinePacketGenerationCard } from "../components/TradelinePacketGenerationCard";
import { ParsedDataOverview } from "../components/ParsedDataOverview";
import { AccountChangesSummary } from "../components/AccountChangesSummary";
import { DiscriminationClaimsList } from "../components/DiscriminationClaimsList";
import { PacketImpactView } from "../components/PacketImpactView";
import { useAuth } from "../helpers/useAuth";
import { ChallengeEvidencePanel } from "../components/ChallengeEvidencePanel";
import { useTradeline } from "../helpers/useTradeline";
import { useTradelineEvidence, EvidenceEventWithDetails } from "../helpers/evidenceQueries";

import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { useComplianceViolations } from "../helpers/complianceViolationQueries";
import { calculateTerminalLabel, TerminalLabelPhase } from "../helpers/terminalLabelProgression";

import { usePacketReadiness } from "../helpers/usePacketReadiness";
import { ProfileCompletionDialog } from "../components/ProfileCompletionDialog";
import { DeliveryWizard } from "../components/DeliveryWizard";
import { SourceReportViewer } from "../components/SourceReportViewer";
import { useTradelinePackets } from "../helpers/packetQueries";
import { CreatePacketDialog } from "../components/CreatePacketDialog";
import { postSelect } from "../endpoints/planner/select_POST.schema";
import { postBuildPacket } from "../endpoints/packet/build_POST.schema";
import { useQueryClient } from "@tanstack/react-query";
import { ComplianceRescanButton } from "../components/ComplianceRescanButton";
import { RelatedCollectionAccounts } from "../components/RelatedCollectionAccounts";
import { FundamentalChallenges } from "../components/FundamentalChallenges";
import styles from "./tradelines.$id.module.css";

const PacketViewer = React.lazy(() => import("../components/PacketViewer").then((m) => ({ default: m.PacketViewer })));

export default function TradelineDetailPage() {
  const { isAdmin } = useAuth();
  const { id } = useParams<{ id: string }>();
  const tradelineId = Number(id);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  let defaultTab = isAdmin ? "overview" : "compliance";
  let activeTab = searchParams.get('tab') || defaultTab;
  if (!isAdmin && ["drift", "impact", "validation", "discrimination", "overview"].includes(activeTab)) {
    activeTab = "compliance";
  }
  const focusedViolationId = Number(searchParams.get("reviewViolationId")) || undefined;

  const [isGenerating, setIsGenerating] = useState(false);
  const [isBureauUploadOpen, setIsBureauUploadOpen] = useState(false);
  const [viewingSourceReport, setViewingSourceReport] = useState(false);
  const [viewingPacketId, setViewingPacketId] = useState<number | null>(null);
  const [previewPacketData, setPreviewPacketData] = useState<any | null>(null);
  const [isRecordMailingOpen, setIsRecordMailingOpen] = useState(false);
  
  // Create Packet Dialog State (Manual / Return Flow)
  const [isCreatePacketOpen, setIsCreatePacketOpen] = useState(false);
  const [createPacketContext, setCreatePacketContext] = useState<{
    bureauId?: number;
    violationId?: number;
  }>({});
  const [challengeAccessPointId, setChallengeAccessPointId] = useState<string | undefined>(undefined);
  const [isDefaultDisputeBoth, setIsDefaultDisputeBoth] = useState(false);

  const { mutateAsync: validateReadiness } = usePacketReadiness();

  // Profile Completion Dialog State
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [missingUserFields, setMissingUserFields] = useState<string[]>([]);

  // Fetch single tradeline by ID
  const { data: tradelineData, isLoading: isTradelineLoading, error: tradelineError } = useTradeline(tradelineId);
  const tradeline = tradelineData?.tradeline;

  // Fetch packets for this tradeline
  const { data: packetsData } = useTradelinePackets(tradelineId);
  const existingPacket = packetsData?.packets?.length ? [...packetsData.packets].sort((a, b) => b.id - a.id)[0] : undefined;

  // Fetch evidence for this tradeline
  const { data: evidenceData, isLoading: isEvidenceLoading } = useTradelineEvidence(tradelineId);
  const evidenceEvents = evidenceData?.events || [];

  // Fetch obligation instances to calculate terminal phase
  const { data: obligationInstancesData } = useObligationInstanceList({ tradelineId });
  const obligationInstances = obligationInstancesData?.instances || [];
  
  // Calculate Terminal Phase
  const terminalPhase: TerminalLabelPhase = calculateTerminalLabel(obligationInstances);

  const challengesSentCount = obligationInstances.filter(c => !!c.challengeSentDate).length;
  const { data: violationsData } = useComplianceViolations(tradelineId);
  const responsesReceivedCount = obligationInstances.filter(c => c.state === "RESPONSE_RECORDED").length;

  const showProceduralChallenges = useMemo(() => {
    const activeViolations = (violationsData?.obligationTests || []).filter(
      (v) => 
        v.userStatus !== "dismissed" && 
        v.userStatus !== "verified" && 
        v.violationCategory !== "MULTIPLE_COLLECTOR_VIOLATION" &&
        v.violationCategory !== "STATUTE_APPROACHING"
    );
    const allViolationsExhausted = activeViolations.every(v => {
      const packet = packetsData?.packets?.find(p => p.creditorObligationTestId === v.id);
      return packet && (packet.status?.toUpperCase() === "SENT" || !!packet.sentDate);
    });
    return activeViolations.length === 0 || allViolationsExhausted;
  }, [violationsData?.obligationTests, packetsData?.packets]);

  // Handle return flow from profile settings
  useEffect(() => {
    const openCreate = searchParams.get("openCreatePacket");
    if (openCreate === "true") {
      const bureauIdStr = searchParams.get("bureauId");
      const violationIdStr = searchParams.get("violationId");
      
      setCreatePacketContext({
        bureauId: bureauIdStr ? parseInt(bureauIdStr) : undefined,
        violationId: violationIdStr ? parseInt(violationIdStr) : undefined,
      });
      setIsCreatePacketOpen(true);

      // Clean up params but keep tab
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("openCreatePacket");
      newParams.delete("bureauId");
      newParams.delete("violationId");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Sign & Generate Logic
  const handleSignAndGenerate = async () => {
    if (!tradelineId) return;
    setIsGenerating(true);

    try {
      // 1. Validate readiness first
      const readiness = await validateReadiness({ tradelineId });

      if (!readiness.isReady && readiness.missingUserFields.length > 0) {
        setMissingUserFields(readiness.missingUserFields);
        setShowProfileDialog(true);
        setIsGenerating(false);
        return;
      }

      if (!readiness.isReady && readiness.missingBureauInfo) {
        toast.error(`Bureau ${readiness.bureauName || 'Unknown'} is missing address information. Please update bureau details before generating a packet.`);
        setIsGenerating(false);
        return;
      }

      // 2. Proceed with generation if ready
      await performPacketGeneration();
    } catch (e) {
      console.error("[TradelineDetail] Validation failed:", e);
      toast.error(e instanceof Error ? e.message : "Validation failed");
      setIsGenerating(false);
    }
  };

  const performPacketGeneration = async () => {
    if (!tradelineId) return;
    
    try {
      const selectResult = await postSelect({ tradelineId });
      if (!selectResult.ok) throw new Error("Failed to select obligation instance");

      const buildResult = await postBuildPacket({ 
        obligationInstanceId: selectResult.selectedInstanceId 
      });

      if (!buildResult.ok) throw new Error("Failed to build packet");

      toast.success(`Packet #${buildResult.packetId} generated successfully`);
      queryClient.invalidateQueries({ queryKey: ["evidence"] });
      queryClient.invalidateQueries({ queryKey: ["packets", { tradelineId }] });
    } catch (e) {
      console.error("[TradelineDetail] Generation failed:", e);
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProfileComplete = async () => {
    setShowProfileDialog(false);
    handleSignAndGenerate();
  };

  const handleManualPacketCreation = (disputeBoth: boolean = false) => {
    setCreatePacketContext({});
    setChallengeAccessPointId(undefined);
    setIsDefaultDisputeBoth(disputeBoth);
    setIsCreatePacketOpen(true);
  };

  const handleViewRelatedAccountsPacket = () => {
    const multipleCollectorViolation = violationsData?.obligationTests?.find(
      v => v.violationCategory === "MULTIPLE_COLLECTOR_VIOLATION"
    );
    if (multipleCollectorViolation && packetsData?.packets) {
      const packet = packetsData.packets.find(p => p.creditorObligationTestId === multipleCollectorViolation.id);
      if (packet) {
        setViewingPacketId(packet.id);
      }
    }
  };

  const handleDisputeRelatedAccounts = async () => {
    if (!tradelineId) return;
    try {
      const readiness = await validateReadiness({ tradelineId });

      if (!readiness.isReady && readiness.missingUserFields.length > 0) {
        setMissingUserFields(readiness.missingUserFields);
        setShowProfileDialog(true);
        return;
      }

      if (!readiness.isReady && readiness.missingBureauInfo) {
        toast.error(`Bureau ${readiness.bureauName || 'Unknown'} is missing address information. Please update bureau details before generating a packet.`);
        return;
      }

      const multipleCollectorViolation = violationsData?.obligationTests?.find(
        v => v.violationCategory === "MULTIPLE_COLLECTOR_VIOLATION"
      );

      setCreatePacketContext({
        bureauId: tradeline?.bureauId ?? undefined,
        violationId: multipleCollectorViolation?.id
      });
      setIsCreatePacketOpen(true);
    } catch (e) {
      console.error("[TradelineDetail] Validation failed:", e);
      toast.error(e instanceof Error ? e.message : "Validation failed");
    }
  };

  if (isTradelineLoading) {
    return (
      <div className={styles.container}>
        <Skeleton className="w-full h-48" />
        <div className={styles.tabs}>
          <Skeleton className="w-full h-12 mb-4" />
          <Skeleton className="w-full h-96" />
        </div>
      </div>
    );
  }

  if (tradelineError || !tradeline) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <AlertTriangle size={48} />
          <h1>{tradelineError instanceof Error ? tradelineError.message : "Account Not Found"}</h1>
          <p>The record might have been deleted or you do not have permission to view it.</p>
          <Button asChild variant="outline">
            <Link to="/my-accounts">Back to Your Accounts</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Helmet>
        <title>{tradeline.creditorName || "Account"} | Credit Regulator Pro</title>
      </Helmet>

            <Link to="/my-accounts" className={styles.backLink}>
        ← Back to Your Accounts
      </Link>

      <TradelineHeader 
        accountNumber={tradeline.accountNumber}
        bureauName={tradeline.bureauName}
        creditorName={tradeline.creditorName}
        status={tradeline.status}
        balance={tradeline.balance ?? tradeline.currentBalance}
        openedDate={tradeline.openedDate ? String(tradeline.openedDate) : null}
        accountType={tradeline.accountType}
        terminalPhase={terminalPhase}
        isCollectionAccount={tradeline.isCollectionAccount ?? false}
        collectionAgencyName={tradeline.collectionAgencyName}
        originalCreditorName={tradeline.originalCreditorName}
        dateAssignedToCollection={tradeline.dateAssignedToCollection ? String(tradeline.dateAssignedToCollection) : null}
        originalBalance={tradeline.originalBalance}
        amountPastDue={tradeline.amountPastDue}
        interestRate={tradeline.interestRate ? parseFloat(String(tradeline.interestRate)) : null}
        terms={tradeline.terms}
        monthlyPayment={tradeline.monthlyPayment}
        lastActivityDate={tradeline.lastActivityDate ? String(tradeline.lastActivityDate) : null}
        highCredit={tradeline.highCredit}
        mop={tradeline.mop}
        compact={!isAdmin}
        responsibilityCode={tradeline.responsibilityCode}
        crossBureauTradeline={tradeline.crossBureauTradeline}
      />

      {tradeline.crossBureauTradeline && (
        <CrossBureauComparison
          tradelineA={{
            id: tradeline.id,
            bureauName: tradeline.bureauName ?? null,
            creditorName: tradeline.creditorName ?? null,
            accountNumber: tradeline.accountNumber ?? null,
            balance: tradeline.balance != null ? Number(tradeline.balance) : null,
            currentBalance: tradeline.currentBalance != null ? Number(tradeline.currentBalance) : null,
            status: tradeline.status ?? null,
            openedDate: tradeline.openedDate ?? null,
            dateClosed: tradeline.dateClosed ?? null,
            dateOfFirstDelinquency: tradeline.dateOfFirstDelinquency ?? null,
            creditLimit: tradeline.creditLimit != null ? Number(tradeline.creditLimit) : null,
            highCredit: tradeline.highCredit != null ? Number(tradeline.highCredit) : null,
            amountPastDue: tradeline.amountPastDue != null ? Number(tradeline.amountPastDue) : null,
            lastActivityDate: tradeline.lastActivityDate ?? null,
          }}
          tradelineB={{
            id: tradeline.crossBureauTradeline.id,
            bureauName: tradeline.crossBureauTradeline.bureauName,
            creditorName: tradeline.crossBureauTradeline.creditorName,
            accountNumber: tradeline.crossBureauTradeline.accountNumber,
            balance: tradeline.crossBureauTradeline.balance != null ? Number(tradeline.crossBureauTradeline.balance) : null,
            currentBalance: tradeline.crossBureauTradeline.currentBalance != null ? Number(tradeline.crossBureauTradeline.currentBalance) : null,
            status: tradeline.crossBureauTradeline.status,
            openedDate: tradeline.crossBureauTradeline.openedDate,
            dateClosed: tradeline.crossBureauTradeline.dateClosed,
            dateOfFirstDelinquency: tradeline.crossBureauTradeline.dateOfFirstDelinquency,
            creditLimit: tradeline.crossBureauTradeline.creditLimit != null ? Number(tradeline.crossBureauTradeline.creditLimit) : null,
            highCredit: tradeline.crossBureauTradeline.highCredit != null ? Number(tradeline.crossBureauTradeline.highCredit) : null,
            amountPastDue: tradeline.crossBureauTradeline.amountPastDue != null ? Number(tradeline.crossBureauTradeline.amountPastDue) : null,
            lastActivityDate: tradeline.crossBureauTradeline.lastActivityDate,
          }}
        />
      )}

      <RelatedCollectionAccounts 
        relatedTradelines={tradeline.relatedCollectionTradelines || []} 
        onCreateDispute={handleDisputeRelatedAccounts}
        onViewPacket={handleViewRelatedAccountsPacket}
      />

      <ProfileCompletionDialog 
        open={showProfileDialog}
        onOpenChange={setShowProfileDialog}
        missingUserFields={missingUserFields}
        onComplete={handleProfileComplete}
      />

      <CreatePacketDialog
        open={isCreatePacketOpen}
        onOpenChange={(open) => {
          setIsCreatePacketOpen(open);
          if (!open) {
            setChallengeAccessPointId(undefined);
            setIsDefaultDisputeBoth(false);
          }
        }}
        autofillTradelineId={tradelineId}
        autofillBureauId={createPacketContext.bureauId}
        autofillViolationId={createPacketContext.violationId}
        challengeAccessPointId={challengeAccessPointId}
        crossBureauTradelineId={tradeline.crossBureauTradeline?.id}
        crossBureauBureauId={tradeline.crossBureauTradeline?.bureauId}
        crossBureauBureauName={tradeline.crossBureauTradeline?.bureauName}
        defaultDisputeBoth={isDefaultDisputeBoth}
        onPacketCreated={(packetData) => {
          setPreviewPacketData(packetData);
          setViewingPacketId(null);
          setIsCreatePacketOpen(false);
          setChallengeAccessPointId(undefined);
          setIsDefaultDisputeBoth(false);
        }}
      />

      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <PacketViewer 
          packetId={viewingPacketId}
          previewData={previewPacketData}
          open={!!viewingPacketId || !!previewPacketData}
          onOpenChange={(open) => {
            if (!open) {
              setViewingPacketId(null);
              setPreviewPacketData(null);
            }
          }}
          onSaved={(newId) => {
            setPreviewPacketData(null);
            setViewingPacketId(newId);
          }}
        />
      </Suspense>

      <SourceReportViewer
        reportArtifactId={tradeline.reportArtifactId ?? null}
        sourceText={tradeline.sourceText}
        open={viewingSourceReport}
        onOpenChange={setViewingSourceReport}
      />

      <BureauCommunicationDialog 
        open={isBureauUploadOpen}
        onOpenChange={setIsBureauUploadOpen}
        defaultTradelineId={tradelineId}
      />

      <DeliveryWizard
        packetId={existingPacket?.id ?? 0}
        bureauName={tradeline.bureauName || "the credit bureau"}
        open={isRecordMailingOpen}
        onOpenChange={setIsRecordMailingOpen}
        initialStep="self"
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["packets", { tradelineId }] });
          queryClient.invalidateQueries({ queryKey: ["evidence"] });
          queryClient.invalidateQueries({ queryKey: ["tradeline", tradelineId] });
        }}
        onDownloadPdf={() => {
          if (existingPacket?.id) {
            window.open(`/_api/packet/pdf?packetId=${existingPacket.id}`, '_blank');
          } else {
            toast.error("PDF not available yet.");
          }
        }}
      />

      {!isAdmin ? (
        <div className={styles.nonAdminLayout}>
          <TradelineComplianceHub
            tradelineId={tradelineId}
            hideSummaryBar={true}
            focusViolationId={focusedViolationId}
          />

          {showProceduralChallenges && (
            <FundamentalChallenges
              tradelineId={tradelineId}
              creditorName={tradeline.creditorName || ""}
              status={tradeline.status}
              isCollectionAccount={tradeline.isCollectionAccount ?? false}
              bureauId={tradeline.bureauId ?? null}
              accountNumber={tradeline.accountNumber ?? null}
              onCreateChallengeLetter={(id) => {
                setChallengeAccessPointId(id);
                setIsCreatePacketOpen(true);
              }}
            />
          )}

          {packetsData?.packets && packetsData.packets.length > 0 && (
            <div className={styles.nonAdminActionBar}>
              {challengesSentCount > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIsBureauUploadOpen(true)}>
                  <History size={16} />
                  Log a Response
                </Button>
              )}
              {tradeline.crossBureauTradeline && (
                <Button onClick={() => handleManualPacketCreation(true)} size="sm" variant="secondary">
                  Dispute Both Bureaus
                </Button>
              )}
              
            </div>
          )}

          {evidenceEvents.length > 0 && (
            <Collapsible className={styles.detailsCollapsible}>
              <CollapsibleTrigger className={styles.detailsTrigger}>
                What Happened So Far
                <ChevronDown size={16} className={styles.detailsTriggerIcon} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className={styles.timeline}>
                  {evidenceEvents.map((event: EvidenceEventWithDetails) => (
                    <div key={event.id} className={styles.timelineItem}>
                      <div className={styles.timelineLeft}>
                        <div className={styles.timelineLine} />
                        <div className={styles.timelineDot} />
                      </div>
                      <div className={styles.timelineContent}>
                        <div className={styles.eventHeader}>
                          <Badge variant="default" className={styles.eventBadge}>
                            {event.eventType}
                          </Badge>
                          <span className={styles.eventDate}>
                            {event.at ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(event.at)) : ""}
                          </span>
                        </div>
                        <p className={styles.eventDesc}>{event.description}</p>
                        {event.packetId && (
                          <div className={styles.packetRef}>
                            Letter #{event.packetId}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Collapsible className={styles.detailsCollapsible}>
            <CollapsibleTrigger className={styles.detailsTrigger}>
              See account details
              <ChevronDown size={16} className={styles.detailsTriggerIcon} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {tradeline.reportArtifactId && (
                <div className={styles.sourceReportHeader}>
                  <Button 
                    variant="outline"
                    onClick={() => setViewingSourceReport(true)}
                    size="sm"
                  >
                    <ClipboardCheck size={16} />
                    View Source Report
                  </Button>
                </div>
              )}
              <ParsedDataOverview tradelineId={tradelineId} className={styles.parsedOverview} />
            </CollapsibleContent>
          </Collapsible>

          <div className={styles.rescanWrapper}>
            <p className={styles.rescanHint}>Upload a new report to see what changed</p>
            <ComplianceRescanButton tradelineId={tradelineId} />
          </div>
        </div>
      ) : (
        <Tabs 
          value={activeTab} 
          onValueChange={(value) => setSearchParams({ tab: value })}
          className={styles.tabs}
        >
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="overview" className={styles.tabsTrigger}>
              <LayoutDashboard size={16} className={styles.tabIcon} />
              Overview
            </TabsTrigger>
            <TabsTrigger value="compliance" className={styles.tabsTrigger}>
              <ShieldCheck size={16} className={styles.tabIcon} />
              Problems & Disputes
            </TabsTrigger>
            <TabsTrigger value="drift" className={styles.tabsTrigger}>
              <TrendingUp size={16} className={styles.tabIcon} />
              What Changed
            </TabsTrigger>
            <TabsTrigger value="impact" className={styles.tabsTrigger}>
              <BarChart3 size={16} className={styles.tabIcon} />
              How Your Letters Helped
            </TabsTrigger>
            <TabsTrigger value="validation" className={styles.tabsTrigger}>
              <ClipboardCheck size={16} className={styles.tabIcon} />
              Reporting Format Check
            </TabsTrigger>
            <TabsTrigger value="discrimination" className={styles.tabsTrigger}>
              <ShieldAlert size={16} className={styles.tabIcon} />
              Unfair Treatment Claims
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compliance">
            <TradelineComplianceHub
              tradelineId={tradelineId}
              focusViolationId={focusedViolationId}
            />
          </TabsContent>

          <TabsContent value="drift">
            <TradelineDriftPanel tradelineId={tradelineId} />
          </TabsContent>

          <TabsContent value="impact">
            <PacketImpactView tradelineId={tradelineId} />
          </TabsContent>

          <TabsContent value="overview">
            <ParsedDataOverview tradelineId={tradelineId} className={styles.parsedOverview} />
            <AccountChangesSummary tradelineId={tradelineId} maxItems={5} className={styles.changesSummary} />
            <div className={styles.contentGrid}>
              {/* Left Column: Actions */}
              <div className={styles.actionColumn}>
                <div className={styles.card}>
                  <div className={styles.actionBody}>
                    <h3 className={styles.actionHeading}>Timeline from Credit Companies</h3>
                    <p className={styles.instruction}>
                      Got a letter or reply from a credit reporting company? Save it here so you have a record.
                    </p>
                    <Button 
                      variant="outline" 
                      className={styles.fullWidth}
                      onClick={() => setIsBureauUploadOpen(true)}
                    >
                      <History size={16} />
                      Log a Response You Got
                    </Button>
                  </div>
                </div>

                {tradeline.reportArtifactId && (
                  <div className={styles.card}>
                    <div className={styles.actionBody}>
                      <h3 className={styles.actionHeading}>Original Report</h3>
                      <p className={styles.instruction}>
                        View the original credit report this account came from.
                      </p>
                      <Button 
                        variant="outline"
                        className={styles.fullWidth}
                        onClick={() => setViewingSourceReport(true)}
                      >
                        <ClipboardCheck size={16} />
                        View Source Report
                      </Button>
                    </div>
                  </div>
                )}

                <TradelineExportSection tradelineId={tradelineId} />

                <TradelinePacketGenerationCard 
                  isGenerating={isGenerating}
                  onGenerate={handleSignAndGenerate}
                  onViewCompliance={() => setSearchParams({ tab: "compliance" })}
                  existingPacketId={existingPacket?.id}
                  onViewPacket={() => existingPacket && setViewingPacketId(existingPacket.id)}
                  existingPacketStatus={existingPacket?.status}
                  onRecordMailing={() => setIsRecordMailingOpen(true)}
                />
              </div>

              {/* Right Column: Timeline */}
              <div className={styles.timelineColumn}>
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}>
                    <History size={18} />
                    What Happened So Far
                  </h2>
                  
                  <div className={styles.timeline}>
                    {isEvidenceLoading ? (
                      <div className={styles.loadingState}>
                        <Skeleton className="w-full h-12 mb-2" />
                        <Skeleton className="w-full h-12 mb-2" />
                        <Skeleton className="w-full h-12" />
                      </div>
                    ) : evidenceEvents.length === 0 ? (
                      <div className={styles.emptyState}>
                        Nothing recorded yet.
                      </div>
                    ) : (
                      evidenceEvents.map((event: EvidenceEventWithDetails) => (
                        <div key={event.id} className={styles.timelineItem}>
                          <div className={styles.timelineLeft}>
                            <div className={styles.timelineLine} />
                            <div className={styles.timelineDot} />
                          </div>
                          <div className={styles.timelineContent}>
                            <div className={styles.eventHeader}>
                              <Badge variant="default" className={styles.eventBadge}>
                                {event.eventType}
                              </Badge>
                              <span className={styles.eventDate}>
                                {event.at ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(event.at)) : ""}
                              </span>
                            </div>
                            <p className={styles.eventDesc}>{event.description}</p>
                            {event.packetId && (
                              <div className={styles.packetRef}>
                                Letter #{event.packetId}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="validation">
            <TradelineValidationSection tradelineId={tradelineId} />
          </TabsContent>

          <TabsContent value="discrimination">
            <section className={styles.card}>
              <div className={styles.cardHeaderWithDesc}>
                <h2 className={styles.cardTitle}>
                  <ShieldAlert size={18} />
                  Unfair Treatment Claims
                </h2>
                <p className={styles.sectionDescription}>
                  If you think a credit company treated you unfairly because of who you are, you can track it here. This can help make your dispute stronger.
                </p>
              </div>
              <div className={styles.actionBody}>
                <DiscriminationClaimsList tradelineId={tradelineId} />
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
