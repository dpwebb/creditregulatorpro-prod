import { useState, useEffect } from "react";
import { Input } from "./Input";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Eye, RotateCcw, Check, AlertCircle } from "lucide-react";
import { ExtractedValue } from "../helpers/passAExtractorTypes";
import { useCasePatch } from "../helpers/useCaseReview";
import styles from "./ReviewField.module.css";

// Helper to get nested value safely
function getNestedValue(obj: any, path: string): any {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

interface ReviewFieldProps {
  artifactId: number;
  path: string; // Path to the ExtractedValue object (e.g. "consumer_profile.legal_name.given_name")
  label: string;
  effectiveData: any;
  originalData: any;
  readOnly?: boolean;
  type?: "text" | "number" | "date";
}

export const ReviewField = ({
  artifactId,
  path,
  label,
  effectiveData,
  originalData,
  readOnly = false,
  type = "text",
}: ReviewFieldProps) => {
  const { mutate: patch, isPending } = useCasePatch(artifactId);
  
  // Get the ExtractedValue objects
  const effectiveExtractedValue = getNestedValue(effectiveData, path) as ExtractedValue<any> | undefined;
  const originalExtractedValue = getNestedValue(originalData, path) as ExtractedValue<any> | undefined;

  // The actual value we want to edit is inside the .value property
  const currentValue = effectiveExtractedValue?.value ?? "";
  const originalValue = originalExtractedValue?.value ?? "";
  
  const [inputValue, setInputValue] = useState<string | number>(currentValue);
  const [isFocused, setIsFocused] = useState(false);

  // Sync local state when data changes from outside (e.g. after patch)
  useEffect(() => {
    setInputValue(currentValue);
  }, [currentValue]);

  const isEdited = JSON.stringify(currentValue) !== JSON.stringify(originalValue);
  const evidence = effectiveExtractedValue?.evidence || originalExtractedValue?.evidence;
  const confidence = effectiveExtractedValue?.confidence ?? 0;

  const handleBlur = () => {
    setIsFocused(false);
    
    // Only patch if value changed
    if (inputValue !== currentValue) {
      patch([
        {
          path: `${path}.value`,
          op: "set",
          value: type === "number" ? Number(inputValue) : inputValue,
          source: {
            type: "human_edit",
            timestamp: new Date().toISOString(),
          },
          reason: "User manual edit in review UI",
        },
      ]);
    }
  };

  const handleRevert = () => {
    patch([
      {
        path: `${path}.value`,
        op: "unset",
        source: {
          type: "human_edit",
          timestamp: new Date().toISOString(),
        },
        reason: "User reverted to original",
      },
    ]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        <label className={styles.label} title={path}>{label}</label>
        <div className={styles.indicators}>
          {isEdited && (
            <Badge variant="warning" className={styles.editedBadge}>
              Edited
            </Badge>
          )}
          {evidence && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon-sm" className={styles.evidenceBtn} title="View Evidence">
                  <Eye size={14} />
                </Button>
              </PopoverTrigger>
              <PopoverContent className={styles.evidencePopover}>
                <div className={styles.evidenceHeader}>
                  <span className={styles.evidenceTitle}>Provenance Evidence</span>
                  <Badge variant={confidence > 0.8 ? "success" : confidence > 0.5 ? "warning" : "error"}>
                    {Math.round(confidence * 100)}% Conf.
                  </Badge>
                </div>
                <div className={styles.evidenceBody}>
                  <div className={styles.evidenceRow}>
                    <span className={styles.evidenceLabel}>Source:</span>
                    <span>{evidence.source_method} (Page {evidence.page_number})</span>
                  </div>
                  <div className={styles.evidenceSnippet}>
                    "{evidence.snippet}"
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      
      <div className={styles.inputWrapper}>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          disabled={readOnly || isPending}
          className={`${styles.input} ${isEdited ? styles.inputEdited : ""}`}
          type={type}
        />
        
        {isEdited && (
          <Button 
            variant="ghost" 
            size="icon-sm" 
            className={styles.revertBtn} 
            onClick={handleRevert}
            title="Revert to original"
            disabled={isPending}
          >
            <RotateCcw size={14} />
          </Button>
        )}
      </div>
    </div>
  );
};