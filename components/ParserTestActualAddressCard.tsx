import React from "react";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Button } from "./Button";
import { ActualDataRow } from "./ParserTestActualDataRow";
import styles from "./ParserTestResultsPanel.module.css";

interface ActualAddressCardProps {
  address: any;
  index: number;
  onApprove?: () => void;
}

export function ActualAddressCard({
  address,
  index,
  onApprove,
}: ActualAddressCardProps) {
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
            <span>Address #{index + 1}</span>
            {address.city && address.province && (
              <span className="text-xs text-muted-foreground ml-2">
                ({address.city}, {address.province})
              </span>
            )}
          </div>
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
              label="Address Line 1"
              value={address.addressLine1}
            />
            {address.addressLine2 && (
              <ActualDataRow
                label="Address Line 2"
                value={address.addressLine2}
              />
            )}
            <ActualDataRow label="City" value={address.city} />
            <ActualDataRow label="Province" value={address.province} />
            <ActualDataRow label="Postal Code" value={address.postalCode} />
          </tbody>
        </table>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}