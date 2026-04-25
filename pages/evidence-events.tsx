import React, { useState } from "react";
import { Helmet } from "react-helmet";
import { useEvidenceList, useDeleteEvidenceEvent } from "../helpers/evidenceQueries";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";


import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { format } from "../helpers/dateUtils";
import { EvidenceEventsTable } from "../components/EvidenceEventsTable";
import { EvidenceEventCreateDialog } from "../components/EvidenceEventCreateDialog";
import { BureauCommunicationDialog } from "../components/BureauCommunicationDialog";
import { BulkActionsToolbar } from "../components/BulkActionsToolbar";
import { ExportDropdown } from "../components/ExportDropdown";
import { exportToCSV } from "../helpers/csvExporter";
import { generateReportPDF } from "../helpers/reportGenerator";
import styles from "./evidence-events.module.css";

export default function EvidenceEventsPage() {
  
  const { data, isFetching, error } = useEvidenceList();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBureauUploadOpen, setIsBureauUploadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  
  const { mutateAsync: deleteEvent } = useDeleteEvidenceEvent();

  if (error) {
    return <div className={styles.error}>Something went wrong loading your messages. Please try again.</div>;
  }

  const handleBulkDelete = async (ids: number[]) => {
    let successCount = 0;
    let failureCount = 0;

    // Execute deletes sequentially to avoid overwhelming server or race conditions if needed
    // Or we could use Promise.all for parallel execution
    await Promise.all(
      ids.map(async (id) => {
        try {
          await deleteEvent({ id });
          successCount++;
        } catch (e) {
          console.error(`Failed to delete event ${id}`, e);
          failureCount++;
        }
      })
    );

    if (successCount > 0) {
      toast.success(`Successfully deleted ${successCount} communications.`);
    }
    if (failureCount > 0) {
      toast.error(`Failed to delete ${failureCount} communications.`);
    }
    
    // Clear selection after action
    setSelectedIds(new Set());
  };

  const handleExport = async (ids: number[], formatType: "csv" | "pdf") => {
    const selectedEvents = data?.events.filter(e => ids.includes(e.id)) || [];
    if (selectedEvents.length === 0) return;

    if (formatType === "csv") {
      exportToCSV(
        selectedEvents.map(e => ({
          ...e,
          at: e.at ? format(new Date(e.at), "yyyy-MM-dd HH:mm:ss") : "",
        })),
        "communications_export",
        [
          { key: "id", label: "ID" },
          { key: "eventType", label: "Type" },
          { key: "description", label: "Description" },
          { key: "packetId", label: "Packet ID" },
          { key: "tradelineAccountNumber", label: "Account Number" },
          { key: "at", label: "Timestamp" },
          { key: "currentHash", label: "Hash" },
        ]
      );
    } else {
      const pdfBase64 = await generateReportPDF({
        title: "Communications Export",
        subtitle: `Exported ${selectedEvents.length} items on ${new Date().toLocaleDateString()}`,
        columns: [
          { header: "ID", dataKey: "id", width: "auto" },
          { header: "Type", dataKey: "eventType", width: "auto" },
          { header: "Description", dataKey: "description", width: "*" },
          { header: "Date", dataKey: "at", width: "auto" },
        ],
        data: selectedEvents.map(e => ({
          ...e,
          at: e.at ? format(new Date(e.at), "yyyy-MM-dd") : "",
        })),
      });
      
      // Trigger download
      const link = document.createElement("a");
      link.href = "data:application/pdf;base64," + pdfBase64;
      link.download = "communications_report.pdf";
      link.click();
    }
  };

  const handleExportAll = async (formatType: "csv" | "pdf") => {
    if (!data?.events || data.events.length === 0) {
      toast.error("No data to export");
      return;
    }
    
    setIsExporting(true);
    try {
      // Export all IDs
      const allIds = data.events.map(e => e.id);
      await handleExport(allIds, formatType);
      toast.success(`Exported all ${allIds.length} communications`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Timeline | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader 
        title="Timeline" 
        subtitle="See everything that's happened with your disputes, step by step."
        
      >
        <div className={styles.headerActions}>
          <ExportDropdown 
            isExporting={isExporting}
            onExportCSV={() => handleExportAll("csv")}
            onExportPDF={() => handleExportAll("pdf")}
          />
          <Button 
            variant="outline" 
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus size={16} /> Add a Message
          </Button>
          <Button 
            onClick={() => setIsBureauUploadOpen(true)} 
            className={styles.logResponseButton}
          >
            <Upload size={16} /> Record a Response
          </Button>
        </div>
      </PageHeader>

      <EvidenceEventsTable 
        data={data}
        isFetching={isFetching}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onCreateOpen={() => setIsCreateOpen(true)}
      />

      <BulkActionsToolbar
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        allIds={data?.events.map(e => e.id) || []}
        entityName="communications"
        onBulkDelete={handleBulkDelete}
        onBulkExport={handleExport}
      />

      <EvidenceEventCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      
      <BureauCommunicationDialog 
        open={isBureauUploadOpen} 
        onOpenChange={setIsBureauUploadOpen} 
      />
    </>
  );
}