import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "./Badge";
import { TerminalLabelPhase, getPhaseProgress } from "../helpers/terminalLabelProgression";
import { formatCurrency, formatDate, formatPercent } from "../helpers/formatters";
import { getMopDescription } from "../helpers/mopMapping";
import { useAuth } from "../helpers/useAuth";
import { humanizeLabels } from "../helpers/humanizeLabels";
import { BureauBadge } from "./BureauBadge";
import styles from "./TradelineHeader.module.css";

interface TradelineHeaderProps {
  accountNumber: string;
  bureauName?: string | null;
  creditorName?: string | null;
  status?: string | null;
  balance?: string | number | null;
  openedDate?: string | null;
  accountType?: string | null;
  terminalPhase?: TerminalLabelPhase;
  className?: string;

  // Account Sent to a Collector specific props
  isCollectionAccount?: boolean;
  collectionAgencyName?: string | null;
  originalCreditorName?: string | null;
  dateAssignedToCollection?: string | null;
  originalBalance?: string | number | null;
  amountPastDue?: string | number | null;
  interestRate?: number | null;
  terms?: string | null;
  monthlyPayment?: string | number | null;
  lastActivityDate?: string | null;
  highCredit?: string | number | null;
  mop?: string | null;
  compact?: boolean;
  responsibilityCode?: string | null;
  crossBureauTradeline?: {
    id: number;
    bureauName: string | null;
    creditorName: string | null;
  } | null;
}

export const TradelineHeader: React.FC<TradelineHeaderProps> = ({
  accountNumber,
  bureauName,
  creditorName,
  status,
  balance,
  openedDate,
  accountType,
  terminalPhase = "DISPUTE PROCESS RESET",
  className,
  isCollectionAccount,
  collectionAgencyName,
  originalCreditorName,
  dateAssignedToCollection,
  originalBalance,
  amountPastDue,
  interestRate,
  terms,
  monthlyPayment,
  lastActivityDate,
  highCredit,
  mop,
    compact = false,
  responsibilityCode,
  crossBureauTradeline,
}) => {
  const { isAdmin } = useAuth();
  const phaseProgress = getPhaseProgress();
  const isExhausted = phaseProgress.total > 0 && phaseProgress.current === phaseProgress.total;

  const getResponsibilityLabel = (code: string) => {
    const map: Record<string, string> = {
      individual: "Individual",
      joint: "Joint",
      authorized_user: "Authorized User",
      cosigner: "Cosigner",
    };
    return map[code.toLowerCase()] || code;
  };

  const getAccountTypeLabel = (type: string) => {
    const upperType = type.toUpperCase();
    if (isAdmin) {
      return ({
        O: "Open Account (payment required in full)",
        OPEN: "Open Account (payment required in full)",
        R: "Revolving or Option (30 days)",
        REVOLVING: "Revolving or Option (30 days)",
        I: "Installment (fixed number of payments)",
        INSTALLMENT: "Installment (fixed number of payments)",
        M: "Mortgage",
        MORTGAGE: "Mortgage",
      } as Record<string, string>)[upperType] || type;
    }
    return ({
      O: "Open",
      OPEN: "Open",
      R: "Revolving",
      REVOLVING: "Revolving",
      I: "Installment",
      INSTALLMENT: "Installment",
      M: "Mortgage",
      MORTGAGE: "Mortgage",
    } as Record<string, string>)[upperType] || type;
  };

  // Helper to render individual stat items if value exists
  const renderStat = (
    label: string, 
    value: string | number | null | undefined, 
    formatter: (v: any) => string = (v) => String(v)
  ) => {
    if (value === null || value === undefined || value === "") return null;
    
    // Handle number casting for formatters that expect numbers if input is string.
    // Currency formatting accepts raw reported strings so commas and symbols are preserved correctly.
    let safeValue = value;
    if (typeof value === 'string' && formatter === formatPercent) {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) safeValue = parsed;
    }

    return (
      <div className={styles.statItem}>
        <label>{label}</label>
        <span className={styles.statValue}>{formatter(safeValue)}</span>
      </div>
    );
  };

  if (compact) {
    return (
      <div className={`${styles.compactCard} ${className || ""}`}>
        <div className={styles.compactContent}>
          <h1 className={styles.compactCreditorName}>
            {creditorName || "Unknown Creditor"}
          </h1>
          <div className={styles.compactMeta}>
            <BureauBadge bureauName={bureauName} size="sm" />
            <Badge variant={status === "DISPUTE" ? "warning" : "default"}>
              {humanizeLabels.humanizeAccountStatus(status)}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.headerCard} ${className || ""}`}>
      <div className={styles.headerContent}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.creditorNameHeading}>
              {creditorName || "Unknown Creditor"}
            </h1>
            <div className={styles.metaRow}>
              <BureauBadge bureauName={bureauName} size="md" />
            </div>
            {crossBureauTradeline && (
              <div className={styles.crossBureauBanner}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                  <BureauBadge bureauName={bureauName} size="sm" />
                  <span>vs</span>
                  <BureauBadge bureauName={crossBureauTradeline.bureauName} size="sm" />
                </div>
                <span>This account also appears on another bureau.</span>
                <Link to={`/tradelines/${crossBureauTradeline.id}?tab=compliance`} className={styles.crossBureauLink}>
                  Compare
                </Link>
              </div>
            )}
            {isCollectionAccount && (
              <div className={styles.collectionBox}>
                <div className={styles.collectionTitle}>Collection Account</div>
                <div className={styles.collectionAgencyText}>
                  Bureau Member: {creditorName || "Unknown"}
                </div>
                {collectionAgencyName && (
                  <div className={styles.collectionAgencyText}>
                    Collection Agent: {collectionAgencyName}
                  </div>
                )}
                {originalCreditorName && (
                  <div className={styles.collectionAgencyText}>
                    Original Creditor: {originalCreditorName}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.statusBadges}>
            <Badge variant={status === "DISPUTE" ? "warning" : "default"}>
              {status || "UNKNOWN"}
            </Badge>
          </div>
        </div>
        
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <label>{isCollectionAccount ? "Balance Owing" : "Balance"}</label>
            <span className={styles.statValue}>
              {balance !== null && balance !== undefined && balance !== "" 
                ? formatCurrency(balance) 
                : <Badge variant="error">PROBLEM</Badge>}
            </span>
          </div>

          {isAdmin && renderStat("Original Balance", originalBalance, formatCurrency)}
          {isAdmin && renderStat("High Credit", highCredit, formatCurrency)}
          {isAdmin && renderStat("Amount Past Due", amountPastDue, formatCurrency)}

          {isCollectionAccount && dateAssignedToCollection ? (
              renderStat("Date Assigned", dateAssignedToCollection, formatDate)
          ) : (
              <div className={styles.statItem}>
                  <label>Opened</label>
                  <span className={styles.statValue}>
                      {openedDate ? formatDate(openedDate) : "-"}
                  </span>
              </div>
          )}
          
          {renderStat("Last Activity", lastActivityDate, formatDate)}
          {isAdmin && renderStat("Monthly Payment", monthlyPayment, formatCurrency)}
          {isAdmin && renderStat("Interest Rate", interestRate, formatPercent)}
          {isAdmin && renderStat("Terms", terms)}
          {isAdmin && mop && renderStat("Payment Rating", `${mop} - ${getMopDescription(mop)}`)}

          {renderStat("Responsibility", responsibilityCode ? getResponsibilityLabel(responsibilityCode) : null)}

          <div className={styles.statItem}>
            <label>Type</label>
            <span className={styles.statValue}>
              {accountType ? getAccountTypeLabel(accountType) : "-"}
            </span>
          </div>
        </div>
      </div>

      <div className={`${styles.terminalBar} ${isExhausted ? styles.exhaustedBar : styles.pendingBar}`}>
        <div className={styles.terminalLabelText}>{isExhausted ? "ALL STEPS COMPLETE" : terminalPhase}</div>
        <div className={styles.terminalLabelProgress}>
          {phaseProgress.total > 0 ? `Step ${phaseProgress.current} of ${phaseProgress.total}` : "Redesign pending"}
        </div>
      </div>
    </div>
  );
};
