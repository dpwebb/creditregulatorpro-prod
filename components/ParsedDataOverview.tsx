import React from "react";
import { useTradeline } from "../helpers/useTradeline";
import { Badge } from "./Badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./Collapsible";
import { Skeleton } from "./Skeleton";
import { formatCurrency, formatDate, formatPercent } from "../helpers/formatters";
import { getMopDescription } from "../helpers/mopMapping";
import { ChevronDown, FileText, Calendar, DollarSign, CreditCard, Activity, AlertCircle } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import styles from "./ParsedDataOverview.module.css";

// Helper to render a field with label and value
const Field = ({ label, value, monospace = false, highlight = false, emptyText = "-" }: { label: string; value: React.ReactNode; monospace?: boolean; highlight?: boolean; emptyText?: string }) => (
  <div className={styles.field}>
    <dt className={styles.fieldLabel}>{label}</dt>
    <dd className={`${styles.fieldValue} ${monospace ? styles.monospace : ""} ${highlight ? styles.highlight : ""}`}>
      {value ?? <span className={styles.empty}>{emptyText}</span>}
    </dd>
  </div>
);

// Helper for section headers
const SectionHeader = ({ icon: Icon, title }: { icon: any; title: string }) => (
  <div className={styles.sectionHeader}>
    <Icon className={styles.sectionIcon} size={18} />
    <h3 className={styles.sectionTitle}>{title}</h3>
  </div>
);

const parsePaymentPattern = (pattern: string) => {
  const match = pattern.match(/30d:(\d+)\s+60d:(\d+)\s+90d:(\d+)\s+months:(\d+)/);
  if (match) {
    return {
      late30: parseInt(match[1], 10),
      late60: parseInt(match[2], 10),
      late90: parseInt(match[3], 10),
      months: parseInt(match[4], 10),
    };
  }
  return null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const formatCurrencyOrNull = (value: unknown): string | null => {
  const numeric = toFiniteNumber(value);
  return numeric === null ? null : formatCurrency(numeric);
};

const formatDateOrNull = (value: unknown): string | null => {
  const formatted = formatDate(value as any);
  return formatted || null;
};

interface ParsedDataOverviewProps {
  tradelineId: number;
  className?: string;
}

export const ParsedDataOverview: React.FC<ParsedDataOverviewProps> = ({
  tradelineId,
  className,
}) => {
  const { data, isLoading, error } = useTradeline(tradelineId);
  const { authState, isAdmin } = useAuth();

  if (isLoading || authState.type === "loading") {
    return <ParsedDataOverviewSkeleton className={className} />;
  }

  if (error || !data) {
    return (
      <div className={`${styles.errorContainer} ${className || ""}`}>
        <AlertCircle className={styles.errorIcon} />
        <p>Failed to load tradeline data.</p>
      </div>
    );
  }

  const { tradeline } = data;
  const accountType = (tradeline.accountType || "").toLowerCase();
  const isCreditAccount = accountType.includes("revolving") || accountType.includes("credit card") || accountType.includes("installment") || accountType.includes("loan");

  if (!isAdmin) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        
        {/* 1. Your Account */}
        <div className={styles.card}>
          <SectionHeader icon={CreditCard} title="Your Account" />
          <div className={styles.grid2}>
            <Field label="Creditor" value={tradeline.creditorName} emptyText="Not reported" />
            <Field label="Bureau" value={tradeline.bureauName} emptyText="Not reported" />
            <Field label="Account Type" value={tradeline.accountType} emptyText="Not reported" />
            <Field label="Account Number" value={tradeline.accountNumber} monospace emptyText="Not reported" />
            <Field 
              label="Status" 
              value={tradeline.status ? <Badge variant={tradeline.status === 'Derogatory' ? 'error' : 'default'}>{tradeline.status === 'Derogatory' ? 'Negative Mark' : tradeline.status}</Badge> : null}
              emptyText="Not reported"
            />
            {tradeline.isCollectionAccount && (
              <>
                <Field label="Collection Agency" value={tradeline.collectionAgencyName} emptyText="Not reported" />
                <Field label="Original Creditor" value={tradeline.originalCreditorName} emptyText="Not reported" />
              </>
            )}
          </div>
        </div>

        {/* 2. Money */}
        <div className={styles.card}>
          <SectionHeader icon={DollarSign} title="Money" />
          <div className={styles.grid3}>
            <Field label="Current Balance" value={formatCurrencyOrNull(tradeline.balance ?? tradeline.currentBalance)} monospace emptyText="Not reported" />
            <Field label="Monthly Payment" value={formatCurrencyOrNull(tradeline.monthlyPayment ?? tradeline.scheduledMonthlyPayment)} monospace emptyText="Not reported" />
            <Field label="Past Due" value={formatCurrencyOrNull(tradeline.amountPastDue)} monospace emptyText="Not reported" />
            <Field
              label="Credit Limit"
              value={isCreditAccount ? formatCurrencyOrNull(tradeline.creditLimit) : null}
              monospace
              emptyText={isCreditAccount ? "Not reported" : "N/A"}
            />
            <Field label="Highest Balance" value={formatCurrencyOrNull(tradeline.highCredit)} monospace emptyText="Not reported" />
          </div>
        </div>

        {/* 3. Payment History */}
        <div className={styles.card}>
          <SectionHeader icon={Activity} title="Payment History" />
          <div className={styles.paymentHistoryContainer}>
            {tradeline.paymentPattern ? (
              (() => {
                const parsed = parsePaymentPattern(tradeline.paymentPattern);
                if (!parsed) {
                  return <div className={styles.rawText}>{tradeline.paymentPattern}</div>;
                }

                const { late30, late60, late90, months } = parsed;
                const onTime = months - (late30 + late60 + late90);

                return (
                  <div className={styles.paymentPatternLayout}>
                    <div className={styles.totalMonths}>
                      <span className={styles.totalMonthsLabel}>Total Months Reported:</span>
                      <span className={styles.totalMonthsValue}>{months}</span>
                    </div>

                    <div className={styles.statsRow}>
                      <div className={`${styles.statCard} ${onTime > 0 ? styles.statGood : styles.statNeutral}`}>
                        <span className={styles.statLabel}>On Time</span>
                        <span className={styles.statValue}>{onTime}</span>
                      </div>
                      <div className={`${styles.statCard} ${late30 === 0 ? styles.statGood : styles.statWarning}`}>
                        <span className={styles.statLabel}>30 Days Late</span>
                        <span className={styles.statValue}>{late30}</span>
                      </div>
                      <div className={`${styles.statCard} ${late60 === 0 ? styles.statGood : styles.statError}`}>
                        <span className={styles.statLabel}>60 Days Late</span>
                        <span className={styles.statValue}>{late60}</span>
                      </div>
                      <div className={`${styles.statCard} ${late90 === 0 ? styles.statGood : styles.statSevere}`}>
                        <span className={styles.statLabel}>90+ Days Late</span>
                        <span className={styles.statValue}>{late90}</span>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className={styles.emptyState}>No payment info yet.</div>
            )}
          </div>
        </div>

        {/* 4. Important Dates */}
        <div className={styles.card}>
          <SectionHeader icon={Calendar} title="Important Dates" />
          <div className={styles.grid2}>
            <Field label="Date Opened" value={formatDateOrNull(tradeline.openedDate)} monospace emptyText="Not reported" />
            <Field label="Reported Date" value={formatDateOrNull(tradeline.lastReportedDate)} monospace emptyText="Not reported" />
            <Field label="Posted Date" value={formatDateOrNull(tradeline.postedDate)} monospace emptyText="Not reported" />
            <Field label="Date Closed" value={formatDateOrNull(tradeline.dateClosed)} monospace emptyText="Not reported" />
            <Field label="First Delinquency Date" value={formatDateOrNull(tradeline.dateOfFirstDelinquency)} monospace emptyText="Not reported" />
            <Field label="Last Payment Date" value={formatDateOrNull(tradeline.dateOfLastPayment)} monospace emptyText="Not reported" />
            <Field label="Last Activity" value={formatDateOrNull(tradeline.lastActivityDate)} monospace emptyText="Not reported" />
            <Field label="Charge Off Date" value={formatDateOrNull(tradeline.chargeOffDate)} monospace emptyText="Not reported" />
          </div>
        </div>

      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      
      {/* 1. Source Information Section */}
      <div className={styles.card}>
        <SectionHeader icon={FileText} title="Source Information" />
        <div className={styles.grid2}>
          <Field label="Bureau" value={tradeline.bureauName} />
          <Field label="TU Case ID" value={tradeline.tuCaseId} monospace />
          <Field label="Report Artifact ID" value={tradeline.reportArtifactId?.toString()} monospace />
          <Field label="First Reported" value={tradeline.firstReportedDate} monospace />
<Field label="Last Reviewed By" value={tradeline.lastReviewedBy} />
<Field label="Last Reviewed On" value={tradeline.lastReviewedDate} monospace />
        </div>
        
        {tradeline.sourceText && (
          <Collapsible className={styles.sourceCollapsible}>
            <CollapsibleTrigger className={styles.sourceTrigger}>
              <span>View Raw Source Text</span>
              <ChevronDown size={16} />
            </CollapsibleTrigger>
            <CollapsibleContent className={styles.sourceContent}>
              <pre className={styles.rawText}>{tradeline.sourceText}</pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* 2. Account Details Grid */}
      <div className={styles.card}>
        <SectionHeader icon={CreditCard} title="Account Details" />
        <div className={styles.grid3}>
          <Field label="Account Number" value={tradeline.accountNumber} monospace highlight emptyText="Not reported" />
          <Field label="Creditor Name" value={tradeline.creditorName} />
          <Field label="Account Type" value={tradeline.accountType} />
          <Field label="Responsibility" value={tradeline.responsibilityCode ? tradeline.responsibilityCode.charAt(0).toUpperCase() + tradeline.responsibilityCode.slice(1).replace(/_/g, ' ') : null} />
                    <Field label="ECOA Code" value={tradeline.ecoaCode ? <Badge variant="default">{tradeline.ecoaCode}</Badge> : tradeline.responsibilityCode ? <Badge variant="default">{tradeline.responsibilityCode.charAt(0).toUpperCase() + tradeline.responsibilityCode.slice(1).replace(/_/g, ' ')}</Badge> : <Badge variant="error">VIOLATION</Badge>} />
          <Field label="Terms" value={tradeline.terms} />
          {tradeline.mop && (
            <Field label="MOP" value={
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                <Badge variant="default">{tradeline.mop}</Badge>
                <span>{getMopDescription(tradeline.mop)}</span>
              </div>
            } />
          )}
        </div>
      </div>

      {/* 3. Financial Amounts Section */}
      <div className={styles.card}>
        <SectionHeader icon={DollarSign} title="Financial Amounts" />
        <div className={styles.grid4}>
          <Field label="Current Balance" value={(tradeline.balance ?? tradeline.currentBalance) != null ? formatCurrency(tradeline.balance ?? tradeline.currentBalance) : <Badge variant="error">VIOLATION</Badge>} monospace />
          <Field label="High Credit" value={tradeline.highCredit != null ? formatCurrency(tradeline.highCredit) : (tradeline.accountType?.toLowerCase().includes('revolving') || tradeline.accountType?.toLowerCase().includes('installment') || tradeline.accountType?.toLowerCase().includes('credit card') ? <Badge variant="error">VIOLATION</Badge> : null)} monospace />
          <Field label="Credit Limit" value={tradeline.creditLimit != null ? formatCurrency(tradeline.creditLimit) : (tradeline.accountType?.toLowerCase().includes('revolving') || tradeline.accountType?.toLowerCase().includes('credit card') ? <Badge variant="error">VIOLATION</Badge> : null)} monospace />
          <Field label="Past Due" value={formatCurrencyOrNull(tradeline.amountPastDue)} monospace />
          <Field label="Original Balance" value={formatCurrencyOrNull(tradeline.originalBalance)} monospace />
          <Field label="Monthly Payment" value={formatCurrencyOrNull(tradeline.monthlyPayment ?? tradeline.scheduledMonthlyPayment)} monospace />
          <Field label="Last Payment" value={formatCurrencyOrNull(tradeline.lastPaymentAmount)} monospace />
          <Field label="Interest Rate" value={formatPercent(tradeline.interestRate ? Number(tradeline.interestRate) : null)} monospace />
        </div>
      </div>

      {/* 4. Key Dates Section */}
      <div className={styles.card}>
        <SectionHeader icon={Calendar} title="Key Dates" />
        <div className={styles.grid4}>
          <Field label="Opened Date" value={formatDate(tradeline.openedDate)} monospace />
          <Field label="Date Closed" value={formatDate(tradeline.dateClosed)} monospace />
          <Field label="DOFD" value={formatDate(tradeline.dateOfFirstDelinquency)} monospace />
          <Field label="Reported Date" value={formatDate(tradeline.lastReportedDate)} monospace />
          <Field label="Last Payment" value={formatDate(tradeline.dateOfLastPayment)} monospace />
          <Field label="Last Activity" value={formatDate(tradeline.lastActivityDate)} monospace />
          <Field label="Posted Date" value={formatDate(tradeline.postedDate)} monospace />
          <Field label="Assigned to Collection" value={formatDate(tradeline.dateAssignedToCollection)} monospace />
          <Field label="Maturity Date" value={formatDate(tradeline.maturityDate)} monospace />
          <Field label="Charge Off Date" value={formatDate(tradeline.chargeOffDate)} monospace />
          <Field label="Balloon Payment Date" value={formatDate(tradeline.balloonPaymentDate)} monospace />
        </div>
      </div>

      {/* 5. Payment History Section */}
      <div className={styles.card}>
        <SectionHeader icon={Activity} title="Payment History" />
        <div className={styles.paymentHistoryContainer}>
          {tradeline.paymentPattern ? (
            (() => {
              const parsed = parsePaymentPattern(tradeline.paymentPattern);
              if (!parsed) {
                return <div className={styles.rawText}>{tradeline.paymentPattern}</div>;
              }

              const { late30, late60, late90, months } = parsed;
              const onTime = months - (late30 + late60 + late90);

              return (
                <div className={styles.paymentPatternLayout}>
                  <div className={styles.totalMonths}>
                    <span className={styles.totalMonthsLabel}>Total Months Reported:</span>
                    <span className={styles.totalMonthsValue}>{months}</span>
                  </div>

                  <div className={styles.statsRow}>
                    <div className={`${styles.statCard} ${onTime > 0 ? styles.statGood : styles.statNeutral}`}>
                      <span className={styles.statLabel}>On Time</span>
                      <span className={styles.statValue}>{onTime}</span>
                    </div>
                    <div className={`${styles.statCard} ${late30 === 0 ? styles.statGood : styles.statWarning}`}>
                      <span className={styles.statLabel}>30 Days Late</span>
                      <span className={styles.statValue}>{late30}</span>
                    </div>
                    <div className={`${styles.statCard} ${late60 === 0 ? styles.statGood : styles.statError}`}>
                      <span className={styles.statLabel}>60 Days Late</span>
                      <span className={styles.statValue}>{late60}</span>
                    </div>
                    <div className={`${styles.statCard} ${late90 === 0 ? styles.statGood : styles.statSevere}`}>
                      <span className={styles.statLabel}>90+ Days Late</span>
                      <span className={styles.statValue}>{late90}</span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className={styles.emptyState}>No payment pattern data available</div>
          )}
        </div>
      </div>

      {/* 6. Status & Remarks */}
      <div className={styles.card}>
        <SectionHeader icon={AlertCircle} title="Status & Remarks" />
        <div className={styles.grid2}>
          <Field 
            label="Current Status" 
            value={tradeline.status ? <Badge variant={tradeline.status === 'Derogatory' ? 'error' : 'default'}>{tradeline.status === 'Derogatory' ? 'Negative Mark' : tradeline.status}</Badge> : null} 
          />
          <Field 
            label="Collection Account" 
            value={tradeline.isCollectionAccount ? <Badge variant="error">YES</Badge> : <Badge variant="default">NO</Badge>} 
          />
          {tradeline.isCollectionAccount && (
            <>
              <Field label="Collection Agency" value={tradeline.collectionAgencyName} />
              <Field label="Original Creditor" value={tradeline.originalCreditorName} />
            </>
          )}
        </div>
      </div>

      {/* 7. Metro2 Indicators */}
      <div className={styles.card}>
        <SectionHeader icon={FileText} title="Associated Consumers" />
        <div className={styles.metroGrid}>
          <div className={styles.metroItem}>
            <span className={styles.metroLabel}>Co-Signer / Joint Holder</span>
            {tradeline.hasJ1Segment ? (
              <div className={styles.metroContent}>
                <Badge variant="success">Present</Badge>
                {tradeline.j1ConsumerName && <span className={styles.metroDetail}>{tradeline.j1ConsumerName}</span>}
              </div>
            ) : (
              <Badge variant="default">None</Badge>
            )}
          </div>
          
          <div className={styles.metroItem}>
            <span className={styles.metroLabel}>Secondary Associated Consumer</span>
            {tradeline.hasJ2Segment ? (
              <div className={styles.metroContent}>
                <Badge variant="success">Present</Badge>
                {tradeline.j2ConsumerName && <span className={styles.metroDetail}>{tradeline.j2ConsumerName}</span>}
              </div>
            ) : (
              <Badge variant="default">None</Badge>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

const ParsedDataOverviewSkeleton = ({ className }: { className?: string }) => (
  <div className={`${styles.container} ${className || ""}`}>
    {[1, 2, 3].map((i) => (
      <div key={i} className={styles.card}>
        <div className={styles.sectionHeader}>
          <Skeleton style={{ width: "24px", height: "24px", borderRadius: "50%" }} />
          <Skeleton style={{ width: "150px", height: "24px" }} />
        </div>
        <div className={styles.grid3} style={{ marginTop: "1rem" }}>
          {[1, 2, 3, 4, 5, 6].map((j) => (
            <div key={j} className={styles.field}>
              <Skeleton style={{ width: "80px", height: "14px", marginBottom: "4px" }} />
              <Skeleton style={{ width: "100%", height: "20px" }} />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);
