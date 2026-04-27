import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./Table";
import { Skeleton } from "./Skeleton";
import { Button } from "./Button";
import { BankruptcyStatusBadge } from "./BankruptcyStatusBadge";
import { BankruptcyRecordEnhanced, useDeleteBankruptcy } from "../helpers/bankruptcyQueries";
import { formatDate } from "../helpers/formatters";
import { getProvinceLabel, getBankruptcyTypeLabel } from "../helpers/bankruptcyRules";
import { Edit2, Trash2, ExternalLink, AlertTriangle, CheckCircle } from "lucide-react";
import { useToast } from "../helpers/useToast";
import { Link } from "react-router-dom";
import { HelpTooltip } from "./HelpTooltip";
import styles from "./BankruptcyTable.module.css";

interface BankruptcyTableProps {
  data: BankruptcyRecordEnhanced[];
  isLoading: boolean;
  onEdit: (record: BankruptcyRecordEnhanced) => void;
}

export const BankruptcyTable = ({ data, isLoading, onEdit }: BankruptcyTableProps) => {
  const { showSuccess, showError } = useToast();
  const deleteMutation = useDeleteBankruptcy();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this bankruptcy record?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        showSuccess("Record deleted successfully");
      } catch (err) {
        showError("Failed to delete record");
      }
    }
  };

  const getRowClass = (record: BankruptcyRecordEnhanced) => {
    if (record.status === "REMOVED") return styles.rowRemoved;
    if (record.isEligibleForRemoval) return styles.rowOverdue;
    if (record.daysUntilRemoval !== null && record.daysUntilRemoval <= 30 && record.daysUntilRemoval > 0) {
      return styles.rowWarning;
    }
    return "";
  };

  const renderRemovalStatus = (record: BankruptcyRecordEnhanced) => {
    if (record.status === "REMOVED") {
      return <span className={styles.textSuccess}>Removed</span>;
    }
    if (record.isEligibleForRemoval) {
      return (
        <div className={styles.statusCell}>
          <AlertTriangle size={14} className={styles.iconError} />
          <span className={styles.textError}>Eligible Now</span>
        </div>
      );
    }
    if (record.daysUntilRemoval !== null) {
      const isWarning = record.daysUntilRemoval <= 30;
      return (
        <span className={isWarning ? styles.textWarning : ""}>
          {record.daysUntilRemoval} days
        </span>
      );
    }
    return <span className={styles.textMuted}>Indefinite</span>;
  };

  if (isLoading) {
    return (
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Filing Date</TableHead>
              <TableHead>Province</TableHead>
              <TableHead>Removal Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="w-32 h-4" /></TableCell>
                <TableCell><Skeleton className="w-24 h-4" /></TableCell>
                <TableCell className={styles.hideOnMobile}><Skeleton className="w-24 h-4" /></TableCell>
                <TableCell className={styles.hideOnMobile}><Skeleton className="w-16 h-4" /></TableCell>
                <TableCell className={styles.hideOnMobile}><Skeleton className="w-24 h-4" /></TableCell>
                <TableCell><Skeleton className="w-20 h-4" /></TableCell>
                <TableCell><Skeleton className="w-20 h-4" /></TableCell>
                <TableCell><Skeleton className="w-16 h-4 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  if (data.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h3>No Bankruptcy Records Found</h3>
        <p>Add a new record to start tracking retention periods.</p>
      </div>
    );
  }

  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Filing Date</TableHead>
            <TableHead className={styles.hideOnMobile}>Discharge / Completion</TableHead>
            <TableHead className={styles.hideOnMobile}>Province</TableHead>
            <TableHead className={styles.hideOnMobile}>Expected Removal</TableHead>
            <TableHead>Time Until Removal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead style={{ textAlign: "right" }}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((record) => (
            <React.Fragment key={record.id}>
              <TableRow 
                className={`${styles.row} ${getRowClass(record)}`}
                onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
              >
                <TableCell>
                  <div className={styles.typeCell}>
                    <span className={styles.typeLabel}>
                      {getBankruptcyTypeLabel(record.bankruptcyType)}
                    </span>
                    {record.tradelineId && (
                      <Link 
                        to={`/tradelines/${record.tradelineId}`}
                        onClick={(e) => e.stopPropagation()}
                        className={styles.tradelineLink}
                      >
                        <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>
                </TableCell>
                <TableCell>{formatDate(record.filingDate)}</TableCell>
                <TableCell className={styles.hideOnMobile}>
                  {record.dischargeDate ? formatDate(record.dischargeDate) : 
                   record.completionDate ? formatDate(record.completionDate) : 
                   "—"}
                </TableCell>
                <TableCell className={styles.hideOnMobile}>
                  <span title={getProvinceLabel(record.province)}>{record.province}</span>
                </TableCell>
                <TableCell className={styles.hideOnMobile}>
                  {record.expectedRemovalDate ? formatDate(record.expectedRemovalDate) : "—"}
                </TableCell>
                <TableCell>
                  {renderRemovalStatus(record)}
                </TableCell>
                <TableCell>
                  <BankruptcyStatusBadge status={record.status} />
                </TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(record);
                      }}
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(record.id, e)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {expandedId === record.id && (
                <TableRow className={styles.expandedRow}>
                  <TableCell colSpan={8}>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Retention Rule</span>
                        <span className={styles.detailValue}>{record.retentionRuleDescription}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Case Number</span>
                        <span className={styles.detailValue}>{record.caseNumber || "—"}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Filing Court</span>
                        <span className={styles.detailValue}>{record.filingCourt || "—"}</span>
                      </div>
                      <div className={styles.detailItem}>
                        <span className={styles.detailLabel}>Notes</span>
                        <span className={styles.detailValue}>{record.notes || "—"}</span>
                      </div>
                      {record.tradelineId && (
                        <div className={styles.detailItem}>
                          <span className={styles.detailLabel}>Linked Tradeline</span>
                          <span className={styles.detailValue}>
                            {record.accountNumber ? `Account #${record.accountNumber}` : `ID: ${record.tradelineId}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};