import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  FileText, 
  Download, 
  Search, 
  FileBox,
  Loader2
} from "lucide-react";
import { Button } from "./Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "./Table";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "./Tooltip";
import { HelpTooltip } from "./HelpTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select";
import { ExportDropdown } from "./ExportDropdown";
import { useAttachmentList, useGeneratePackageMutation } from "../helpers/attachmentQueries";
import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { useDebounce } from "../helpers/useDebounce";
import { useToast } from "../helpers/useToast";
import { exportToCSV } from "../helpers/csvExporter";
import { generateReportPDF } from "../helpers/reportGenerator";
import { formatRelativeTime, formatDateTime, formatDate } from "../helpers/formatters";
import { ObligationInstanceListItem } from "../endpoints/obligation-instance/list_GET.schema";
import styles from "../pages/evidence-management.module.css"; // Reusing page styles for consistency

export function EvidenceFilesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "linked" | "unlinked">("all");
  const debouncedSearch = useDebounce(searchTerm, 300);
  
  const { data: attachments, isLoading } = useAttachmentList({});
  const { data: challengesData } = useObligationInstanceList({});
  
  const { showSuccess, showError } = useToast();
  const generatePackageMutation = useGeneratePackageMutation();
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Create a map for fast challenge lookup
  const challengesMap = useMemo(() => {
    const map = new Map<number, ObligationInstanceListItem>();
    if (challengesData?.instances) {
      challengesData.instances.forEach((instance) => {
        map.set(instance.id, instance);
      });
    }
    return map;
  }, [challengesData]);

  const filteredAttachments = useMemo(() => {
    return attachments?.filter(att => {
      const matchesSearch = 
        att.fileName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        att.description?.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      if (!matchesSearch) return false;

      if (filterType === "linked") {
        return !!att.obligationInstanceId;
      }
      if (filterType === "unlinked") {
        return !att.obligationInstanceId && !att.packetId;
      }
      
      return true;
    });
  }, [attachments, debouncedSearch, filterType]);

  const handleGeneratePackage = (obligationInstanceId: number) => {
    setGeneratingId(obligationInstanceId);
    generatePackageMutation.mutate(
      { obligationInstanceId },
      {
        onSuccess: () => {
          showSuccess("Evidence package generated successfully");
        },
        onError: () => {
          showError("Failed to generate evidence package");
        },
        onSettled: () => setGeneratingId(null),
      }
    );
  };

  const getExportData = () => {
    return filteredAttachments?.map(att => {
      const challenge = att.obligationInstanceId ? challengesMap.get(att.obligationInstanceId) : null;
      let context = "Unlinked";
      if (challenge) context = `Challenge #${att.obligationInstanceId} (${challenge.disputeVector || "General"})`;
      else if (att.packetId) context = `Packet #${att.packetId}`;

      return {
        fileName: att.fileName,
        type: att.fileType.split('/')[1]?.toUpperCase() || 'FILE',
        size: `${(att.fileSizeBytes / 1024).toFixed(1)} KB`,
        context,
        uploadedAt: att.uploadedAt,
        formattedDate: formatDateTime(att.uploadedAt),
      };
    }) || [];
  };

  const handleCSVExport = () => {
    try {
      const data = getExportData().map(d => ({
        "File Name": d.fileName,
        "Type": d.type,
        "Size": d.size,
        "Context": d.context,
        "Upload Date": d.formattedDate
      }));
      exportToCSV(data, `evidence_inventory_${new Date().toISOString().split('T')[0]}`);
      showSuccess("Evidence inventory exported as CSV");
    } catch (e) {
      console.error(e);
      showError("Failed to export evidence inventory");
    }
  };

  const handlePDFExport = async () => {
    setIsExporting(true);
    try {
      const data = getExportData();
      const pdfBase64 = await generateReportPDF({
        title: "Evidence Inventory Report",
        data,
        columns: [
          { header: "File Name", dataKey: "fileName", width: "*" },
          { header: "Type", dataKey: "type", width: "auto" },
          { header: "Size", dataKey: "size", width: "auto" },
          { header: "Context", dataKey: "context", width: "*" },
          { header: "Uploaded", dataKey: "formattedDate", width: "auto" },
        ],
        metadata: {
          "Generated Date": formatDate(new Date()),
          "Total Files": String(data.length),
          "Filter Applied": filterType !== "all" ? filterType : "None",
        }
      });

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${pdfBase64}`;
      link.download = `evidence_report_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      
      showSuccess("Evidence report generated successfully");
    } catch (e) {
      console.error(e);
      showError("Failed to generate PDF report");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search className={styles.searchIcon} size={16} />
          <input
            type="text"
            placeholder="Search files..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="w-[200px]">
          <Select 
            value={filterType} 
            onValueChange={(val: any) => setFilterType(val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Filter by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Evidence</SelectItem>
              <SelectItem value="linked">Linked to Challenge</SelectItem>
              <SelectItem value="unlinked">Unlinked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ExportDropdown 
          onExportCSV={handleCSVExport}
          onExportPDF={handlePDFExport}
          isExporting={isExporting}
        />
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>Context / Challenge</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Type
                  <HelpTooltip 
                    title="Event Types"
                    content="Files are categorized by their source event (e.g. SENT disputes, RECEIVED responses) to maintain a clear audit trail."
                    size={14}
                  />
                </div>
              </TableHead>
              <TableHead>Size</TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Uploaded
                  <HelpTooltip 
                    title="Retention Policy (CA)"
                    content="In compliance with Canadian data sovereignty laws, all evidence is stored in Montreal (ca-central-1) and retained for 1 year from the date of upload."
                    size={14}
                  />
                </div>
              </TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="w-48 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-32 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-16 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-16 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-24 h-4" /></TableCell>
                  <TableCell><Skeleton className="w-24 h-8" /></TableCell>
                </TableRow>
              ))
            ) : filteredAttachments?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className={styles.emptyState}>
                  <div className={styles.emptyContent}>
                    <FileBox size={48} className={styles.emptyIcon} />
                    <p>No evidence documents found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAttachments?.map((att) => {
                const challenge = att.obligationInstanceId 
                  ? challengesMap.get(att.obligationInstanceId) 
                  : null;

                return (
                  <TableRow key={att.id}>
                    <TableCell>
                      <div className={styles.fileNameCell}>
                        <FileText size={16} className={styles.fileIcon} />
                        <div className={styles.fileInfo}>
                          <span className={styles.fileName}>{att.fileName}</span>
                          {att.description && (
                            <span className={styles.fileDesc}>{att.description}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {challenge ? (
                        <div className={styles.contextCell}>
                          <div className="flex items-center gap-2">
                            <Link 
                              to={`/tradelines/${challenge.tradelineId}`}
                              className={styles.accountLink}
                            >
                              {challenge.accountNumber || `Challenge #${att.obligationInstanceId}`}
                            </Link>
                          </div>
                          <Badge variant="info" className="mt-1">
                            {challenge.disputeVector || "General Challenge"}
                          </Badge>
                        </div>
                      ) : att.packetId ? (
                        <Badge variant="primary">Packet #{att.packetId}</Badge>
                      ) : (
                        <Badge variant="default">Unlinked</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className={styles.typeBadge}>
                        {att.fileType.split('/')[1]?.toUpperCase() || 'FILE'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(att.fileSizeBytes / 1024).toFixed(1)} KB
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">
                            {formatRelativeTime(att.uploadedAt)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDateTime(att.uploadedAt)}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className={styles.actions}>
                        {att.obligationInstanceId && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="icon-sm"
                                onClick={() => handleGeneratePackage(att.obligationInstanceId!)}
                                disabled={generatePackageMutation.isPending}
                                className={styles.generateBtn}
                              >
                                {generatingId === att.obligationInstanceId ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Download size={16} />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Generate evidence PDF
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
