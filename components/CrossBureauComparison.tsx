import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { BureauBadge } from "./BureauBadge";
import { Button } from "./Button";
import { formatCurrency, formatDate } from "../helpers/formatters";
import { AlertCircle, ExternalLink } from "lucide-react";
import styles from "./CrossBureauComparison.module.css";

export interface ComparisonTradeline {
  id: number;
  bureauName: string | null;
  creditorName: string | null;
  accountNumber: string | null;
  balance: number | null;
  currentBalance: number | null;
  status: string | null;
  openedDate: string | Date | null;
  dateClosed: string | Date | null;
  dateOfFirstDelinquency: string | Date | null;
  creditLimit: number | null;
  highCredit: number | null;
  amountPastDue: number | null;
  lastActivityDate: string | Date | null;
}

interface CrossBureauComparisonProps extends React.HTMLAttributes<HTMLDivElement> {
  tradelineA: ComparisonTradeline;
  tradelineB: ComparisonTradeline;
}

export const CrossBureauComparison = React.forwardRef<HTMLDivElement, CrossBureauComparisonProps>(
  ({ tradelineA, tradelineB, className, ...props }, ref) => {
    
    // Helper to determine if two formatted values differ to trigger the warning highlight
    const compareValues = (val1: string | null, val2: string | null) => {
      const normalize = (v: string | null) => (v || "").trim().toLowerCase();
      return normalize(val1) !== normalize(val2);
    };

    const rows = useMemo(() => {
      const buildRow = (
        label: string, 
        rawA: any, 
        rawB: any, 
        formatter: (v: any) => string
      ) => {
        const formattedA = formatter(rawA) || "—";
        const formattedB = formatter(rawB) || "—";
        const isDifferent = compareValues(formattedA, formattedB);
        return { label, formattedA, formattedB, isDifferent };
      };

      const fallbackCurrency = (v: any) => (v != null ? formatCurrency(v) : "");

      return [
        buildRow("Creditor", tradelineA.creditorName, tradelineB.creditorName, (v) => v || ""),
        buildRow("Account #", tradelineA.accountNumber, tradelineB.accountNumber, (v) => v || ""),
        buildRow("Status", tradelineA.status, tradelineB.status, (v) => v || ""),
        buildRow("Balance", tradelineA.balance, tradelineB.balance, fallbackCurrency),
        buildRow("Current Balance", tradelineA.currentBalance, tradelineB.currentBalance, fallbackCurrency),
        buildRow("Amount Past Due", tradelineA.amountPastDue, tradelineB.amountPastDue, fallbackCurrency),
        buildRow("Credit Limit", tradelineA.creditLimit, tradelineB.creditLimit, fallbackCurrency),
        buildRow("High Credit", tradelineA.highCredit, tradelineB.highCredit, fallbackCurrency),
        buildRow("Opened Date", tradelineA.openedDate, tradelineB.openedDate, formatDate),
        buildRow("Date Closed", tradelineA.dateClosed, tradelineB.dateClosed, formatDate),
        buildRow("First Delinquency (DOFD)", tradelineA.dateOfFirstDelinquency, tradelineB.dateOfFirstDelinquency, formatDate),
        buildRow("Last Activity", tradelineA.lastActivityDate, tradelineB.lastActivityDate, formatDate),
      ];
    }, [tradelineA, tradelineB]);

    const hasDifferences = rows.some((r) => r.isDifferent);

    return (
      <div ref={ref} className={`${styles.container} ${className || ""}`} {...props}>
        <div className={styles.grid}>
          {/* TRADELINE A COLUMN */}
          <div className={styles.column}>
            <div className={styles.header}>
              <BureauBadge bureauName={tradelineA.bureauName} size="lg" />
              <Button asChild variant="outline" size="sm">
                <Link to={`/tradelines/${tradelineA.id}`}>
                  View Details <ExternalLink size={14} className={styles.btnIcon} />
                </Link>
              </Button>
            </div>
            
            <div className={styles.fields}>
              {rows.map((row, idx) => (
                <div 
                  key={`a-${idx}`} 
                  className={`${styles.fieldRow} ${row.isDifferent ? styles.fieldDifferent : ""}`}
                >
                  <span className={styles.fieldLabel}>{row.label}</span>
                  <span className={styles.fieldValue}>{row.formattedA}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TRADELINE B COLUMN */}
          <div className={styles.column}>
            <div className={styles.header}>
              <BureauBadge bureauName={tradelineB.bureauName} size="lg" />
              <Button asChild variant="outline" size="sm">
                <Link to={`/tradelines/${tradelineB.id}`}>
                  View Details <ExternalLink size={14} className={styles.btnIcon} />
                </Link>
              </Button>
            </div>
            
            <div className={styles.fields}>
              {rows.map((row, idx) => (
                <div 
                  key={`b-${idx}`} 
                  className={`${styles.fieldRow} ${row.isDifferent ? styles.fieldDifferent : ""}`}
                >
                  <span className={styles.fieldLabel}>{row.label}</span>
                  <span className={styles.fieldValue}>{row.formattedB}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FOOTER MESSAGE */}
        {hasDifferences && (
          <div className={styles.footer}>
            <AlertCircle className={styles.footerIcon} size={20} />
            <p className={styles.footerText}>
              These two credit companies are showing different information for the same account. 
              This could be a problem worth disputing.
            </p>
          </div>
        )}
      </div>
    );
  }
);

CrossBureauComparison.displayName = "CrossBureauComparison";