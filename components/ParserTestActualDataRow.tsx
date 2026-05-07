import React from "react";
import { Check } from "lucide-react";
import { Button } from "./Button";
import { MISSING_REPORT_VALUE_LABEL } from "./parserTestDisplayFormat";
import styles from "./ParserTestResultsPanel.module.css";

interface ActualDataRowProps {
  label: string;
  value: React.ReactNode;
  onApprove?: () => void;
  missingLabel?: string;
  allowWrap?: boolean;
}

function hasValue(value: React.ReactNode): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function ActualDataRow({
  label,
  value,
  onApprove,
  missingLabel = MISSING_REPORT_VALUE_LABEL,
  allowWrap = false,
}: ActualDataRowProps) {
  return (
    <tr>
      <td className={styles.fieldName}>{label}</td>
      <td className={`${styles.valueCell} ${allowWrap ? styles.valueCellWrap : ""}`}>
        {hasValue(value) ? (
          value
        ) : (
          <span className={styles.nullValue}>{missingLabel}</span>
        )}
      </td>
      <td className={styles.actionCellRight}>
        {onApprove && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onApprove}
            title="Set as expected value"
          >
            <Check
              size={14}
              className="text-muted-foreground hover:text-primary"
            />
          </Button>
        )}
      </td>
    </tr>
  );
}
