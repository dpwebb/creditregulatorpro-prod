import { CheckCircle, XCircle, Check } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { FieldComparisonResult } from "../helpers/parserPatternAnalyzer";
import {
  formatParserTestValue,
  MISSING_REPORT_VALUE_LABEL,
} from "./parserTestDisplayFormat";
import styles from "./ParserTestResultsPanel.module.css";

interface ResultRowProps {
  result: FieldComparisonResult;
  onApprove?: () => void;
}

export function ResultRow({ result, onApprove }: ResultRowProps) {
  const expected = formatParserTestValue(result.fieldName, result.expected);
  const actual = formatParserTestValue(result.fieldName, result.actual);

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
      <td className={styles.valueCell}>
        {expected ?? <span className={styles.nullValue}>{MISSING_REPORT_VALUE_LABEL}</span>}
      </td>
      <td className={styles.valueCell}>
        {actual ?? <span className={styles.nullValue}>{MISSING_REPORT_VALUE_LABEL}</span>}
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
