import React from "react";
import { CheckCircle, XCircle, Check } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { FieldComparisonResult } from "../helpers/parserPatternAnalyzer";
import styles from "./ParserTestResultsPanel.module.css";

interface ResultRowProps {
  result: FieldComparisonResult;
  onApprove?: () => void;
}

export function ResultRow({ result, onApprove }: ResultRowProps) {
  return (
    <tr className={result.passed ? styles.rowPassed : styles.rowFailed}>
      <td className={styles.fieldName}>
        {result.fieldName}
        {result.mode && (
          <Badge variant="default" className={styles.modeBadge}>
            {result.mode}
          </Badge>
        )}
      </td>
      <td className={styles.valueCell}>{String(result.expected)}</td>
      <td className={styles.valueCell}>
        {result.actual !== undefined && result.actual !== null ? (
          String(result.actual)
        ) : (
          <span className={styles.nullValue}>null</span>
        )}
      </td>
      <td className={styles.statusCell}>
        {result.passed ? (
          <CheckCircle size={16} className={styles.iconSuccess} />
        ) : (
          <XCircle size={16} className={styles.iconError} />
        )}
      </td>
      <td className={styles.actionCell}>
        {!result.passed && onApprove && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onApprove}
            title="Approve this field value"
          >
            <Check size={14} className="text-primary" />
          </Button>
        )}
      </td>
    </tr>
  );
}