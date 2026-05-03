import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  Search, 
  Upload, 
  ArrowRight
} from "lucide-react";
import { format } from "../helpers/dateUtils";
import { toast } from "sonner";
import { Button } from "./Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "./Table";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { EvidenceUploadDialog } from "./EvidenceUploadDialog";
import { BulkActionsToolbar, BulkSelectAllCheckbox, BulkRowCheckbox } from "./BulkActionsToolbar";
import { ExportDropdown } from "./ExportDropdown";
import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { useDeleteObligationInstances } from "../helpers/obligationInstanceMutations";
import { useDebounce } from "../helpers/useDebounce";
import { exportToCSV } from "../helpers/csvExporter";
import { generateReportPDF } from "../helpers/reportGenerator";
import styles from "../pages/evidence-management.module.css";
// Reuse some styles from challenge-evidence.module.css inline via style prop or new classes if strict match needed, 
// but sticking to reusing evidence-management.module.css where possible or creating localized styles.
// Since we are moving this to a component, we will rely on standard classes and the passed styles.

export function EvidenceChallengesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExportingAll, setIsExportingAll] = useState(false);
  
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data, isLoading } = useObligationInstanceList({});
  const deleteMutation = useDeleteObligationInstances();

  const instances = useMemo(() => {
    return data?.instances.filter(instance => {
      if (!debouncedSearch) return true;
      return instance.accountNumber?.toLowerCase().includes(debouncedSearch.toLowerCase());
    }) || [];
  }, [data?.instances, debouncedSearch]);

  const allIds = useMemo(() => instances.map(i => i.id), [instances]);

  const prepareExportData = (idsToExport: number[]) => {
    const records = instances.filter(i => idsToExport.includes(i.id));
    return records.map(r => ({
      "ID": r.id,
      "Account Number": r.accountNumber,
      "Dispute Vector": r.disputeVector || "General",
      "Creditor": r.creditorName || "",
      "Bureau": r.bureauName || "",
      "Status": r.state?.replace(/_/g, " ") || "PENDING",
      "Created Date": r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd") : "",
      "Response Deadline": r.responseDeadline ? format(new Date(r.responseDeadline), "yyyy-MM-dd") : ""
    }));
  };

  const handleBulkExport = async (ids: number[], formatType: "csv" | "pdf") => {
    const exportData = prepareExportData(ids);
    const filename = `challenges-export-${format(new Date(), "yyyy-MM-dd")}`;

    if (formatType === "csv") {
      exportToCSV(exportData, filename);
    } else {
      const pdfBase64 = await generateReportPDF({
        title: "Challenge Evidence Report",
        subtitle: `Generated on ${format(new Date(), "PPP")}`,
        columns: [
          { header: "Account #", dataKey: "Account Number", width: "*" },
          { header: "Dispute Vector", dataKey: "Dispute Vector", width: "auto" },
          { header: "Creditor", dataKey: "Creditor", width: "*" },
          { header: "Status", dataKey: "Status", width: "auto" },
          { header: "Created", dataKey: "Created Date", width: "auto" }
        ],
        data: exportData,
        metadata: {
          "Total Items": exportData.length.toString(),
          "Search Term": searchTerm || "(None)"
        }
      });
      
      const link = document.createElement("a");
      link.href = pdfBase64;
      link.download = `${filename}.pdf`;
      link.click();
    }
  };

  const handleExportAll = async (formatType: "csv" | "pdf") => {
    try {
      setIsExportingAll(true);
      await handleBulkExport(allIds, formatType);
      toast.success(`Successfully exported ${allIds.length} challenges`);
    } catch (error) {
      console.error("Export failed", error);
      toast.error("Failed to export challenges");
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={16} />
          <input
            type="text"
            placeholder="Search by account number..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <ExportDropdown 
          label="Export All"
          isExporting={isExportingAll}
          onExportCSV={() => handleExportAll("csv")}
          onExportPDF={() => handleExportAll("pdf")}
        />
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: 40, paddingLeft: '1rem' }}>
                <BulkSelectAllCheckbox 
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  allIds={allIds}
                />
              </TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>Challenge Type</TableHead>
              <TableHead>Dispute Vector</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell style={{ width: 40, paddingLeft: '1rem' }}><Skeleton className="w-4 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-32 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-40 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-24 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-20 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-24 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-24 h-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : instances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className={styles.emptyState}>
                  No challenges found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              instances.map((instance) => (
                <TableRow key={instance.id}>
                  <TableCell style={{ width: 40, paddingLeft: '1rem' }}>
                    <BulkRowCheckbox 
                      id={instance.id}
                      selectedIds={selectedIds}
                      onSelectionChange={setSelectedIds}
                    />
                  </TableCell>
                  <TableCell>
                    <Link 
                      to={`/tradelines/${instance.tradelineId}`}
                      className={styles.accountLink}
                    >
                      {instance.accountNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-[2px]">
                      <span className="font-medium text-[var(--foreground)]">{instance.disputeVector || "General Challenge"}</span>
                      {instance.creditorName && (
                        <span className="text-xs text-[var(--muted-foreground)] truncate max-w-[300px]">
                          {instance.creditorName} {instance.bureauName ? `(${instance.bureauName})` : ""}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">{instance.disputeVector || "N/A"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        instance.state === "PROCEDURALLY_EXHAUSTED" ? "success" :
                        instance.state === "CHALLENGED" ? "warning" : "default"
                      }
                    >
                      {instance.state?.replace(/_/g, " ") || "PENDING"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {instance.createdAt ? format(new Date(instance.createdAt), "MMM d, yyyy") : "-"}
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions} style={{ justifyContent: 'flex-end' }}>
                      <Button 
                        variant="ghost" 
                        size="icon-sm" 
                        onClick={() => setUploadId(instance.id)}
                        title="Upload Evidence"
                      >
                        <Upload size={16} />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        asChild
                        className="gap-2"
                      >
                        <Link to={`/tradelines/${instance.tradelineId}`}>
                          View
                          <ArrowRight size={14} />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <BulkActionsToolbar
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        allIds={allIds}
        entityName="challenges"
        onBulkDelete={deleteMutation.mutateAsync}
        onBulkExport={handleBulkExport}
      />

      <EvidenceUploadDialog
        open={!!uploadId}
        onOpenChange={(open) => !open && setUploadId(null)}
        obligationInstanceId={uploadId || undefined}
      />
    </div>
  );
}