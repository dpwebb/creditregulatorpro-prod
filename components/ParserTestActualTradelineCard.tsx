import React from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ActualDataRow } from "./ParserTestActualDataRow";
import {
  formatAccountNumber,
  formatParserTestValue,
  formatReportDate,
  getRemarkCodeLines,
  isMissingReportValue,
  MISSING_REPORT_VALUE_LABEL,
} from "./parserTestDisplayFormat";
import styles from "./ParserTestResultsPanel.module.css";

interface ActualTradelineCardProps {
  tradeline: any;
  index: number;
  onApprove?: () => void;
}

function displayValue(label: string, value: unknown): string | null {
  return formatParserTestValue(label, value);
}

function dateValue(value: unknown): string | null {
  return formatReportDate(value);
}

function textValue(value: unknown): string | null {
  return isMissingReportValue(value) ? null : String(value);
}

function hasPaymentSummary(summary: Record<string, unknown> | null | undefined): boolean {
  return Boolean(summary && Object.values(summary).some((value) => !isMissingReportValue(value)));
}

function hasPaymentDetails(details: unknown): details is Array<Record<string, unknown>> {
  return Array.isArray(details) && details.length > 0;
}

function buildStatusReviewNote(tradeline: any): string | null {
  const accountType = String(tradeline.accountType || "").toLowerCase();
  const status = String(tradeline.status || "").toLowerCase();
  const typeSaysOpen = /\bopen\b/.test(accountType);
  const statusSaysClosed = /\bclosed\b|consumer(?:s|'s)? request/.test(status);

  if (!typeSaysOpen || !statusSaysClosed) return null;

  return "Review possible account classification inconsistency: status indicates the account is closed, while account type reports open. Verify whether applicable bureau or furnisher accuracy rules require correction before treating this as a violation.";
}

function PaymentHistoryTable({ tradeline }: { tradeline: any }) {
  const details = tradeline.paymentHistoryDetails;
  const summary = tradeline.paymentHistory;

  if (hasPaymentDetails(details)) {
    return (
      <div className={styles.paymentHistoryWrap}>
        <h5 className={styles.subSectionTitle}>Payment History</h5>
        <table className={styles.paymentHistoryTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Balance</th>
              <th>Payment</th>
              <th>Past Due</th>
              <th>MOP</th>
              <th>Terms</th>
              <th>High Credit</th>
              <th>Credit Limit</th>
              <th>Balloon Payment</th>
              <th>Charge Off</th>
            </tr>
          </thead>
          <tbody>
            {details.map((entry, idx) => (
              <tr key={idx}>
                <td>{dateValue(entry.date) ?? textValue(entry.date) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("Balance", entry.balance) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("Payment", entry.payment) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("Past Due", entry.pastDue) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{textValue(entry.mop) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{textValue(entry.terms) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("High Credit", entry.highCredit) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("Credit Limit", entry.creditLimit) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("Balloon Payment", entry.balloonPayment) ?? MISSING_REPORT_VALUE_LABEL}</td>
                <td>{displayValue("Charge Off", entry.chargeOff) ?? MISSING_REPORT_VALUE_LABEL}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.paymentHistoryWrap}>
      <h5 className={styles.subSectionTitle}>Payment History</h5>
      <table className={styles.paymentHistoryTable}>
        <thead>
          <tr>
            <th>30 Days</th>
            <th>60 Days</th>
            <th>90 Days</th>
            <th>Months Reviewed</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{hasPaymentSummary(summary) ? textValue(summary?.["30"]) ?? "0" : MISSING_REPORT_VALUE_LABEL}</td>
            <td>{hasPaymentSummary(summary) ? textValue(summary?.["60"]) ?? "0" : MISSING_REPORT_VALUE_LABEL}</td>
            <td>{hasPaymentSummary(summary) ? textValue(summary?.["90"]) ?? "0" : MISSING_REPORT_VALUE_LABEL}</td>
            <td>
              {hasPaymentSummary(summary)
                ? textValue(summary?.["#M"] ?? tradeline.monthsReviewed) ?? MISSING_REPORT_VALUE_LABEL
                : MISSING_REPORT_VALUE_LABEL}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ActualTradelineCard({
  tradeline,
  index,
  onApprove,
}: ActualTradelineCardProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const remarkCodeLines = getRemarkCodeLines(tradeline.remarkCodes);
  const statusReviewNote = buildStatusReviewNote(tradeline);
  const dateReviewNote =
    "Review reported date fields against applicable bureau and furnisher accuracy rules before classifying a missing or inconsistent date as a violation.";

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className={styles.tlCard}
    >
      <div className={styles.tlHeaderWrapper}>
        <Collapsible.Trigger className={styles.tlHeader}>
          <div className={styles.tlTitle}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <div className={styles.tlTitleText}>
              <span>Creditor Name: {tradeline.creditorName || "Unknown Creditor"}</span>
              <span className={styles.tlMeta}>
                Report Entry #{index + 1} | Account Number: {formatAccountNumber(tradeline.accountNumber)}
              </span>
            </div>
          </div>
          <Badge variant="default" className={styles.miniBadge}>
            {tradeline.accountType || MISSING_REPORT_VALUE_LABEL}
          </Badge>
        </Collapsible.Trigger>
        {onApprove && (
          <div className={styles.tlHeaderAction}>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              <Check size={14} /> Approve
            </Button>
          </div>
        )}
      </div>

      <Collapsible.Content className={styles.tlContent}>
        <table className={styles.table}>
          <tbody>
            <ActualDataRow
              label="Creditor Name"
              value={tradeline.creditorName}
            />
            <ActualDataRow
              label="Account Number"
              value={formatAccountNumber(tradeline.accountNumber)}
            />
            <ActualDataRow label="Account Type" value={tradeline.accountType} />
            <ActualDataRow label="Status" value={tradeline.status} />
            <ActualDataRow label="Balance" value={displayValue("Balance", tradeline.balance)} />
            <ActualDataRow label="High Credit" value={displayValue("High Credit", tradeline.amounts?.high)} />
            <ActualDataRow label="Past Due" value={displayValue("Past Due", tradeline.amounts?.pastDue)} />
            <ActualDataRow
              label="Credit Limit"
              value={displayValue("Credit Limit", tradeline.creditLimit)}
            />
            <ActualDataRow
              label="Monthly Payment"
              value={displayValue(
                "Monthly Payment",
                tradeline.monthlyPayment ?? tradeline.scheduledMonthlyPayment,
              )}
            />
            <ActualDataRow
              label="Opened"
              value={dateValue(tradeline.dates?.opened)}
            />
            <ActualDataRow
              label="Reported"
              value={dateValue(tradeline.dates?.reported)}
            />
            <ActualDataRow
              label="Closed"
              value={dateValue(tradeline.dates?.closed)}
            />
            <ActualDataRow
              label="DOFD"
              value={dateValue(tradeline.dates?.dofd)}
            />
            <ActualDataRow
              label="Last Activity Date"
              value={dateValue(tradeline.lastActivityDate)}
            />
            <ActualDataRow
              label="Last Payment Date"
              value={dateValue(tradeline.lastPaymentDate)}
            />
            <ActualDataRow
              label="Posted Date"
              value={dateValue(tradeline.postedDate)}
            />
            <ActualDataRow
              label="Charge Off Date"
              value={dateValue(tradeline.chargeOffDate)}
            />
            <ActualDataRow
              label="Balloon Payment Date"
              value={dateValue(tradeline.balloonPaymentDate)}
            />
            <ActualDataRow
              label="Date Verified"
              value={dateValue(tradeline.dateVerified)}
            />
            <ActualDataRow
              label="Date Paid / Settled"
              value={dateValue(tradeline.datePaidSettled)}
            />
            <ActualDataRow
              label="Remark Codes"
              value={
                remarkCodeLines.length > 0 ? (
                  <div className={styles.multilineValue}>
                    {remarkCodeLines.map((code) => (
                      <span key={code}>{code}</span>
                    ))}
                  </div>
                ) : null
              }
              allowWrap
            />
            {tradeline.originalCreditorName && (
              <ActualDataRow
                label="Original Creditor"
                value={tradeline.originalCreditorName}
              />
            )}
            <ActualDataRow
              label="Date Reporting Review Note"
              value={dateReviewNote}
              allowWrap
            />
            {statusReviewNote && (
              <ActualDataRow
                label="Status / Type Review Note"
                value={statusReviewNote}
                allowWrap
              />
            )}
          </tbody>
        </table>
        <PaymentHistoryTable tradeline={tradeline} />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
