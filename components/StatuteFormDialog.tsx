import React, { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { OutputType as ListOutputType } from "../endpoints/statute/list_GET.schema";
import { useStatuteFilterOptions } from "../helpers/statuteQueries";
import styles from "./StatuteFormDialog.module.css";

// Use the correct type from the API schema
type StatuteData = ListOutputType["statutes"][number];

// All Canadian provinces and territories
const CANADIAN_JURISDICTIONS = [
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Prince Edward Island",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Yukon",
  "Nunavut",
  "Federal",
];

// Schema for the form
const formSchema = z.object({
  jurisdiction: z.string().min(1, "Jurisdiction is required"),
  code: z.string().min(1, "Statute code is required (e.g., CRA, P-39.1)"),
  version: z.coerce.number().optional(),
  description: z.string().min(1, "Description is required to identify this statute"),
  responseClockDays: z.coerce.number().positive("Response clock must be a positive number of days"),
  effectiveDate: z.string().min(1, "Effective date is required"),
  sourceUrl: z.string().url("Must be a valid URL (e.g., https://example.com)"),
  sectionReference: z.string().min(1, "Section reference is required (e.g., Section 12(1)(a))"),
});

type FormValues = z.infer<typeof formSchema>;

interface StatuteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialData?: StatuteData;
  onSubmit: (data: FormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function StatuteFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: StatuteFormDialogProps) {
  const { data: filterOptions } = useStatuteFilterOptions();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jurisdiction: "Ontario",
      code: "",
      description: "",
      responseClockDays: 30,
      sourceUrl: "https://",
      sectionReference: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        reset({
          jurisdiction: initialData.jurisdiction,
          code: initialData.code,
          version: initialData.version,
          description: initialData.description || "",
          responseClockDays: initialData.responseClockDays || 0,
          effectiveDate: initialData.effectiveDate
            ? new Date(initialData.effectiveDate).toISOString().split("T")[0]
            : "",
          sourceUrl: initialData.sourceUrl || "",
          sectionReference: initialData.sectionReference || "",
        });
      } else if (mode === "create") {
        reset({
          jurisdiction: "Ontario",
          code: "",
          description: "",
          responseClockDays: 30,
          effectiveDate: new Date().toISOString().split("T")[0],
          sourceUrl: "https://",
          sectionReference: "",
        });
      }
    }
  }, [open, mode, initialData, reset]);

  const handleFormSubmit = async (data: FormValues) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  // Combine hardcoded jurisdictions with dynamic ones from the database
  const allJurisdictions = React.useMemo(() => {
    const jurisdictionSet = new Set(CANADIAN_JURISDICTIONS);
    if (filterOptions?.jurisdictions) {
      filterOptions.jurisdictions.forEach(j => jurisdictionSet.add(j));
    }
    return Array.from(jurisdictionSet).sort();
  }, [filterOptions]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              {mode === "create" ? "Create Statute" : "Edit Statute"}
            </Dialog.Title>
            <Dialog.Close className={styles.closeButton}>
              <X size={20} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(handleFormSubmit)} className={styles.form}>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="jurisdiction">Jurisdiction *</label>
                <select
                  id="jurisdiction"
                  {...register("jurisdiction")}
                  disabled={mode === "edit"}
                  className={styles.input}
                >
                  {allJurisdictions.map(j => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
                {errors.jurisdiction && (
                  <span className={styles.error}>{errors.jurisdiction.message}</span>
                )}
                <span className={styles.helpText}>
                  The province, territory, or federal jurisdiction
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="code">Statute Code *</label>
                <input
                  id="code"
                  {...register("code")}
                  disabled={mode === "edit"}
                  className={styles.input}
                  placeholder="e.g. CRA, P-39.1"
                />
                {errors.code && (
                  <span className={styles.error}>{errors.code.message}</span>
                )}
                <span className={styles.helpText}>
                  The official statute code or abbreviation
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="version">Version</label>
                <input
                  id="version"
                  type="number"
                  {...register("version")}
                  disabled={true}
                  className={styles.input}
                  placeholder={mode === "create" ? "Auto-assigned" : ""}
                />
                <span className={styles.helpText}>
                  {mode === "create" ? "Automatically assigned when created" : "Version cannot be changed"}
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="effectiveDate">Effective Date *</label>
                <input
                  id="effectiveDate"
                  type="date"
                  {...register("effectiveDate")}
                  className={styles.input}
                />
                {errors.effectiveDate && (
                  <span className={styles.error}>{errors.effectiveDate.message}</span>
                )}
                <span className={styles.helpText}>
                  When this version became effective
                </span>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                {...register("description")}
                className={styles.textarea}
                rows={3}
                placeholder="Brief description of what this statute covers"
              />
              {errors.description && (
                <span className={styles.error}>{errors.description.message}</span>
              )}
              <span className={styles.helpText}>
                A clear description to identify this statute's purpose
              </span>
            </div>

            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="responseClockDays">Response Clock (Days) *</label>
                <input
                  id="responseClockDays"
                  type="number"
                  {...register("responseClockDays")}
                  className={styles.input}
                  placeholder="e.g. 30"
                />
                {errors.responseClockDays && (
                  <span className={styles.error}>
                    {errors.responseClockDays.message}
                  </span>
                )}
                <span className={styles.helpText}>
                  Number of days for required response
                </span>
              </div>

              <div className={styles.field}>
                <label htmlFor="sectionReference">Section Reference *</label>
                <input
                  id="sectionReference"
                  {...register("sectionReference")}
                  className={styles.input}
                  placeholder="e.g. Section 12(1)(a)"
                />
                {errors.sectionReference && (
                  <span className={styles.error}>
                    {errors.sectionReference.message}
                  </span>
                )}
                <span className={styles.helpText}>
                  Specific section citation within the statute
                </span>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="sourceUrl">Source URL *</label>
              <input
                id="sourceUrl"
                {...register("sourceUrl")}
                className={styles.input}
                placeholder="https://laws.example.com/statute"
              />
              {errors.sourceUrl && (
                <span className={styles.error}>{errors.sourceUrl.message}</span>
              )}
              <span className={styles.helpText}>
                Link to the official statute text (required for publication)
              </span>
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={styles.cancelButton}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : mode === "create" ? "Create" : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
