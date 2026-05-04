import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import styles from "./ComplianceTradelineCard.module.css";

type ComplianceTradelineSummary = {
  id: number;
  creditorName: string | null;
  accountNumber: string | null;
  bureauName: string | null;
  status: string | null;
  currentBalance: string | number | null;
  balance?: string | number | null;
};

interface ComplianceTradelineCardProps {
  tradeline: ComplianceTradelineSummary;
  issueCount: number;
  priorityIssueCount?: number;
}

export const ComplianceTradelineCard: React.FC<ComplianceTradelineCardProps> = ({
  tradeline,
  issueCount,
  priorityIssueCount = 0,
}) => {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.accountInfo}>
            <h3 className={styles.creditorName}>{tradeline.creditorName || "Unknown Creditor"}</h3>
            <div className={styles.secondaryInfo}>
              <span className={styles.accountNumber}>{tradeline.accountNumber}</span>
              <span className={styles.bullet}>&bull;</span>
              <span className={styles.bureauName}>{tradeline.bureauName || "Unknown Bureau"}</span>
            </div>
          </div>
          <Badge variant="error" className={styles.badge}>
            {issueCount} Issue{issueCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      <div className={styles.content}>
        {priorityIssueCount > 0 && (
          <div className={styles.priorityAlert}>
            <ShieldAlert size={16} />
            <span>{priorityIssueCount} High Priority</span>
          </div>
        )}
        <div className={styles.statusRow}>
          <span className={styles.label}>Status</span>
          <span className={styles.value}>{tradeline.status || "N/A"}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>Balance</span>
          <span className={styles.value}>
            {(tradeline.currentBalance ?? tradeline.balance) !== null && (tradeline.currentBalance ?? tradeline.balance) !== undefined
              ? `$${Number(tradeline.currentBalance ?? tradeline.balance).toLocaleString()}` 
              : "N/A"}
          </span>
        </div>
      </div>

      <div className={styles.footer}>
        <Button asChild variant="outline" className={styles.viewButton}>
          <Link to={`/tradelines/${tradeline.id}?tab=compliance`}>
            View Details
            <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    </div>
  );
};
