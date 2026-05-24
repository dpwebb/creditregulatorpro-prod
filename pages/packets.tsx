import React, { useState, Suspense } from "react";
import { Helmet } from "react-helmet";
import {
  useBuildPacketPreview,
  useCreatePacket,
  usePacketList,
  useDeletePacket,
  usePacketRecommendations,
  usePacketReadiness,
} from "../helpers/packetQueries";
import { useUpdatePacketStatus } from "../helpers/useUpdatePacketStatus";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { Input } from "../components/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "../components/Dialog";
import { Skeleton } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { PageHeader } from "../components/PageHeader";

import { PacketComplianceBadge } from "../components/PacketComplianceBadge";
import { Trash2, ScrollText, Calendar, AlertCircle, FileStack, Eye, Mail, FileCheck, Plus } from "lucide-react";

const PacketViewer = React.lazy(() => import("../components/PacketViewer").then(m => ({ default: m.PacketViewer })));
import { DeliveryWizard } from "../components/DeliveryWizard";
import { HelpTooltip } from "../components/HelpTooltip";
import { ExportDropdown } from "../components/ExportDropdown";
import { BulkActionsToolbar, BulkSelectAllCheckbox, BulkRowCheckbox } from "../components/BulkActionsToolbar";
import { useToast } from "../helpers/useToast";
import { exportToCSV } from "../helpers/csvExporter";
import { generateReportPDF } from "../helpers/reportGenerator";
import { formatDateTime, formatRelativeTime, formatDate } from "../helpers/formatters";
import { useAuth } from "../helpers/useAuth";
import { FRONTEND_LIMITED_BETA_READINESS } from "../helpers/frontendProductionReadinessUx";
import { useResponseDocuments } from "../helpers/responseDocumentQueries";
import type { OutputType as ResponseListOutput } from "../endpoints/responses/list_GET.schema";
import { Link, useSearchParams } from "react-router-dom";
import type { DisputePacketType } from "../helpers/disputePacketTemplate";
import type {
  DisputePacketCandidate,
  PacketReadinessReasonCode,
  PacketReadinessResult,
} from "../helpers/disputePacketService";
import type { SimpleDisputePacketContent } from "../helpers/disputePacketTemplate";
import { buildPacketPreviewDisplayContent, type PacketPreviewDisplayContent } from "../helpers/packetPreviewDisplay";
import styles from "./packets.module.css";

export function parseInitialPacketIssueId(searchParams: URLSearchParams): number | null {
  const issueIdParam = searchParams.get("issueId");
  if (issueIdParam === null) return null;
  const parsedIssueId = Number(issueIdParam);
  return Number.isInteger(parsedIssueId) && parsedIssueId > 0 ? parsedIssueId : null;
}

type PacketReviewStep = {
  needed: string;
  reviewer: string;
  completion: string;
};

const DEFAULT_PACKET_REVIEW_STEP: PacketReviewStep = {
  needed: "This problem needs review before a letter can be created.",
  reviewer: "You or support can review the account details.",
  completion: "Open the account details, confirm the source-report evidence supports the problem, then verify the problem.",
};

function packetReviewStepForReason(code: PacketReadinessReasonCode | string | null | undefined): PacketReviewStep {
  switch (code) {
    case "MISSING_REQUIRED_EVIDENCE":
      return {
        needed: "Source-report evidence needs to be linked to this problem.",
        reviewer: "You or support can review the account details.",
        completion: "Open the account, confirm the report section that supports the problem, then verify the problem.",
      };
    case "NEEDS_USER_REVIEW":
    case "MANUAL_REVIEW_REQUIRED":
      return {
        needed: "The problem needs to be confirmed before a letter is created.",
        reviewer: "You can review it; support can help if the evidence is unclear.",
        completion: "Review the source-report evidence and verify the problem, or dismiss it if it is not correct.",
      };
    case "PARSER_UNCERTAIN":
    case "EXTRACTION_CONFIDENCE_NOT_READY":
      return {
        needed: "The report text extraction needs review.",
        reviewer: "Support needs to review the extracted account details.",
        completion: "Support corrects or approves the extracted details, then the problem can be verified for letter creation.",
      };
    case "PACKET_TYPE_UNAVAILABLE":
    case "COLLECTION_AGENCY_REQUIRED":
    case "RECIPIENT_BUREAU_MISMATCH":
      return {
        needed: "This letter type does not match the selected problem.",
        reviewer: "No evidence review is needed.",
        completion: "Switch to the matching letter type or select a different problem.",
      };
    case "DISMISSED_FINDING":
      return {
        needed: "This problem was dismissed.",
        reviewer: "You or support can review whether it should be restored.",
        completion: "Restore and verify the problem before creating a letter.",
      };
    case "FINDING_NOT_FOUND":
    case "UNAUTHORIZED_FINDING":
      return {
        needed: "This problem is not available for your account.",
        reviewer: "Support can review access if you believe this is wrong.",
        completion: "Return to the account page and choose an active problem, or contact support.",
      };
    case "MIXED_OWNER_SELECTION":
    case "MIXED_TRADELINE_SELECTION":
    case "MIXED_BUREAU_SELECTION":
      return {
        needed: "The selected problems cannot be combined in one letter.",
        reviewer: "No evidence review is needed.",
        completion: "Create one letter per account, person, and bureau.",
      };
    case "WEAK_PACKET_NARRATIVE":
      return {
        needed: "The letter reason needs a clearer plain-language explanation.",
        reviewer: "Support can review the problem description.",
        completion: "Update the problem description so the letter can clearly explain what should be investigated.",
      };
    default:
      return DEFAULT_PACKET_REVIEW_STEP;
  }
}

function packetReviewStepsForReadiness(readiness: PacketReadinessResult | undefined): PacketReviewStep[] {
  const codes = [
    ...(readiness?.blockers ?? []).map((blocker) => blocker.code),
    ...(readiness?.reasonCodes ?? []),
  ];
  const steps = codes.map(packetReviewStepForReason);
  const uniqueSteps: PacketReviewStep[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    const key = `${step.needed}|${step.reviewer}|${step.completion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueSteps.push(step);
  }

  return uniqueSteps.length > 0 ? uniqueSteps : [DEFAULT_PACKET_REVIEW_STEP];
}

type ResponseTimelineItem = ResponseListOutput["responses"][number];

function PacketRecipientFacingPreview({ content }: { content: PacketPreviewDisplayContent }) {
  return (
    <div className={styles.previewContent} role="region" aria-label="Recipient-facing packet preview">
      <section className={styles.previewLetterSection} aria-label="Recipient-facing dispute letter">
        <pre className={styles.previewLetterText}>{content.letterText}</pre>
      </section>
      {content.evidenceSummary.length > 0 && (
        <section className={styles.previewSupplementalSection}>
          <h5>Evidence summary</h5>
          <ul>
            {content.evidenceSummary.map((item, index) => (
              <li key={`evidence-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {content.attachmentChecklist.length > 0 && (
        <section className={styles.previewSupplementalSection}>
          <h5>Attachment checklist</h5>
          <ul>
            {content.attachmentChecklist.map((item, index) => (
              <li key={`attachment-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function formatResponseEnum(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value.replace(/_/g, " ");
}

function responseOutcomeLabel(response: ResponseTimelineItem): string {
  if (response.latestClassification === "verified_deleted") return "Response claims deletion or removal";
  if (response.latestClassification === "updated") return "Response claims update";
  if (response.latestClassification === "remains") return "Response says item remains";
  if (response.latestClassification === "unable_to_verify") return "Response says unable to verify";
  if (response.latestClassification === "frivolous") return "Response asserts frivolous dispute";
  if (response.latestClassification === "duplicate") return "Response asserts duplicate dispute";
  if (response.latestClassification === "suspicious_non_compliant") return "Needs compliance review";
  return "Manual review needed";
}

function ResponseTimelinePanel({
  responses,
  isLoading,
  isError,
}: {
  responses: ResponseTimelineItem[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isError) {
    return (
      <section className={styles.responseTimelinePanel} aria-label="Response timeline">
        <div className={styles.responseTimelineHeader}>
          <AlertCircle size={18} />
          <div>
            <h2>Response Timeline</h2>
            <p>Unable to load recent response history.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.responseTimelinePanel} aria-label="Response timeline">
      <div className={styles.responseTimelineHeader}>
        <FileCheck size={18} />
        <div>
          <h2>Response Timeline</h2>
          <p>Recent bureau, creditor, and collector responses linked to your dispute work.</p>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className={styles.responseTimelineSkeleton} />
      ) : responses.length === 0 ? (
        <div className={styles.responseTimelineEmpty}>Recorded responses will appear here after they are captured.</div>
      ) : (
        <div className={styles.responseTimelineList}>
          {responses.map((response) => (
            <article key={response.id} className={response.latestRequiresManualReview ? styles.responseTimelineAlert : styles.responseTimelineItem}>
              <div className={styles.responseTimelineTop}>
                <strong>{responseOutcomeLabel(response)}</strong>
                <Badge variant={response.latestRequiresManualReview ? "warning" : "info"}>
                  {formatResponseEnum(response.latestExtractionSource)}
                </Badge>
              </div>
              <div className={styles.responseTimelineMeta}>
                <span>{formatDateTime(response.responseReceivedAt)}</span>
                <span>{formatResponseEnum(response.responseDocumentType)}</span>
                <span>{Math.round(Number(response.latestClassificationConfidence ?? 0) * 100)}% confidence</span>
                <span>Intake classification only</span>
                {response.packetId ? <span>Letter #{response.packetId}</span> : null}
              </div>
              <p>
                {response.latestRequiresManualReview
                  ? "This response is unresolved and will stay in review until a safe comparison or admin review supports the next step."
                  : "This response was classified deterministically. Packet readiness still waits for the normal evidence comparison path."}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function PacketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isFetching, error } = usePacketList();
  const { mutateAsync: deletePacketMutation } = useDeletePacket();
  const { mutate: updateStatus } = useUpdatePacketStatus();
  
  const [viewingPacketId, setViewingPacketId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deliveryWizardPacketId, setDeliveryWizardPacketId] = useState<number | null>(null);
  const [deliveryWizardBureauName, setDeliveryWizardBureauName] = useState<string>("the credit bureau");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [initialIssueId, setInitialIssueId] = useState<number | null>(null);
  
  const { showSuccess, showError } = useToast();
  const { isAdmin } = useAuth();
  const responseTimelineQuery = useResponseDocuments({ limit: 5 });
  const responseTimelineResponses = responseTimelineQuery.data?.responses ?? [];

  React.useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    let shouldReplaceParams = false;

    if (searchParams.get("create") === "true") {
      setIsCreateDialogOpen(true);
      setInitialIssueId(parseInitialPacketIssueId(searchParams));
      nextParams.delete("create");
      nextParams.delete("issueId");
      shouldReplaceParams = true;
    }

    const packetIdParam = searchParams.get("id");
    if (packetIdParam !== null) {
      const parsedPacketId = Number(packetIdParam);
      if (Number.isFinite(parsedPacketId) && parsedPacketId > 0) {
        setViewingPacketId(parsedPacketId);
      }
      nextParams.delete("id");
      shouldReplaceParams = true;
    }

    if (shouldReplaceParams) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (error) {
    return <div className={styles.error}>Error loading packets. Please try again.</div>;
  }

  const allIds = data?.packets.map((p) => p.id) || [];

  const getStatusVariant = (status: string | null) => {
    const s = status?.toLowerCase() || "";
    if (s === "sent" || s === "completed") return "success";
    if (s === "ready") return "info";
    if (s === "ready to mail") return "warning";
    if (s === "draft") return "default";
    return "default";
  };

  const getExportData = () => {
    return data?.packets.map(p => ({
      ...p,
      formattedDate: formatDateTime(p.createdAt),
      formattedStatus: p.status || "Pending",
      formattedLabel: p.terminalLabel || "—",
    })) || [];
  };

  const handleCSVExport = () => {
    try {
      const exportData = getExportData().map(p => ({
        "Packet ID": p.id,
        "Account Number": p.tradelineAccountNumber || "N/A",
        "Status": p.formattedStatus,
        "Terminal Label": p.formattedLabel,
        "Created Date": p.formattedDate,
      }));
      
      exportToCSV(exportData, `packets_export_${new Date().toISOString().split('T')[0]}`);
      showSuccess("Packets exported successfully");
    } catch (e) {
      console.error(e);
      showError("Failed to export packets");
    }
  };

  const handlePDFExport = async () => {
    setIsExporting(true);
    try {
      const exportData = getExportData();
      const pdfBase64 = await generateReportPDF({
        title: "Packets Summary Report",
        data: exportData,
        columns: [
          { header: "ID", dataKey: "id", width: "auto" },
          { header: "Account", dataKey: "tradelineAccountNumber", width: "*" },
          { header: "Status", dataKey: "formattedStatus", width: "auto" },
          { header: "Terminal Label", dataKey: "formattedLabel", width: "*" },
          { header: "Created", dataKey: "formattedDate", width: "auto" },
        ],
        metadata: {
          "Generated Date": formatDate(new Date()),
          "Total Packets": String(exportData.length),
        }
      });

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `packets_report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      
      showSuccess("Packets report generated successfully");
    } catch (e) {
      console.error(e);
      showError("Failed to generate PDF report");
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkDelete = async (ids: number[]) => {
    try {
      await Promise.all(ids.map((id) => deletePacketMutation({ id })));
      showSuccess(`${ids.length} packets deleted successfully`);
    } catch (error) {
      showError("Failed to delete some packets");
      throw error; // Re-throw to let toolbar know it failed
    }
  };

  const handleCreateDialogOpenChange = (open: boolean) => {
    setIsCreateDialogOpen(open);
    if (!open) {
      setInitialIssueId(null);
    }
  };

  const hasReadyToMail = data?.packets.some((p) => p.status?.toLowerCase() === "ready to mail");
  const hasSent = data?.packets.some((p) => ["sent", "completed"].includes(p.status?.toLowerCase() || ""));
  const hasDrafts = data?.packets.some((p) => p.status?.toLowerCase() === "draft");

  const handleBulkExport = async (ids: number[], format: "csv" | "pdf") => {
    const selectedData = getExportData().filter(p => ids.includes(p.id));
    
    if (selectedData.length === 0) {
      showError("No valid packets selected for export");
      return;
    }

    if (format === "csv") {
      const exportData = selectedData.map(p => ({
        "Packet ID": p.id,
        "Account Number": p.tradelineAccountNumber || "N/A",
        "Status": p.formattedStatus,
        "Terminal Label": p.formattedLabel,
        "Created Date": p.formattedDate,
      }));
      exportToCSV(exportData, `packets_bulk_export_${new Date().toISOString().split('T')[0]}`);
      showSuccess(`Exported ${ids.length} packets to CSV`);
    } else {
      const pdfBase64 = await generateReportPDF({
        title: "Selected Packets Report",
        data: selectedData,
        columns: [
          { header: "ID", dataKey: "id", width: "auto" },
          { header: "Account", dataKey: "tradelineAccountNumber", width: "*" },
          { header: "Status", dataKey: "formattedStatus", width: "auto" },
          { header: "Terminal Label", dataKey: "formattedLabel", width: "*" },
          { header: "Created", dataKey: "formattedDate", width: "auto" },
        ],
        metadata: {
          "Generated Date": formatDate(new Date()),
          "Selected Packets": String(selectedData.length),
        }
      });

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `packets_bulk_report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      showSuccess(`Exported ${ids.length} packets to PDF`);
    }
  };

  return (
    <>
      <Helmet>
        <title>Your Dispute Letters | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Your Dispute Letters"
        subtitle={
          <span className={styles.headerSubtitleWithTooltip}>
            See all the letters you're sending to credit reporting companies.
            <HelpTooltip content="A dispute letter is what you send to a credit reporting company to fix something wrong on your report." />
          </span>
        }
      >
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setInitialIssueId(null);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus size={16} />
            Create Packet
          </Button>
          {isAdmin && (
            <ExportDropdown 
              onExportCSV={handleCSVExport} 
              onExportPDF={handlePDFExport}
              isExporting={isExporting}
              label="Export All"
            />
          )}
        </div>
      </PageHeader>

      <div className={styles.packetOpsBanner}>
        <AlertCircle size={18} />
        <div>
          {isAdmin ? (
            <>
              <strong>Packet readiness and PDF rendering follow limited beta constraints.</strong>
              <span>
                {FRONTEND_LIMITED_BETA_READINESS.notReady} Letter creation stays gated by verified source-report evidence and readiness review rules.
              </span>
              <span>
                Packet PDFs may render on first open/download and reuse cached output when packet content is unchanged; render/download failures remain visible here and in operator dashboard metrics.
              </span>
            </>
          ) : (
            <>
              <strong>Your letters are ready to review under limited beta safeguards.</strong>
              <span>
                Letters can be created only for problems with verified source-report evidence.
              </span>
              <span>
                Open a letter to review it, then download, print, or send it when you are satisfied with the contents.
              </span>
            </>
          )}
        </div>
      </div>

            {!isAdmin && hasReadyToMail && (
        <div className={styles.nextStepBanner}>
          <div className={styles.nextStepText}>
            <div><strong>Letters ready? Your next step is to mail them.</strong></div>
            <div className={styles.nextStepSubtext}>You can mail them yourself or have us send them for you.</div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const readyPacket = data?.packets.find(
                (p) => p.status?.toLowerCase() === "ready to mail"
              );
              if (readyPacket) {
                setDeliveryWizardPacketId(readyPacket.id);
                setDeliveryWizardBureauName(
                  readyPacket.recipientName || 
                  readyPacket.bureauName || 
                  "the credit bureau"
                );
              }
            }}
          >
            <Mail size={16} /> Send Now
          </Button>
        </div>
      )}

      {!isAdmin && !hasReadyToMail && hasSent && (
        <div className={styles.nextStepBanner}>
          <div className={styles.nextStepText}>
            Letters sent! Now wait for a response and record it when it arrives.
          </div>
          <Button asChild size="sm">
            <Link to="/evidence">Record a Response →</Link>
          </Button>
        </div>
      )}

      {!isAdmin && !hasReadyToMail && !hasSent && hasDrafts && (
        <div className={styles.nextStepBanner}>
          <div className={styles.nextStepText}>
            You have letters ready to review. Open one, check it over, and mark it ready to mail.
          </div>
        </div>
      )}

      {!isAdmin && responseTimelineResponses.length > 0 && (
        <ResponseTimelinePanel
          responses={responseTimelineResponses}
          isLoading={responseTimelineQuery.isLoading}
          isError={responseTimelineQuery.isError}
        />
      )}

      {isAdmin && data?.packets && data.packets.length > 0 && (
        <div className={styles.listHeader}>
          <div className={styles.selectAllWrapper}>
            <BulkSelectAllCheckbox 
              selectedIds={selectedIds}
              allIds={allIds}
              onSelectionChange={setSelectedIds}
            />
            <span className={styles.selectAllLabel}>Select All</span>
          </div>
        </div>
      )}

      <div className={styles.cardList}>
        {isFetching ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.updateCard}>
              <div className={styles.cardTopRow}>
                <div className={styles.cardTopLeft}>
                  <Skeleton className={styles.checkboxSkeleton} />
                  <Skeleton className={styles.skeletonCell} style={{ width: "80px" }} />
                </div>
                <div className={styles.cardTopRight}>
                  <Skeleton className={styles.skeletonCell} style={{ width: "100px" }} />
                </div>
              </div>
              <div className={styles.cardBottomRow}>
                <div className={styles.detailsCell}>
                  <Skeleton className={styles.iconWrapper} />
                  <div className={styles.detailsInfo}>
                    <Skeleton className={styles.skeletonCell} style={{ width: "150px" }} />
                    <Skeleton className={styles.skeletonCell} style={{ width: "60px", marginTop: "4px" }} />
                  </div>
                </div>
                <div className={styles.actionsCell}>
                  <Skeleton className={styles.skeletonIcon} />
                  <Skeleton className={styles.skeletonIcon} />
                </div>
              </div>
            </div>
          ))
        ) : data?.packets && data.packets.length > 0 ? (
          data.packets.map((packet) => (
            <div key={packet.id} className={`${styles.updateCard} ${selectedIds.has(packet.id) ? styles.selectedCard : ""}`}>
              <div className={styles.cardTopRow}>
                <div className={styles.cardTopLeft}>
                  {isAdmin && (
                    <BulkRowCheckbox 
                      id={packet.id}
                      selectedIds={selectedIds}
                      onSelectionChange={setSelectedIds}
                    />
                  )}
                  <Badge variant={getStatusVariant(packet.status)} className={styles.statusBadge}>
                    {packet.status || "Pending"}
                  </Badge>
                  {isAdmin && <PacketComplianceBadge packetId={packet.id} />}
                  {isAdmin && (
                    packet.terminalLabel ? (
                      <div className={styles.terminalLabelContainer}>
                        <AlertCircle size={12} className={styles.alertIcon} />
                        <span className={styles.terminalLabel}>{packet.terminalLabel}</span>
                      </div>
                    ) : (
                      <span className={styles.mutedText}>—</span>
                    )
                  )}
                </div>
                <div className={styles.cardTopRight}>
                  <div 
                    className={styles.dateCell} 
                    title={formatDateTime(packet.createdAt)}
                  >
                    <Calendar size={14} className={styles.cellIcon} />
                    {formatRelativeTime(packet.createdAt)}
                  </div>
                </div>
              </div>
              <div className={styles.cardBottomRow}>
                <div className={styles.detailsCell}>
                  <div className={styles.iconWrapper}>
                    <FileStack size={16} />
                  </div>
                  <div className={styles.detailsInfo}>
                    {packet.tradelineCreditorName ? (
                      <>
                        <span className={styles.creditorName}>{packet.tradelineCreditorName}</span>
                        <span className={styles.tradelineAccount}>
                          <span className={styles.label}>Account:</span> {packet.tradelineAccountNumber || "N/A"}
                        </span>
                      </>
                    ) : (
                      <span className={styles.tradelineAccount}>
                        <span className={styles.label}>Account:</span> {packet.tradelineAccountNumber || "N/A"}
                      </span>
                    )}
                    {packet.recipientName && (
                      <span className={styles.recipientLine}>
                        <Mail size={12} className={styles.recipientIcon} />
                        To: {packet.recipientName}
                      </span>
                    )}
                    {packet.lifecycle && (
                      <span className={styles.lifecycleLine}>
                        <FileCheck size={12} className={styles.lifecycleIcon} />
                        {packet.lifecycle.label}
                        {packet.lifecycle.responseDueDate ? `: ${packet.lifecycle.responseDueDate}` : ""}
                      </span>
                    )}
                    {isAdmin && <span className={styles.packetId}>ID: #{packet.id}</span>}
                  </div>
                </div>
                <div className={styles.actionsCell}>
                  {packet.status?.toLowerCase() === "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={styles.mailBtn}
                      onClick={() => updateStatus({ packetId: packet.id, status: "Ready to Mail" }, {
                        onSuccess: () => showSuccess("Letter marked as ready to mail")
                      })}
                      title="Mark Ready to Mail"
                    >
                      <FileCheck size={16} /> Mark Ready
                    </Button>
                  )}
                  {packet.status?.toLowerCase() === "ready to mail" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={styles.mailBtn}
                      onClick={() => {
                        setDeliveryWizardPacketId(packet.id);
                        setDeliveryWizardBureauName(
                          packet.recipientName || 
                          packet.bureauName || 
                          "the credit bureau"
                        );
                      }}
                      title="Record Mailing"
                    >
                      <Mail size={16} /> Record Mailing
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    className={styles.viewBtn}
                    onClick={() => setViewingPacketId(packet.id)}
                    title="View Letter"
                  >
                    <Eye size={16} />
                  </Button>
                  <DeletePacketButton id={packet.id} />
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <ScrollText size={40} />
            <h3>No Letters Yet</h3>
            <p>Packet generation is active for findings with verified source-report evidence.</p>
          </div>
        )}
      </div>

      {isAdmin && (
        <BulkActionsToolbar
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          allIds={allIds}
          entityName="packets"
          onBulkDelete={handleBulkDelete}
          onBulkExport={handleBulkExport}
        />
      )}

      <Suspense fallback={<Skeleton style={{ height: "400px", width: "100%" }} />}>
        <PacketViewer 
          packetId={viewingPacketId} 
          open={viewingPacketId !== null} 
          onOpenChange={(open) => {
            if (!open) {
              setViewingPacketId(null);
            }
          }}
          onDeleted={() => {
            setViewingPacketId(null);
          }}
        />
      </Suspense>
      <CreatePacketDialog
        open={isCreateDialogOpen}
        onOpenChange={handleCreateDialogOpenChange}
        onCreated={(packetId) => setViewingPacketId(packetId)}
        initialIssueId={initialIssueId}
      />
      {deliveryWizardPacketId !== null && (() => {
        const activePacket = data?.packets.find(p => p.id === deliveryWizardPacketId);
        return (
          <DeliveryWizard
            packetId={deliveryWizardPacketId}
            bureauName={deliveryWizardBureauName}
            
            open={deliveryWizardPacketId !== null}
            onOpenChange={(open) => {
              if (!open) setDeliveryWizardPacketId(null);
            }}
            initialStep="choose"
          />
        );
      })()}
    </>
  );
}

function CreatePacketDialog({
  open,
  onOpenChange,
  onCreated,
  initialIssueId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (packetId: number) => void;
  initialIssueId?: number | null;
}) {
  const [packetType, setPacketType] = useState<DisputePacketType>("credit_bureau");
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<number>>(new Set());
  const [initialIssueReadinessMessage, setInitialIssueReadinessMessage] = useState(false);
  const [handledInitialIssueKey, setHandledInitialIssueKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<SimpleDisputePacketContent | null>(null);
  const [recipient, setRecipient] = useState({
    name: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    province: "",
    postalCode: "",
  });

  const recommendations = usePacketRecommendations(packetType);
  const buildPreview = useBuildPacketPreview();
  const createPacket = useCreatePacket();
  const { showSuccess, showError } = useToast();
  const candidates = recommendations.data?.recommendations ?? [];
  const isOriginatingIssueMode = initialIssueId !== null;
  const originatingCandidate = isOriginatingIssueMode
    ? candidates.find((candidate) => candidate.issueId === initialIssueId) ?? null
    : null;
  const initialIssueKey = initialIssueId ? `${packetType}:${initialIssueId}` : null;

  React.useEffect(() => {
    setSelectedIssueIds(new Set());
    setInitialIssueReadinessMessage(false);
    setHandledInitialIssueKey(null);
    setPreview(null);
    setRecipient({
      name: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      province: "",
      postalCode: "",
    });
  }, [packetType, open]);

  React.useEffect(() => {
    if (!open || !initialIssueId || !initialIssueKey || recommendations.isFetching) return;
    if (handledInitialIssueKey === initialIssueKey) return;

    const matchingCandidate = candidates.find((candidate) => candidate.issueId === initialIssueId);
    setPreview(null);
    if (matchingCandidate) {
      setSelectedIssueIds(new Set([matchingCandidate.issueId]));
      setInitialIssueReadinessMessage(false);
    } else {
      setInitialIssueReadinessMessage(true);
    }
    setHandledInitialIssueKey(initialIssueKey);
  }, [
    candidates,
    handledInitialIssueKey,
    initialIssueId,
    initialIssueKey,
    open,
    recommendations.isFetching,
  ]);

  const toggleSelection = (candidate: DisputePacketCandidate) => {
    if (isOriginatingIssueMode) return;
    setPreview(null);
    setSelectedIssueIds((current) => {
      const next = new Set(current);
      if (next.has(candidate.issueId)) {
        next.delete(candidate.issueId);
      } else {
        next.add(candidate.issueId);
      }
      return next;
    });
  };

  const normalizedRecipient = () => {
    const cleaned = Object.fromEntries(
      Object.entries(recipient)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value)
    );
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  };

  const originatingReadinessInput = React.useMemo(() => ({
    packetType,
    selectedIssueIds: initialIssueId ? [initialIssueId] : [],
    recipient: normalizedRecipient(),
  }), [
    initialIssueId,
    packetType,
    recipient.addressLine1,
    recipient.addressLine2,
    recipient.city,
    recipient.name,
    recipient.postalCode,
    recipient.province,
  ]);
  const originatingReadiness = usePacketReadiness(originatingReadinessInput, {
    enabled: open && initialIssueReadinessMessage && !!initialIssueId,
  });
  const originatingReviewSteps = React.useMemo(
    () => packetReviewStepsForReadiness(originatingReadiness.data),
    [originatingReadiness.data],
  );

  const buildInput = () => ({
    packetType,
    selectedIssueIds: isOriginatingIssueMode && originatingCandidate
      ? [originatingCandidate.issueId]
      : Array.from(selectedIssueIds),
    recipient: normalizedRecipient(),
  });

  const handlePreview = async () => {
    try {
      const result = await buildPreview.mutateAsync(buildInput());
      setPreview(result.packet);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not build packet preview");
    }
  };

  const handleCreate = async () => {
    try {
      const result = await createPacket.mutateAsync(buildInput());
      showSuccess("Packet generated");
      onCreated(result.packetId);
      onOpenChange(false);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not generate packet");
    }
  };

  const packetActionPending = buildPreview.isPending || createPacket.isPending;
  const canPreview = selectedIssueIds.size > 0 && !packetActionPending;
  const canCreate = selectedIssueIds.size > 0 && !packetActionPending;
  const previewDisplay = React.useMemo(
    () => preview ? buildPacketPreviewDisplayContent(preview) : null,
    [preview],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.createDialog}>
        <DialogHeader>
          <DialogTitle>{isOriginatingIssueMode ? "Create Letter for Selected Problem" : "Create Dispute Packet"}</DialogTitle>
          <DialogDescription>
            {isOriginatingIssueMode
              ? "Create one letter for this problem only, preview it if needed, then generate the PDF."
              : "Select report problems that are ready for a letter, preview the plain-language packet if needed, then generate the PDF."}
          </DialogDescription>
        </DialogHeader>

        <div className={styles.packetTypeTabs}>
          <button
            type="button"
            className={packetType === "credit_bureau" ? styles.packetTypeTabActive : styles.packetTypeTab}
            onClick={() => setPacketType("credit_bureau")}
          >
            Credit Bureau
          </button>
          <button
            type="button"
            className={packetType === "collection_agency" ? styles.packetTypeTabActive : styles.packetTypeTab}
            onClick={() => setPacketType("collection_agency")}
          >
            Collection Agency
          </button>
        </div>

        {packetType === "collection_agency" && (
          <div className={styles.recipientFields}>
            <div className={styles.fieldGrid}>
              <label>
                <span>Recipient name</span>
                <Input
                  value={recipient.name}
                  onChange={(event) => setRecipient((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Collection agency name"
                />
              </label>
              <label>
                <span>Address line 1</span>
                <Input
                  value={recipient.addressLine1}
                  onChange={(event) => setRecipient((current) => ({ ...current, addressLine1: event.target.value }))}
                  placeholder="Needed for mail service"
                />
              </label>
              <label>
                <span>Address line 2</span>
                <Input
                  value={recipient.addressLine2}
                  onChange={(event) => setRecipient((current) => ({ ...current, addressLine2: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
              <label>
                <span>City</span>
                <Input
                  value={recipient.city}
                  onChange={(event) => setRecipient((current) => ({ ...current, city: event.target.value }))}
                />
              </label>
              <label>
                <span>Province</span>
                <Input
                  value={recipient.province}
                  onChange={(event) => setRecipient((current) => ({ ...current, province: event.target.value }))}
                />
              </label>
              <label>
                <span>Postal code</span>
                <Input
                  value={recipient.postalCode}
                  onChange={(event) => setRecipient((current) => ({ ...current, postalCode: event.target.value }))}
                />
              </label>
            </div>
          </div>
        )}

        <div className={styles.builderColumns}>
          <div className={styles.candidatePane}>
            <div className={styles.builderSectionHeader}>
              <h3>{isOriginatingIssueMode ? "Selected Problem" : "Disputed Items"}</h3>
              <span>
                {isOriginatingIssueMode
                  ? originatingCandidate ? "1 letter" : "Needs review"
                  : `${selectedIssueIds.size} selected`}
              </span>
            </div>
            {initialIssueReadinessMessage && (
              <div className={styles.originatingFindingNotice}>
                <p>This problem needs review before a letter can be created.</p>
                {originatingReadiness.isFetching ? (
                  <p>Checking what needs review...</p>
                ) : originatingReadiness.error ? (
                  <p>Open the account details, confirm the source-report evidence, then try creating the letter again.</p>
                ) : (
                  <ul className={styles.originatingReviewList}>
                    {originatingReviewSteps.map((step) => (
                      <li key={`${step.needed}-${step.reviewer}`} className={styles.originatingReviewStep}>
                        <span><strong>What needs review:</strong> {step.needed}</span>
                        <span><strong>Who reviews it:</strong> {step.reviewer}</span>
                        <span><strong>How to complete it:</strong> {step.completion}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {recommendations.isFetching ? (
              <div className={styles.builderState}>Loading report issues...</div>
            ) : isOriginatingIssueMode ? (
              originatingCandidate ? (
                <div className={styles.selectedProblemCard}>
                  <span className={styles.candidateBody}>
                    <span className={styles.candidateTitle}>
                      {originatingCandidate.creditorCollectorName} - {originatingCandidate.maskedAccountNumber}
                    </span>
                    <span className={styles.candidateMeta}>
                      {[originatingCandidate.bureauName, originatingCandidate.issueType, originatingCandidate.needsManualReview ? "Needs manual review" : "Evidence linked"]
                        .filter(Boolean)
                        .join(" | ")}
                    </span>
                    {originatingCandidate.userEmail && (
                      <span className={styles.candidateMeta}>{originatingCandidate.userEmail}</span>
                    )}
                  </span>
                </div>
              ) : null
            ) : candidates.length === 0 ? (
              <div className={styles.builderState}>No problems are ready for this letter type yet. Try another letter type or review the account details for missing evidence.</div>
            ) : (
              <div className={styles.candidateList}>
                {candidates.map((candidate) => (
                  <label key={candidate.issueId} className={styles.candidateRow}>
                    <Checkbox
                      checked={selectedIssueIds.has(candidate.issueId)}
                      onChange={() => toggleSelection(candidate)}
                    />
                    <span className={styles.candidateBody}>
                      <span className={styles.candidateTitle}>
                        {candidate.creditorCollectorName} - {candidate.maskedAccountNumber}
                      </span>
                      <span className={styles.candidateMeta}>
                        {[candidate.bureauName, candidate.issueType, candidate.needsManualReview ? "Needs manual review" : "Evidence linked"]
                          .filter(Boolean)
                          .join(" | ")}
                      </span>
                      {candidate.userEmail && (
                        <span className={styles.candidateMeta}>{candidate.userEmail}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className={styles.previewPane}>
            <div className={styles.builderSectionHeader}>
              <h3>Preview</h3>
              <span>{packetType === "credit_bureau" ? "Bureau path" : "Collector path"}</span>
            </div>
            {!preview ? (
              <div className={styles.builderState}>
                {isOriginatingIssueMode
                  ? "Preview this letter, or generate the PDF directly for the selected problem."
                  : "Select one or more items to preview the letter, or generate the PDF directly from selected problems."}
              </div>
            ) : (
              previewDisplay ? (
                <PacketRecipientFacingPreview content={previewDisplay} />
              ) : (
                <div className={styles.builderState}>Unable to display the packet preview.</div>
              )
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={!canPreview}
          >
            {buildPreview.isPending ? "Building..." : "Preview Packet"}
          </Button>
          <Button onClick={handleCreate} disabled={!canCreate}>
            {createPacket.isPending ? "Generating..." : "Generate PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeletePacketButton({ id }: { id: number }) {
  const { mutate: deletePacket, isPending } = useDeletePacket();
  const [isOpen, setIsOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  const handleDelete = () => {
    deletePacket({ id }, {
      onSuccess: () => {
        showSuccess("Letter deleted");
        setIsOpen(false);
      },
      onError: () => {
        showError("Could not delete the letter");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className={styles.deleteBtn}>
          <Trash2 size={16} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete This Letter?</DialogTitle>
          <DialogDescription>
            Are you sure? Once you delete this letter, it's gone for good.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button variant="error" onClick={handleDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete Letter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
