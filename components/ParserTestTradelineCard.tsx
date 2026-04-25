import React from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { TradelineComparisonResult } from "../helpers/parserPatternAnalyzer";
import { ResultRow } from "./ParserTestResultRow";
import styles from "./ParserTestResultsPanel.module.css";

interface TradelineResultCardProps {
  result: TradelineComparisonResult;
  onApprove?: () => void;
  // If we need to approve specific fields inside, we might need more granular callbacks,
  // but currently the request implies field-level approval or tradeline-level approval.
  // The existing logic passed the entire tradeline object for approval.
}

export function TradelineResultCard({
  result,
  onApprove,
}: TradelineResultCardProps) {
  const [isOpen, setIsOpen] = React.useState(!result.passed);

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
            <span>Account: {result.accountNumber}</span>
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