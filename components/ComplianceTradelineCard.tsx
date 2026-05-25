import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { formatCurrency } from "../helpers/formatters";
import {
  accountDisplayName,
  accountDisplayNameNote,
  accountNumberDisplay,
  bureauDisplayName,
  hasReportedAccountValue,
  reportedFieldDisplay,
} from "../helpers/accountDisplayLabels";
import styles from "./ComplianceTradelineCard.module.css";

type ComplianceTradelineSummary = {
  id: number;
  creditorName: string | null;
  accountNumber: string | null;
  bureauName: string | null;
  status: string | null;
  currentBalance: string | number | null;
  balance?: string | number | null;
  accountType?: string | null;
  isCollectionAccount?: boolean | null;
};

interface ComplianceTradelineCardProps {
  tradeline: ComplianceTradelineSummary;
  issueCount: number;
  priorityIssueCount?: number;
  problemLabels?: string[];
}

export const ComplianceTradelineCard: React.FC<ComplianceTradelineCardProps> = ({
  tradeline,
  issueCount,
  priorityIssueCount = 0,
  problemLabels = [],
}) => {
  const accountName = accountDisplayName(tradeline.creditorName);
  const accountNameNote = accountDisplayNameNote(tradeline.creditorName);
  const accountNumber = accountNumberDisplay(tradeline.accountNumber);
  const bureauName = bureauDisplayName(tradeline.bureauName);
  const balanceValue = tradeline.currentBalance ?? tradeline.balance;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.accountInfo}>
            <h3 className={styles.creditorName}>{accountName}</h3>
            {accountNameNote && <span className={styles.accountNote}>{accountNameNote}</span>}
            <div className={styles.secondaryInfo}>
              <span className={styles.accountNumber}>{accountNumber}</span>
              <span className={styles.bullet}>&bull;</span>
              <span className={styles.bureauName}>{bureauName}</span>
            </div>
          </div>
          <Badge variant="error" className={styles.badge}>
            {issueCount} Problem{issueCount !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      <div className={styles.content}>
        {priorityIssueCount > 0 && (
          <div className={styles.priorityAlert}>
            <ShieldAlert size={16} />
            <span>{priorityIssueCount} need a closer look</span>
          </div>
        )}
        <div className={styles.statusRow}>
          <span className={styles.label}>Status</span>
          <span className={styles.value}>{reportedFieldDisplay(tradeline.status)}</span>
        </div>
        {hasReportedAccountValue(tradeline.accountType) && (
          <div className={styles.statusRow}>
            <span className={styles.label}>Type</span>
            <span className={styles.value}>{tradeline.accountType}</span>
          </div>
        )}
        <div className={styles.statusRow}>
          <span className={styles.label}>Balance</span>
          <span className={styles.value}>
            {hasReportedAccountValue(balanceValue)
              ? formatCurrency(balanceValue)
              : "Not reported"}
          </span>
        </div>
        {problemLabels.length > 0 && (
          <div className={styles.problemList} aria-label="Top problems">
            {problemLabels.slice(0, 3).map((label) => (
              <span key={label} className={styles.problemLabel}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <Button asChild variant="outline" className={styles.viewButton}>
          <Link to={`/tradelines/${tradeline.id}?tab=compliance`}>
            Review Account
            <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    </div>
  );
};
