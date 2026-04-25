import React, { useState } from "react";
import { format } from "../helpers/dateUtils";
import { 
  Search, 
  Calendar, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Copy, 
  Eye, 
  ExternalLink,
  Hash
} from "lucide-react";
import { useComplianceAudit } from "../helpers/complianceAuditQueries";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter,
  DialogTrigger 
} from "./Dialog";
import { toast } from "sonner";
import styles from "./ComplianceAuditViewer.module.css";

const PAGE_SIZE = 50;

export const ComplianceAuditViewer = () => {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({
    packetId: "",
    startDate: "",
    endDate: "",
  });
  const [selectedAudit, setSelectedAudit] = useState<any>(null);

  // Construct query params
  const queryParams = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(filters.packetId ? { packetId: parseInt(filters.packetId) } : {}),
    ...(filters.startDate ? { startDate: new Date(filters.startDate) } : {}),
    ...(filters.endDate ? { endDate: new Date(filters.endDate) } : {}),
  };

  const { data, isLoading, isFetching } = useComplianceAudit(queryParams);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0); // Reset to first page
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const getStatusVariant = (status: string) => {
    switch (status?.toUpperCase()) {
      case "COMPLIANT":
      case "SUCCESS":
      case "PASSED":
        return "success";
      case "NON_COMPLIANT":
      case "FAILURE":
      case "FAILED":
        return "error";
      case "WARNING":
        return "warning";
      default:
        return "default";
    }
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.label}>Packet ID</label>
          <div className={styles.inputWrapper}>
            <Search className={styles.inputIcon} size={16} />
            <input
              type="number"
              className={styles.input}
              placeholder="Filter by Packet ID..."
              value={filters.packetId}
              onChange={(e) => handleFilterChange("packetId", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>Start Date</label>
          <div className={styles.inputWrapper}>
            <Calendar className={styles.inputIcon} size={16} />
            <input
              type="date"
              className={styles.input}
              value={filters.startDate}
              onChange={(e) => handleFilterChange("startDate", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.label}>End Date</label>
          <div className={styles.inputWrapper}>
            <Calendar className={styles.inputIcon} size={16} />
            <input
              type="date"
              className={styles.input}
              value={filters.endDate}
              onChange={(e) => handleFilterChange("endDate", e.target.value)}
            />
          </div>
        </div>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applied At</TableHead>
              <TableHead>Packet</TableHead>
              <TableHead>Tradeline</TableHead>
              <TableHead>Regulation</TableHead>
              <TableHead>Obligation</TableHead>
              <TableHead>Statute</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Evidence Hash</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="w-32" /></TableCell>
                  <TableCell><Skeleton className="w-16" /></TableCell>
                  <TableCell><Skeleton className="w-32" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-48" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-20" /></TableCell>
                  <TableCell><Skeleton className="w-24" /></TableCell>
                  <TableCell><Skeleton className="w-8" /></TableCell>
                </TableRow>
              ))
            ) : data?.audits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} style={{ textAlign: "center", padding: "3rem" }}>
                  <div className={styles.emptyState}>
                    <FileText size={32} className="text-muted-foreground mb-2" />
                    <p>No compliance audits found matching your criteria.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.audits.map((audit) => (
                <TableRow key={audit.id}>
                  <TableCell className={styles.dateCell}>
                    {audit.appliedAt ? format(new Date(audit.appliedAt), "yyyy-MM-dd HH:mm:ss") : "-"}
                  </TableCell>
                  <TableCell>
                    <span className={styles.packetId}>#{audit.packetId}</span>
                  </TableCell>
                  <TableCell className={styles.mono}>
                    {audit.tradelineAccountNumber || "-"}
                  </TableCell>
                  <TableCell>
                                        <Badge variant="default" className={styles.regulationBadge}>
                      {audit.regulationType || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div 
                      className={styles.truncatedText} 
                      title={audit.obligationDescription || ""}
                    >
                      {audit.obligationDescription || "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={styles.statuteRef}>
                      {audit.statuteCode}
                      {audit.statuteVersion && (
                        <span className={styles.version}>v{audit.statuteVersion}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(audit.complianceStatus)}>
                      {audit.complianceStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {audit.evidenceCurrentHash ? (
                      <div className={styles.hashContainer}>
                        <span className={styles.hash}>
                          {audit.evidenceCurrentHash.substring(0, 8)}...
                        </span>
                        <button 
                          className={styles.copyButton}
                          onClick={() => copyToClipboard(audit.evidenceCurrentHash!)}
                          title="Copy full hash"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSelectedAudit(audit)}
                    >
                      <Eye size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <div className={styles.pagination}>
        <div className={styles.pageInfo}>
          Showing {page * PAGE_SIZE + 1} to{" "}
          {Math.min((page + 1) * PAGE_SIZE, data?.total || 0)} of {data?.total || 0} entries
          {isFetching && <span className={styles.refreshing}> (Refreshing...)</span>}
        </div>
        <div className={styles.paginationButtons}>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || isLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || (page + 1) * PAGE_SIZE >= data.total || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={!!selectedAudit} onOpenChange={(open) => !open && setSelectedAudit(null)}>
        <DialogContent className={styles.dialogContent}>
          <DialogHeader>
            <DialogTitle>Compliance Audit Details</DialogTitle>
            <DialogDescription>
              Detailed record of the compliance check applied to Packet #{selectedAudit?.packetId}
            </DialogDescription>
          </DialogHeader>
          
          {selectedAudit && (
            <div className={styles.detailsGrid}>
              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Obligation Context</h4>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Description:</span>
                  <p className={styles.detailValue}>{selectedAudit.obligationDescription}</p>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Jurisdiction:</span>
                  <span className={styles.detailValue}>{selectedAudit.obligationJurisdiction || "N/A"}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Type:</span>
                  <span className={styles.detailValue}>{selectedAudit.obligationType || "N/A"}</span>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Statutory Basis</h4>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Reference:</span>
                  <span className={styles.detailValue}>{selectedAudit.statuteCode} {selectedAudit.statuteSectionReference}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Version:</span>
                  <span className={styles.detailValue}>v{selectedAudit.statuteVersion} (Effective: {selectedAudit.statuteEffectiveDate ? format(new Date(selectedAudit.statuteEffectiveDate), "MMM d, yyyy") : "N/A"})</span>
                </div>
                {selectedAudit.statuteSourceUrl && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Source:</span>
                    <a 
                      href={selectedAudit.statuteSourceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={styles.link}
                    >
                      View Statute Text <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Evidence Chain</h4>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Event Type:</span>
                  <span className={styles.detailValue}>{selectedAudit.evidenceEventType || "N/A"}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Timestamp:</span>
                  <span className={styles.detailValue}>
                    {selectedAudit.evidenceAt ? format(new Date(selectedAudit.evidenceAt), "yyyy-MM-dd HH:mm:ss.SSS") : "N/A"}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Cryptographic Hash:</span>
                  <div className={styles.fullHash}>
                    <Hash size={14} className="text-muted-foreground" />
                    {selectedAudit.evidenceCurrentHash || "No hash recorded"}
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Audit Outcome</h4>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Status:</span>
                  <Badge variant={getStatusVariant(selectedAudit.complianceStatus)}>
                    {selectedAudit.complianceStatus}
                  </Badge>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Selection Reason:</span>
                  <p className={styles.detailValue}>{selectedAudit.selectionReason || "Standard compliance check"}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAudit(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};