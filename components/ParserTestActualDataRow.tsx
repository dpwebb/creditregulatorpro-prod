import React from "react";
import { Check } from "lucide-react";
import { Button } from "./Button";
import styles from "./ParserTestResultsPanel.module.css";

interface ActualDataRowProps {
  label: string;
  value: any;
  onApprove?: () => void;
}

export function ActualDataRow({ label, value, onApprove }: ActualDataRowProps) {
  return (
    <tr>
      <td className={styles.fieldName}>{label}</td>
      <td className={styles.valueCell}>
        {value !== undefined && value !== null ? (
          String(value)
        ) : (
          <span className={styles.nullValue}>Not extracted</span>
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