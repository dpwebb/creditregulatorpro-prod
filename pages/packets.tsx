import React, { useState, Suspense } from "react";
import { Helmet } from "react-helmet";
import { usePacketList, useDeletePacket } from "../helpers/packetQueries";
import { useUpdatePacketStatus } from "../helpers/useUpdatePacketStatus";
import { Button } from "../components/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "../components/Dialog";
import { Skeleton } from "../components/Skeleton";
import { Badge } from "../components/Badge";
import { PageHeader } from "../components/PageHeader";

import { PacketComplianceBadge } from "../components/PacketComplianceBadge";
import { Plus, Trash2, ScrollText, Calendar, AlertCircle, FileStack, Eye, Mail, FileCheck } from "lucide-react";
import { CreatePacketDialog } from "../components/CreatePacketDialog";

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
import { Link, useSearchParams } from "react-router-dom";
import type { PreviewPacket } from "../endpoints/packet/create_POST.schema";
import styles from "./packets.module.css";

export default function PacketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isFetching, error } = usePacketList();
  const { mutateAsync: deletePacketMutation } = useDeletePacket();
  const { mutate: updateStatus } = useUpdatePacketStatus();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [viewingPacketId, setViewingPacketId] = useState<number | null>(null);
  const [previewPacketData, setPreviewPacketData] = useState<PreviewPacket | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deliveryWizardPacketId, setDeliveryWizardPacketId] = useState<number | null>(null);
  const [deliveryWizardBureauName, setDeliveryWizardBureauName] = useState<string>("the credit bureau");
  
  const { showSuccess, showError } = useToast();
  const { isAdmin } = useAuth();

  React.useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    let shouldReplaceParams = false;

    if (searchParams.get("create") === "true") {
      setIsCreateOpen(true);
      nextParams.delete("create");
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
          {isAdmin && (
            <ExportDropdown 
              onExportCSV={handleCSVExport} 
              onExportPDF={handlePDFExport}
              isExporting={isExporting}
              label="Export All"
            />
          )}
          <Button onClick={() => setIsCreateOpen(true)} className={styles.createButton}>
            <Plus size={16} /> Write a New Letter
          </Button>
        </div>
      </PageHeader>

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
            <p>Write your first dispute letter to get started.</p>
            <Button variant="default" size="sm" onClick={() => setIsCreateOpen(true)}>
              Write a New Letter
            </Button>
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

      <CreatePacketDialog 
        open={isCreateOpen} 
        onOpenChange={setIsCreateOpen} 
        onPacketCreated={(packetData) => {
          if (packetData?.id != null) {
            setViewingPacketId(packetData.id);
          } else {
            setPreviewPacketData(packetData);
          }
        }}
      />
      <Suspense fallback={<Skeleton style={{ height: "400px", width: "100%" }} />}>
        <PacketViewer 
          packetId={viewingPacketId} 
          previewData={previewPacketData}
          open={viewingPacketId !== null || previewPacketData !== null} 
          onOpenChange={(open) => {
            if (!open) {
              setViewingPacketId(null);
              setPreviewPacketData(null);
            }
          }}
          onSaved={(packetId) => {
            setPreviewPacketData(null);
            setViewingPacketId(packetId);
          }}
          onDeleted={() => {
            setViewingPacketId(null);
          }}
        />
      </Suspense>
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
