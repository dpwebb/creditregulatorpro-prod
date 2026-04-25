import React, { useMemo } from "react";
import {
  CreditCard,
  DollarSign,
  Calendar,
  Activity,
  AlertCircle,
  Users,
  FileText,
  Briefcase,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { Badge } from "./Badge";
import { formatCurrency, formatDate, formatPercent } from "../helpers/formatters";
import * as amountExtractors from "../helpers/tradelineAmountExtractors";
import * as dateExtractors from "../helpers/tradelineDateExtractors";
import * as basicInfoExtractors from "../helpers/tradelineBasicInfoExtractors";
import * as accountTypeExtractors from "../helpers/tradelineAccountTypeExtractors";
import * as otherExtractors from "../helpers/tradelineOtherExtractors";
import styles from "./SourceReportParsedView.module.css";

interface SourceReportParsedViewProps {
  text: string;
}

// Helper to render a field with label and value
const Field = ({
  label,
  value,
  monospace = false,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  monospace?: boolean;
  highlight?: boolean;
}) => (
  <div className={styles.field}>
    <dt className={styles.fieldLabel}>{label}</dt>
    <dd
      className={`${styles.fieldValue} ${monospace ? styles.monospace : ""} ${
        highlight ? styles.highlight : ""
      }`}
    >
      {value ?? <span className={styles.empty}>-</span>}
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

export function SourceReportParsedView({ text }: SourceReportParsedViewProps) {
  // Extract all data on mount or when text changes
  const data = useMemo(() => {
    const amounts = amountExtractors.extractAmounts(text);
    return {
      // Basic Info
      accountNumber: basicInfoExtractors.extractAccountNumber(text),
      creditorName: basicInfoExtractors.extractCreditorName(text),
      isCollection: basicInfoExtractors.extractIsCollectionAccount(text),
      collectionAgency: basicInfoExtractors.extractCollectionAgencyName(text),
      originalCreditor: basicInfoExtractors.extractOriginalCreditor(text),

      // Account Type & Status
      accountType: accountTypeExtractors.extractAccountType(text),
      status: accountTypeExtractors.extractStatus(text),
      responsibility: accountTypeExtractors.extractResponsibilityCode(text),
      ecoa: accountTypeExtractors.extractEcoaCode(text),

      // Amounts
      balance: amountExtractors.extractBalance(text),
      highCredit: amounts.high,
      pastDue: amounts.pastDue,
      creditLimit: amountExtractors.extractCreditLimit(text),
      monthlyPayment: amountExtractors.extractMonthlyPayment(text),
      lastPaymentAmount: amountExtractors.extractLastPaymentAmount(text),
      originalBalance: amountExtractors.extractOriginalBalance(text),

      // Dates
      dateAssigned: dateExtractors.extractDateAssignedToCollection(text),
      lastActivity: dateExtractors.extractLastActivityDate(text),
      lastPaymentDate: dateExtractors.extractLastPaymentDate(text),
      maturityDate: dateExtractors.extractMaturityDate(text),
      // Note: Opened Date, Closed Date, DOFD are not in the provided extractors list in the context,
      // but are common. I will omit them if extractor helpers don't exist in the provided context files,
      // or check if I missed them. Looking at tradelineDateExtractors.tsx, they are NOT there.
      // So I will only use what's available.

      // Others
      interestRate: otherExtractors.extractInterestRate(text),
      terms: otherExtractors.extractTerms(text),
      paymentPattern: otherExtractors.extractPaymentPattern(text),
      remarkCodes: otherExtractors.extractRemarkCodes(text),
    };
  }, [text]);

  // Calculate extraction confidence (simple metric)
  const totalFields = 18; // Approx number of fields we look for
  const foundFields = Object.values(data).filter(
    (v) => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true)
  ).length;
  const confidencePercent = Math.round((foundFields / totalFields) * 100);

  return (
    <div className={styles.container}>
      {/* Extraction Summary */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <div className={styles.confidenceWrapper}>
            <div className={styles.confidenceLabel}>Extraction Confidence</div>
            <div className={styles.confidenceValue}>
              <span
                className={
                  confidencePercent > 70
                    ? styles.textSuccess
                    : confidencePercent > 40
                    ? styles.textWarning
                    : styles.textError
                }
              >
                {confidencePercent}%
              </span>
              <span className={styles.confidenceSub}>
                ({foundFields}/{totalFields} fields)
              </span>
            </div>
          </div>
          <div className={styles.badgeGroup}>
            {data.isCollection ? (
              <Badge variant="error">Collection Account</Badge>
            ) : (
              <Badge variant="success">Standard Account</Badge>
            )}
            {data.status && (
              <Badge variant={data.status === "Derogatory" ? "error" : "default"}>
                {data.status === "Derogatory" ? "Negative Mark" : data.status}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className={styles.gridContainer}>
        {/* Account Details */}
        <div className={styles.card}>
          <SectionHeader icon={CreditCard} title="Account Information" />
          <div className={styles.grid2}>
            <Field
              label="Account Number"
              value={data.accountNumber}
              monospace
              highlight
            />
            <Field label="Creditor Name" value={data.creditorName} highlight />
            <Field label="Account Type" value={data.accountType} />
            <Field label="Terms" value={data.terms} />
            <Field
              label="Interest Rate"
              value={formatPercent(data.interestRate)}
              monospace
            />
          </div>
        </div>

        {/* Financials */}
        <div className={styles.card}>
          <SectionHeader icon={DollarSign} title="Financial Data" />
          <div className={styles.grid2}>
            <Field
              label="Balance"
              value={formatCurrency(data.balance)}
              monospace
              highlight
            />
            <Field
              label="Past Due"
              value={formatCurrency(data.pastDue)}
              monospace
              highlight={!!data.pastDue && data.pastDue > 0}
            />
            <Field
              label="Credit Limit"
              value={formatCurrency(data.creditLimit)}
              monospace
            />
            <Field
              label="High Credit"
              value={formatCurrency(data.highCredit)}
              monospace
            />
            <Field
              label="Monthly Payment"
              value={formatCurrency(data.monthlyPayment)}
              monospace
            />
            <Field
              label="Last Payment Amt"
              value={formatCurrency(data.lastPaymentAmount)}
              monospace
            />
             <Field
              label="Original Balance"
              value={formatCurrency(data.originalBalance)}
              monospace
            />
          </div>
        </div>

        {/* Dates */}
        <div className={styles.card}>
          <SectionHeader icon={Calendar} title="Key Dates" />
          <div className={styles.grid2}>
            <Field
              label="Last Activity"
              value={formatDate(data.lastActivity)}
              monospace
            />
            <Field
              label="Last Payment"
              value={formatDate(data.lastPaymentDate)}
              monospace
            />
            <Field
              label="Assigned to Collection"
              value={formatDate(data.dateAssigned)}
              monospace
            />
            <Field
              label="Maturity Date"
              value={formatDate(data.maturityDate)}
              monospace
            />
          </div>
        </div>

        {/* Responsibility */}
        <div className={styles.card}>
          <SectionHeader icon={Users} title="Responsibility" />
          <div className={styles.grid1}>
            <Field label="Responsibility" value={data.responsibility} />
            <Field
              label="ECOA Code"
              value={data.ecoa ? <Badge variant="default">{data.ecoa}</Badge> : null}
            />
          </div>
        </div>

        {/* Collection Info (Conditional) */}
        {data.isCollection && (
          <div className={styles.card}>
            <SectionHeader icon={Briefcase} title="Collection Details" />
            <div className={styles.grid1}>
              <Field label="Collection Agency" value={data.collectionAgency} />
              <Field label="Original Creditor" value={data.originalCreditor} />
            </div>
          </div>
        )}

        {/* Payment History Pattern */}
        <div className={`${styles.card} ${styles.fullWidth}`}>
          <SectionHeader icon={Activity} title="Payment History Pattern" />
          <div className={styles.paymentHistoryContainer}>
            {data.paymentPattern ? (
              <div className={styles.paymentPatternRow}>
                <div className={styles.patternVisual}>
                  {data.paymentPattern.split("").map((char, i) => (
                    <span
                      key={i}
                      className={styles.patternChar}
                      data-status={char}
                      title={`Month ${i + 1}: ${char}`}
                    >
                      {char}
                    </span>
                  ))}
                </div>
                <div className={styles.patternLegend}>
                  <div className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ backgroundColor: "var(--success)" }}
                    />
                    Current/Paid
                  </div>
                  <div className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ backgroundColor: "var(--warning)" }}
                    />
                    Late (30-90)
                  </div>
                  <div className={styles.legendItem}>
                    <span
                      className={styles.legendDot}
                      style={{ backgroundColor: "var(--error)" }}
                    />
                    Negative Mark
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>
                No payment pattern extracted from source text.
              </div>
            )}
          </div>
        </div>

        {/* Remarks */}
        <div className={`${styles.card} ${styles.fullWidth}`}>
          <SectionHeader icon={FileText} title="Remarks & Codes" />
          <div className={styles.grid1}>
            <Field
              label="Remark Codes"
              value={
                data.remarkCodes.length > 0 ? (
                  <div className={styles.tags}>
                    {data.remarkCodes.map((code) => (
                      <Badge key={code} variant="info">
                        {code}
                      </Badge>
                    ))}
                  </div>
                ) : null
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}