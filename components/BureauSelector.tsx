import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { Skeleton } from "./Skeleton";
import { HelpTooltip } from "./HelpTooltip";
import { useBureauDisputeContacts } from "../helpers/useBureauDisputeContacts";
import { BureauDisputeContact } from "../endpoints/bureau/dispute-contacts_GET.schema";
import styles from "./BureauSelector.module.css";

export type BureauDisputeInfo = Pick<BureauDisputeContact, "id" | "name" | "disputeAddress">;

interface BureauSelectorProps {
  value: number | null;
  onChange: (bureauId: number | null, bureauInfo?: BureauDisputeInfo) => void;
  disabled?: boolean;
  showAddress?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
}

export const BureauSelector: React.FC<BureauSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  showAddress = true,
  label = "Credit Bureau",
  placeholder = "Select a bureau...",
  className,
}) => {
  const { data: bureaus, isLoading, error } = useBureauDisputeContacts();

  const selectedBureau = bureaus?.find((b) => b.id === value);

  const handleValueChange = (newValue: string) => {
    if (newValue === "_empty") {
      onChange(null);
      return;
    }

    const id = parseInt(newValue, 10);
    const bureau = bureaus?.find((b) => b.id === id);
    
    if (bureau) {
      onChange(id, {
        id: bureau.id,
        name: bureau.name,
        disputeAddress: bureau.disputeAddress,
      });
    } else {
      onChange(id);
    }
  };

  if (isLoading) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        {label && <div className={styles.labelSkeleton}><Skeleton style={{ width: "100px", height: "1rem" }} /></div>}
        <Skeleton className={styles.selectSkeleton} />
        {showAddress && <Skeleton className={styles.addressSkeleton} />}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <div className={styles.error}>Failed to load bureaus</div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      {label && (
        <div className={styles.labelContainer}>
          <label className={styles.label}>{label}</label>
          <HelpTooltip 
            content="Select the credit bureau to direct this dispute to. The official mailing address will be automatically populated." 
          />
        </div>
      )}
      
      <Select
        value={value?.toString() ?? ""}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className={styles.trigger}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {bureaus?.map((bureau) => (
            <SelectItem key={bureau.id} value={bureau.id.toString()}>
              {bureau.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showAddress && selectedBureau && selectedBureau.disputeAddress && (
        <div className={styles.addressCard}>
          <div className={styles.addressHeader}>Official Dispute Address</div>
          <div className={styles.addressContent}>
            <div className={styles.recipientName}>{selectedBureau.disputeAddress.name}</div>
            <div className={styles.department}>{selectedBureau.disputeAddress.department}</div>
            <div>{selectedBureau.disputeAddress.addressLine1}</div>
            {selectedBureau.disputeAddress.addressLine2 && (
              <div>{selectedBureau.disputeAddress.addressLine2}</div>
            )}
            <div>
              {selectedBureau.disputeAddress.city}, {selectedBureau.disputeAddress.province}{" "}
              {selectedBureau.disputeAddress.postalCode}
            </div>
          </div>
        </div>
      )}
      
      {showAddress && selectedBureau && !selectedBureau.disputeAddress && (
        <div className={styles.noAddressWarning}>
          No official dispute address found for this bureau.
        </div>
      )}
    </div>
  );
};