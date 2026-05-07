import React from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { TradelineComparisonResult } from "../helpers/parserPatternAnalyzer";
import { ResultRow } from "./ParserTestResultRow";
import { formatAccountNumber, isMissingReportValue } from "./parserTestDisplayFormat";
import styles from "./ParserTestResultsPanel.module.css";

interface TradelineResultCardProps {
  result: TradelineComparisonResult;
  onApprove?: () => void;
  // If we need to approve specific fields inside, we might need more granular callbacks,
  // but currently the request implies field-level approval or tradeline-level approval.
  // The existing logic passed the entire tradeline object for approval.
}

function getCreditorNameFromComparison(result: TradelineComparisonResult): string {
  if (!isMissingReportValue(result.creditorName)) {
    return String(result.creditorName).trim();
  }

  const creditorNameField = result.fieldResults.find(
    (fieldResult) =>
      fieldResult.fieldName.replace(/[^a-z0-9]/gi, "").toLowerCase() ===
      "creditorname",
  );
  const fallback =
    !isMissingReportValue(creditorNameField?.actual)
      ? creditorNameField?.actual
      : creditorNameField?.expected;

  return isMissingReportValue(fallback) ? "Unknown Creditor" : String(fallback).trim();
}

export function TradelineResultCard({
  result,
  onApprove,
}: TradelineResultCardProps) {
  const [isOpen, setIsOpen] = React.useState(!result.passed);
  const creditorName = getCreditorNameFromComparison(result);

  return (
    <Collapsible.Root
      open={isOpen}
      onOpenChange={setIsOpen}
      className={styles.tlCard}
    >
      <div
        className={`${styles.tlHeaderWrapper} ${
          result.passed ? styles.tlHeaderPassed : styles.tlHeaderFailed
        }`}
      >
        <Collapsible.Trigger className={styles.tlHeader}>
          <div className={styles.tlTitle}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <div className={styles.tlTitleText}>
              <span>Creditor Name: {creditorName}</span>
              <span className={styles.tlMeta}>
                Account Number: {formatAccountNumber(result.accountNumber)}
              </span>
            </div>
          </div>
          <div className={styles.tlStatus}>
            {result.passed ? (
              <Badge variant="success" className={styles.miniBadge}>
                Pass
              </Badge>
            ) : (
              <Badge variant="error" className={styles.miniBadge}>
                Fail
              </Badge>
            )}
          </div>
        </Collapsible.Trigger>
        {!result.passed && onApprove && (
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
          <thead>
            <tr>
              <th>Field</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {result.fieldResults.map((fieldResult, idx) => (
              <ResultRow key={idx} result={fieldResult} />
            ))}
          </tbody>
        </table>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
