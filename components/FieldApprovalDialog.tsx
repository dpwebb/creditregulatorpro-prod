import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./Dialog";
import { Button } from "./Button";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";
import { Input } from "./Input";
import { Checkbox } from "./Checkbox";
import {
  FieldExpectation,
  ValidationMode,
  getDefaultModeForField,
  getDefaultPatternForField,
  CANADIAN_POSTAL_CODE_PATTERN,
} from "../helpers/parserValidationModes";
import styles from "./FieldApprovalDialog.module.css";

interface FieldApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldName: string;
  extractedValue: any;
  fieldType: "consumerInfo" | "tradeline";
  onApprove: (expectation: FieldExpectation) => void;
}

export const FieldApprovalDialog: React.FC<FieldApprovalDialogProps> = ({
  open,
  onOpenChange,
  fieldName,
  extractedValue,
  fieldType,
  onApprove,
}) => {
  const [mode, setMode] = useState<ValidationMode>("presence");
  const [pattern, setPattern] = useState<string>("");
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");
  const [addToKnownEntities, setAddToKnownEntities] = useState<boolean>(false);

  // Initialize defaults when dialog opens or field changes
  useEffect(() => {
    if (open) {
      const defaultMode = getDefaultModeForField(fieldName);
      setMode(defaultMode);
      
      const defaultPattern = getDefaultPatternForField(fieldName);
      if (defaultPattern) {
        setPattern(defaultPattern);
      } else {
        setPattern("");
      }
      
      setMin("");
      setMax("");
      setAddToKnownEntities(false);
    }
  }, [open, fieldName]);

  const handleSave = () => {
    const expectation: FieldExpectation = {
      mode,
    };

    switch (mode) {
      case "exact":
        expectation.value = extractedValue;
        expectation.addToKnownEntities = addToKnownEntities;
        break;
      case "format":
        expectation.pattern = pattern;
        break;
      case "numeric":
        if (min !== "") expectation.min = Number(min);
        if (max !== "") expectation.max = Number(max);
        break;
      case "presence":
        // Could add minLength here if needed, defaulting to 1 for now implicitly by logic
        expectation.minLength = 1;
        break;
      case "skip":
        break;
    }

    onApprove(expectation);
    onOpenChange(false);
  };

  const isKnownEntityField =
    fieldType === "tradeline" &&
    (fieldName.toLowerCase().includes("creditor") ||
      fieldName.toLowerCase().includes("status") ||
      fieldName.toLowerCase().includes("accounttype"));

  const renderValuePreview = () => {
    let displayValue = String(extractedValue);
    if (extractedValue === null || extractedValue === undefined) {
      displayValue = "<null>";
    } else if (extractedValue instanceof Date) {
      displayValue = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(extractedValue);
    }

    return (
      <div className={styles.valuePreview}>
        <span className={styles.valueLabel}>Extracted Value:</span>
        <code className={styles.valueCode}>{displayValue}</code>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Approve Field: {fieldName}</DialogTitle>
          <DialogDescription>
            Configure how this field should be validated in future test runs.
          </DialogDescription>
        </DialogHeader>

        {renderValuePreview()}

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Validation Mode</h4>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as ValidationMode)}
            className={styles.radioGroup}
          >
            {/* Exact Match */}
            <div className={styles.radioItem}>
              <div className={styles.radioHeader}>
                <RadioGroupItem value="exact" id="mode-exact" />
                <label htmlFor="mode-exact" className={styles.radioLabel}>
                  Exact Match
                </label>
              </div>
              <p className={styles.radioDescription}>
                Must equal this specific value exactly.
              </p>
              {mode === "exact" && isKnownEntityField && (
                <div className={styles.nestedOption}>
                  <Checkbox
                    id="add-known"
                    checked={addToKnownEntities}
                    onChange={(e) => setAddToKnownEntities(e.target.checked)}
                  />
                  <label htmlFor="add-known">
                    Add to known entities dictionary
                  </label>
                </div>
              )}
            </div>

            {/* Presence */}
            <div className={styles.radioItem}>
              <div className={styles.radioHeader}>
                <RadioGroupItem value="presence" id="mode-presence" />
                <label htmlFor="mode-presence" className={styles.radioLabel}>
                  Presence Required
                </label>
              </div>
              <p className={styles.radioDescription}>
                Must have any non-empty value.
              </p>
            </div>

            {/* Format Pattern */}
            <div className={styles.radioItem}>
              <div className={styles.radioHeader}>
                <RadioGroupItem value="format" id="mode-format" />
                <label htmlFor="mode-format" className={styles.radioLabel}>
                  Format Pattern
                </label>
              </div>
              <p className={styles.radioDescription}>
                Must match a regex pattern.
              </p>
              {mode === "format" && (
                <div className={styles.nestedInput}>
                  <Input
                    placeholder="Regex Pattern (e.g. ^\d{4}$)"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                  />
                  {fieldName.toLowerCase().includes("postal") && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setPattern(CANADIAN_POSTAL_CODE_PATTERN)}
                      className={styles.helperLink}
                    >
                      Use Canadian Postal Code Pattern
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Numeric */}
            <div className={styles.radioItem}>
              <div className={styles.radioHeader}>
                <RadioGroupItem value="numeric" id="mode-numeric" />
                <label htmlFor="mode-numeric" className={styles.radioLabel}>
                  Numeric Range
                </label>
              </div>
              <p className={styles.radioDescription}>
                Must be a valid number within optional range.
              </p>
              {mode === "numeric" && (
                <div className={styles.nestedRow}>
                  <div className={styles.inputGroup}>
                    <label>Min</label>
                    <Input
                      type="number"
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                      placeholder="Any"
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Max</label>
                    <Input
                      type="number"
                      value={max}
                      onChange={(e) => setMax(e.target.value)}
                      placeholder="Any"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Skip */}
            <div className={styles.radioItem}>
              <div className={styles.radioHeader}>
                <RadioGroupItem value="skip" id="mode-skip" />
                <label htmlFor="mode-skip" className={styles.radioLabel}>
                  Skip Validation
                </label>
              </div>
              <p className={styles.radioDescription}>
                Do not validate this field.
              </p>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Approve & Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};