import React, { useState, useEffect } from "react";
import { Selectable } from "kysely";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./Dialog";
import { Button } from "./Button";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import {
  Obligation,
  ObligationSection,
  ObligationSectionArrayValues,
} from "../helpers/schema";
import styles from "./UnifiedObligationFormDialog.module.css";

interface UnifiedObligationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialData?: Selectable<Obligation>;
  onSubmit: (data: {
    description: string;
    obligationType: string | null;
    section: ObligationSection;
    jurisdiction?: string;
    statutoryReference?: string;
    timeframeDays?: number;
    notes?: string;
    dutyType?: string;
    region?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

const SECTION_LABELS: Record<ObligationSection, string> = {
  CREDITOR: "Creditor",
  CREDIT_BUREAU: "Credit Bureau",
  BILL_COLLECTOR: "Bill Collector",
};

export function UnifiedObligationFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: UnifiedObligationFormDialogProps) {
  // Base fields
  const [description, setDescription] = useState("");
  const [obligationType, setObligationType] = useState("");
  const [section, setSection] = useState<ObligationSection>("CREDITOR");

  // Creditor specific fields
  const [jurisdiction, setJurisdiction] = useState("");
  const [statutoryReference, setStatutoryReference] = useState("");
  const [timeframeDays, setTimeframeDays] = useState("");
  const [notes, setNotes] = useState("");
  const [dutyType, setDutyType] = useState("");
  const [region, setRegion] = useState("CA");

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        setDescription(initialData.description);
        setObligationType(initialData.obligationType || "");
        setSection(initialData.section);

        // Populate optional fields
        setJurisdiction(initialData.jurisdiction || "");
        setStatutoryReference(initialData.statutoryReference || "");
        setTimeframeDays(
          initialData.timeframeDays !== null
            ? String(initialData.timeframeDays)
            : ""
        );
        setNotes(initialData.notes || "");
        setDutyType(initialData.dutyType || "");
        setRegion(initialData.region || "CA");
      } else {
        // Reset for create mode
        setDescription("");
        setObligationType("");
        setSection("CREDITOR");
        
        setJurisdiction("");
        setStatutoryReference("");
        setTimeframeDays("");
        setNotes("");
        setDutyType("");
        setRegion("CA"); // Default to CA for new items
      }
    }
  }, [open, mode, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const submissionData: any = {
      description,
      obligationType: obligationType || null,
      section,
    };

    // Include detailed fields only if section is CREDITOR
    if (section === "CREDITOR") {
      if (jurisdiction) submissionData.jurisdiction = jurisdiction;
      if (statutoryReference)
        submissionData.statutoryReference = statutoryReference;
      if (timeframeDays)
        submissionData.timeframeDays = parseInt(timeframeDays, 10);
      if (notes) submissionData.notes = notes;
      if (dutyType) submissionData.dutyType = dutyType;
      if (region) submissionData.region = region;
    }

    await onSubmit(submissionData);
  };

  const showCreditorFields = section === "CREDITOR";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.content}>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Obligation" : "Edit Obligation"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Base Fields */}
          <div className={styles.field}>
            <label htmlFor="description" className={styles.label}>
              Description
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter the regulatory summary..."
              required
              rows={6}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="obligationType" className={styles.label}>
              Type (Optional)
            </label>
            <Input
              id="obligationType"
              value={obligationType}
              onChange={(e) => setObligationType(e.target.value)}
              placeholder="e.g. DISPUTE_RESOLUTION"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="section" className={styles.label}>
              Section
            </label>
            <div className={styles.selectWrapper}>
              <select
                id="section"
                value={section}
                onChange={(e) =>
                  setSection(e.target.value as ObligationSection)
                }
                className={styles.select}
                disabled={mode === "edit"}
              >
                {ObligationSectionArrayValues.map((val) => (
                  <option key={val} value={val}>
                    {SECTION_LABELS[val]}
                  </option>
                ))}
              </select>
            </div>
            {mode === "edit" && (
              <p className={styles.hint}>
                Section cannot be changed after creation.
              </p>
            )}
          </div>

          {/* Conditional Creditor Fields */}
          {showCreditorFields && (
            <div className={styles.extendedFields}>
              <div className={styles.divider} />
              <h4 className={styles.sectionTitle}>Detailed Configuration</h4>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="jurisdiction" className={styles.label}>
                    Jurisdiction
                  </label>
                  <Input
                    id="jurisdiction"
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="e.g. Federal"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="region" className={styles.label}>
                    Region
                  </label>
                  <Input
                    id="region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. CA"
                  />
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="dutyType" className={styles.label}>
                    Duty Type
                  </label>
                  <Input
                    id="dutyType"
                    value={dutyType}
                    onChange={(e) => setDutyType(e.target.value)}
                    placeholder="e.g. Affirmative"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="timeframeDays" className={styles.label}>
                    Timeframe (Days)
                  </label>
                  <Input
                    id="timeframeDays"
                    type="number"
                    value={timeframeDays}
                    onChange={(e) => setTimeframeDays(e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="statutoryReference" className={styles.label}>
                  Statutory Reference
                </label>
                <Textarea
                  id="statutoryReference"
                  value={statutoryReference}
                  onChange={(e) => setStatutoryReference(e.target.value)}
                  placeholder="e.g. 15 U.S.C. § 1681s-2(b)"
                  rows={2}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="notes" className={styles.label}>
                  Notes
                </label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes regarding this obligation..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !description}>
              {isSubmitting
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                ? "Create Obligation"
                : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}