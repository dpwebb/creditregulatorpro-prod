import React from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { format } from "../helpers/dateUtils";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { ActualDataRow } from "./ParserTestActualDataRow";
import styles from "./ParserTestResultsPanel.module.css";

interface ActualTradelineCardProps {
  tradeline: any;
  onApprove?: () => void;
}

export function ActualTradelineCard({
  tradeline,
  onApprove,
}: ActualTradelineCardProps) {
  const [isOpen, setIsOpen] = React.useState(false);

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
            <span>{tradeline.creditorName || "Unknown Creditor"}</span>
            <span className="text-xs text-muted-foreground ml-2">
              ({tradeline.accountNumber})
            </span>
          </div>
          <Badge variant="default" className={styles.miniBadge}>
            {tradeline.accountType}
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
              value={tradeline.accountNumber}
            />
            <ActualDataRow label="Account Type" value={tradeline.accountType} />
            <ActualDataRow label="Status" value={tradeline.status} />
            <ActualDataRow label="Balance" value={tradeline.balance} />
            <ActualDataRow label="High Credit" value={tradeline.amounts?.high} />
            <ActualDataRow label="Past Due" value={tradeline.amounts?.pastDue} />
            <ActualDataRow
              label="Opened"
              value={
                tradeline.dates?.opened
                  ? format(new Date(tradeline.dates.opened), "MMM d, yyyy")
                  : null
              }
            />
            <ActualDataRow
              label="Reported"
              value={
                tradeline.dates?.reported
                  ? format(new Date(tradeline.dates.reported), "MMM d, yyyy")
                  : null
              }
            />
            <ActualDataRow
              label="Closed"
              value={
                tradeline.dates?.closed
                  ? format(new Date(tradeline.dates.closed), "MMM d, yyyy")
                  : null
              }
            />
            <ActualDataRow
              label="DOFD"
              value={
                tradeline.dates?.dofd
                  ? format(new Date(tradeline.dates.dofd), "MMM d, yyyy")
                  : null
              }
            />
            <ActualDataRow
              label="Remark Codes"
              value={tradeline.remarkCodes?.join(", ")}
            />
            {tradeline.originalCreditorName && (
              <ActualDataRow
                label="Original Creditor"
                value={tradeline.originalCreditorName}
              />
            )}
          </tbody>
        </table>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}