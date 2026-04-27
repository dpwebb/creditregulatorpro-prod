import React, { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { OutputType as ListOutputType } from "../endpoints/enforcement-mechanism/list_GET.schema";
import { EnforcementMechanismTypeArrayValues } from "../helpers/schema";
import styles from "./EnforcementMechanismDialog.module.css";

// Use the correct type from the API schema
type MechanismData = ListOutputType["mechanisms"][number];

// Schema for the form
const formSchema = z.object({
  jurisdiction: z.string().min(1, "Jurisdiction is required"),
  mechanismType: z.enum(EnforcementMechanismTypeArrayValues, {
    errorMap: () => ({ message: "Mechanism Type is required" }),
  }),
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  statutoryReference: z.string().optional().or(z.literal("")),
  penaltyAmount: z.string().optional().or(z.literal("")),
  contactInfo: z.string().optional().or(z.literal("")),
  websiteUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  filingDeadlineDays: z.coerce
    .number()
    .int()
    .positive("Must be a positive number")
    .optional()
    .or(z.literal(0))
    .or(z.nan())
    .transform((val) => (val === 0 || Number.isNaN(val) ? null : val)),
  notes: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

interface EnforcementMechanismDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialData?: MechanismData;
  onSubmit: (data: FormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function EnforcementMechanismDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: EnforcementMechanismDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jurisdiction: "Federal",
      mechanismType: "PENALTY",
      name: "",
      description: "",
      statutoryReference: "",
      penaltyAmount: "",
      contactInfo: "",
      websiteUrl: "",
      filingDeadlineDays: null,
      notes: "",
    },
  });

  const selectedType = watch("mechanismType");

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        reset({
          jurisdiction: initialData.jurisdiction,
          mechanismType: initialData.mechanismType,
          name: initialData.name,
          description: initialData.description,
          statutoryReference: initialData.statutoryReference || "",
          penaltyAmount: initialData.penaltyAmount || "",
          contactInfo: initialData.contactInfo || "",
          websiteUrl: initialData.websiteUrl || "",
          filingDeadlineDays: initialData.filingDeadlineDays || null,
          notes: initialData.notes || "",
        });
      } else if (mode === "create") {
        reset({
          jurisdiction: "Federal",
          mechanismType: "PENALTY",
          name: "",
          description: "",
          statutoryReference: "",
          penaltyAmount: "",
          contactInfo: "",
          websiteUrl: "",
          filingDeadlineDays: null,
          notes: "",
        });
      }
    }
  }, [open, mode, initialData, reset]);

  const handleFormSubmit = async (data: FormValues) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              {mode === "create"
                ? "New Enforcement Mechanism"
                : "Edit Enforcement Mechanism"}
            </Dialog.Title>
            <Dialog.Close className={styles.closeButton}>
              <X size={20} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(handleFormSubmit)} className={styles.form}>
            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="jurisdiction">Jurisdiction</label>
                <select
                  id="jurisdiction"
                  {...register("jurisdiction")}
                  disabled={mode === "edit"}
                  className={styles.input}
                >
                  <option value="Federal">Federal</option>
                  <option value="Ontario">Ontario</option>
                  <option value="Nova Scotia">Nova Scotia</option>
                  <option value="Quebec">Quebec</option>
                  <option value="British Columbia">British Columbia</option>
                </select>
                {errors.jurisdiction && (
                  <span className={styles.error}>
                    {errors.jurisdiction.message}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="mechanismType">Mechanism Type</label>
                <select
                  id="mechanismType"
                  {...register("mechanismType")}
                  disabled={mode === "edit"}
                  className={styles.input}
                >
                  <option value="PENALTY">Penalty</option>
                  <option value="ENFORCING_BODY">Enforcing Body</option>
                  <option value="COMPLAINT_PROCEDURE">Complaint Procedure</option>
                </select>
                {errors.mechanismType && (
                  <span className={styles.error}>{errors.mechanismType.message}</span>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                {...register("name")}
                className={styles.input}
                placeholder="e.g. Statutory Damages"
              />
              {errors.name && (
                <span className={styles.error}>{errors.name.message}</span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                {...register("description")}
                className={styles.textarea}
                rows={3}
                placeholder="Describe the mechanism..."
              />
              {errors.description && (
                <span className={styles.error}>{errors.description.message}</span>
              )}
            </div>

            <div className={styles.grid}>
              <div className={styles.field}>
                <label htmlFor="statutoryReference">Statutory Reference</label>
                <input
                  id="statutoryReference"
                  {...register("statutoryReference")}
                  className={styles.input}
                  placeholder="e.g. Section 12(1)"
                />
                {errors.statutoryReference && (
                  <span className={styles.error}>
                    {errors.statutoryReference.message}
                  </span>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="websiteUrl">Website URL</label>
                <input
                  id="websiteUrl"
                  {...register("websiteUrl")}
                  className={styles.input}
                  placeholder="https://..."
                />
                {errors.websiteUrl && (
                  <span className={styles.error}>
                    {errors.websiteUrl.message}
                  </span>
                )}
              </div>
            </div>

            {/* Conditional Fields based on Type */}
            {selectedType === "PENALTY" && (
              <div className={styles.field}>
                <label htmlFor="penaltyAmount">Penalty Amount</label>
                <input
                  id="penaltyAmount"
                  {...register("penaltyAmount")}
                  className={styles.input}
                  placeholder="e.g. $1,000 - $5,000"
                />
                {errors.penaltyAmount && (
                  <span className={styles.error}>
                    {errors.penaltyAmount.message}
                  </span>
                )}
              </div>
            )}

            {(selectedType === "ENFORCING_BODY" || selectedType === "COMPLAINT_PROCEDURE") && (
              <div className={styles.field}>
                <label htmlFor="contactInfo">Contact Info</label>
                <textarea
                  id="contactInfo"
                  {...register("contactInfo")}
                  className={styles.textarea}
                  rows={2}
                  placeholder="Address, phone, email..."
                />
                {errors.contactInfo && (
                  <span className={styles.error}>
                    {errors.contactInfo.message}
                  </span>
                )}
              </div>
            )}

            {selectedType === "COMPLAINT_PROCEDURE" && (
              <div className={styles.field}>
                <label htmlFor="filingDeadlineDays">Filing Deadline (Days)</label>
                <input
                  id="filingDeadlineDays"
                  type="number"
                  {...register("filingDeadlineDays")}
                  className={styles.input}
                  placeholder="e.g. 180"
                />
                {errors.filingDeadlineDays && (
                  <span className={styles.error}>
                    {errors.filingDeadlineDays.message}
                  </span>
                )}
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                {...register("notes")}
                className={styles.textarea}
                rows={2}
                placeholder="Internal notes..."
              />
              {errors.notes && (
                <span className={styles.error}>{errors.notes.message}</span>
              )}
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
                {isSubmitting
                  ? "Saving..."
                  : mode === "create"
                  ? "Create"
                  : "Save Changes"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}