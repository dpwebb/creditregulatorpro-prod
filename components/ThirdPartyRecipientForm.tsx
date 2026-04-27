import React from "react";
import { Switch } from "./Switch";
import { Input } from "./Input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import styles from "./ThirdPartyRecipientForm.module.css";

export interface ThirdPartyRecipientValues {
  recipientName: string;
  recipientAddressLine1: string;
  recipientAddressLine2: string;
  recipientCity: string;
  recipientProvince: string;
  recipientPostalCode: string;
}

export interface ThirdPartyRecipientFormProps {
  className?: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  values: ThirdPartyRecipientValues;
  onValuesChange: (values: ThirdPartyRecipientValues) => void;
}

const PROVINCES = [
  { value: "AB", label: "Alberta" },
  { value: "BC", label: "British Columbia" },
  { value: "MB", label: "Manitoba" },
  { value: "NB", label: "New Brunswick" },
  { value: "NL", label: "Newfoundland and Labrador" },
  { value: "NS", label: "Nova Scotia" },
  { value: "NT", label: "Northwest Territories" },
  { value: "NU", label: "Nunavut" },
  { value: "ON", label: "Ontario" },
  { value: "PE", label: "Prince Edward Island" },
  { value: "QC", label: "Quebec" },
  { value: "SK", label: "Saskatchewan" },
  { value: "YT", label: "Yukon" },
];

export const ThirdPartyRecipientForm: React.FC<ThirdPartyRecipientFormProps> = ({
  className = "",
  enabled,
  onEnabledChange,
  values,
  onValuesChange,
}) => {
  const handleChange = (field: keyof ThirdPartyRecipientValues, val: string) => {
    onValuesChange({
      ...values,
      [field]: val,
    });
  };

  return (
    <div className={`${styles.container} ${className}`}>
      <div className={styles.header}>
        <div className={styles.switchWrapper}>
          <Switch
            id="third-party-toggle"
            checked={enabled}
            onCheckedChange={onEnabledChange}
          />
        </div>
        <div className={styles.headerText}>
          <label htmlFor="third-party-toggle" className={styles.title}>
            Send to someone other than the credit bureau
          </label>
          <p className={styles.description}>
            Use this to send a letter directly to a creditor, collection agency, or any other third party.
          </p>
        </div>
      </div>

      {enabled && (
        <div className={styles.formGrid}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Who are you sending this to?</label>
            <Input
              required
              placeholder="e.g. Acme Collection Agency"
              value={values.recipientName}
              onChange={(e) => handleChange("recipientName", e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Street Address</label>
            <Input
              required
              placeholder="e.g. 123 Main St"
              value={values.recipientAddressLine1}
              onChange={(e) => handleChange("recipientAddressLine1", e.target.value)}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Apartment, Suite, Unit (Optional)</label>
            <Input
              placeholder="e.g. Apt 4B"
              value={values.recipientAddressLine2}
              onChange={(e) => handleChange("recipientAddressLine2", e.target.value)}
            />
          </div>

          <div className={styles.twoColumns}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>City</label>
              <Input
                required
                placeholder="e.g. Toronto"
                value={values.recipientCity}
                onChange={(e) => handleChange("recipientCity", e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Province</label>
              <Select
                value={values.recipientProvince || undefined}
                onValueChange={(val) => handleChange("recipientProvince", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select province" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PROVINCES.map((prov) => (
                      <SelectItem key={prov.value} value={prov.value}>
                        {prov.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Postal Code</label>
            <Input
              required
              placeholder="e.g. M5V 2H1"
              value={values.recipientPostalCode}
              onChange={(e) => handleChange("recipientPostalCode", e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};