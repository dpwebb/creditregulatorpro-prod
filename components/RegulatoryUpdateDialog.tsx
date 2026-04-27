import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Calendar as CalendarIcon } from "lucide-react";
import { format } from "../helpers/dateUtils";
import { OutputType as ListOutputType } from "../endpoints/regulatory-update/list_GET.schema";
import {
  RegulatoryChangeTypeArrayValues,
  RegulatoryUpdateSourceArrayValues,
  RegulatoryUpdateStatusArrayValues,
} from "../helpers/schema";
import { CANADIAN_JURISDICTIONS } from "../helpers/canadianJurisdictions";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Calendar } from "./Calendar";
import { Button } from "./Button";
import styles from "./RegulatoryUpdateDialog.module.css";

// Use the correct type from the API schema
type UpdateData = ListOutputType["updates"][number];

// Schema for the form
const formSchema = z.object({
  jurisdiction: z.enum(CANADIAN_JURISDICTIONS, {
    errorMap: () => ({ message: "Jurisdiction is required" }),
  }),
  changeType: z.enum(RegulatoryChangeTypeArrayValues, {
    errorMap: () => ({ message: "Change Type is required" }),
  }),
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().min(1, "Description is required"),
  statutoryReference: z.string().optional().or(z.literal("")),
  source: z.enum(RegulatoryUpdateSourceArrayValues, {
    errorMap: () => ({ message: "Source is required" }),
  }),
  sourceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  effectiveDate: z.date().optional().nullable(),
  status: z.enum(RegulatoryUpdateStatusArrayValues).optional(),
  reviewedBy: z.string().optional().or(z.literal("")),
  impactAssessment: z.string().optional().or(z.literal("")),
  actionRequired: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if ((data.status === "VERIFIED" || data.status === "APPLIED") && !data.effectiveDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date Passed Into Law is required when status is Verified or Applied",
      path: ["effectiveDate"],
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

interface RegulatoryUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit" | "view";
  initialData?: UpdateData;
  onSubmit: (data: FormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function RegulatoryUpdateDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  onSubmit,
  isSubmitting,
}: RegulatoryUpdateDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jurisdiction: "Federal" as const,
      changeType: "NEW_REGULATION",
      title: "",
      description: "",
      statutoryReference: "",
      source: "MANUAL_ENTRY",
      sourceUrl: "",
      effectiveDate: null,
      status: "DETECTED",
      reviewedBy: "",
      impactAssessment: "",
      actionRequired: "",
      notes: "",
    },
  });

  const currentStatus = watch("status");
  const effectiveDate = watch("effectiveDate");

  // Reset form when dialog opens or mode changes
  useEffect(() => {
    if (open) {
      if ((mode === "edit" || mode === "view") && initialData) {
        reset({
          jurisdiction: initialData.jurisdiction as typeof CANADIAN_JURISDICTIONS[number],
          changeType: initialData.changeType,
          title: initialData.title,
          description: initialData.description,
          statutoryReference: initialData.statutoryReference || "",
          source: initialData.source,
          sourceUrl: initialData.sourceUrl || "",
          effectiveDate: initialData.effectiveDate,
          status: initialData.status,
          reviewedBy: initialData.reviewedBy || "",
          impactAssessment: initialData.impactAssessment || "",
          actionRequired: initialData.actionRequired || "",
          notes: initialData.notes || "",
        });
      } else if (mode === "create") {
        reset({
          jurisdiction: "Federal" as const,
          changeType: "NEW_REGULATION",
          title: "",
          description: "",
          statutoryReference: "",
          source: "MANUAL_ENTRY",
          sourceUrl: "",
          effectiveDate: null,
          status: "DETECTED",
          reviewedBy: "",
          impactAssessment: "",
          actionRequired: "",
          notes: "",
        });
      }
    }
  }, [open, mode, initialData, reset]);

  const handleFormSubmit = async (data: FormValues) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  const isReadOnly = mode === "view";

  const formatEnum = (val: string) => val.replace(/_/g, " ");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              {mode === "create"
                ? "Log New Regulatory Update"
                : mode === "edit"
                ? "Edit Regulatory Update"
                : "View Regulatory Update"}
            </Dialog.Title>
            <Dialog.Close className={styles.closeButton}>
              <X size={20} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(handleFormSubmit)} className={styles.form}>
            <div className={styles.scrollArea}>
              {/* Basic Information Section */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Basic Information</h3>
                <div className={styles.grid}>
                  <div className={styles.field}>
                    <label htmlFor="jurisdiction">Jurisdiction</label>
                    <select
                      id="jurisdiction"
                      {...register("jurisdiction")}
                      disabled={isReadOnly}
                      className={styles.input}
                    >
                      {CANADIAN_JURISDICTIONS.map((j) => (
                        <option key={j} value={j}>
                          {j}
                        </option>
                      ))}
                    </select>
                    {errors.jurisdiction && (
                      <span className={styles.error}>
                        {errors.jurisdiction.message}
                      </span>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="changeType">Change Type</label>
                    <select
                      id="changeType"
                      {...register("changeType")}
                      disabled={isReadOnly}
                      className={styles.input}
                    >
                      {RegulatoryChangeTypeArrayValues.map((type) => (
                        <option key={type} value={type}>
                          {formatEnum(type)}
                        </option>
                      ))}
                    </select>
                    {errors.changeType && (
                      <span className={styles.error}>
                        {errors.changeType.message}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="title">Title</label>
                  <input
                    id="title"
                    {...register("title")}
                    disabled={isReadOnly}
                    className={styles.input}
                    placeholder="e.g. New Consumer Protection Act Amendment"
                  />
                  {errors.title && (
                    <span className={styles.error}>{errors.title.message}</span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    {...register("description")}
                    disabled={isReadOnly}
                    className={styles.textarea}
                    rows={3}
                    placeholder="Detailed description of the regulatory change..."
                  />
                  {errors.description && (
                    <span className={styles.error}>
                      {errors.description.message}
                    </span>
                  )}
                </div>

                <div className={styles.field}>
                  <label htmlFor="statutoryReference">Statutory Reference</label>
                  <input
                    id="statutoryReference"
                    {...register("statutoryReference")}
                    disabled={isReadOnly}
                    className={styles.input}
                    placeholder="e.g. Bill C-27, Section 15"
                  />
                </div>
              </div>

              {/* Source & Detection Section */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Source & Detection</h3>
                <div className={styles.grid}>
                  <div className={styles.field}>
                    <label htmlFor="source">Source</label>
                    <select
                      id="source"
                      {...register("source")}
                      disabled={isReadOnly}
                      className={styles.input}
                    >
                      {RegulatoryUpdateSourceArrayValues.map((source) => (
                        <option key={source} value={source}>
                          {formatEnum(source)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label>Date Passed Into Law</label>
                    <span className={styles.helperText}>The date the rule or regulation was officially enacted</span>
                    {isReadOnly ? (
                      <div className={styles.readOnlyValue}>
                        {effectiveDate
                          ? format(effectiveDate, "PPP")
                          : "Not set"}
                      </div>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={`${styles.dateButton} ${
                              !effectiveDate ? styles.placeholder : ""
                            }`}
                          >
                            <CalendarIcon size={16} />
                            {effectiveDate
                              ? format(effectiveDate, "PPP")
                              : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent removeBackgroundAndPadding>
                          <Calendar
                            mode="single"
                            selected={effectiveDate || undefined}
                            onSelect={(date) =>
                              setValue("effectiveDate", date || null)
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    )}
                    {errors.effectiveDate && (
                      <span className={styles.error}>
                        {errors.effectiveDate.message}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="sourceUrl">Source URL</label>
                  <input
                    id="sourceUrl"
                    {...register("sourceUrl")}
                    disabled={isReadOnly}
                    className={styles.input}
                    placeholder="https://..."
                  />
                  {errors.sourceUrl && (
                    <span className={styles.error}>
                      {errors.sourceUrl.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Status & Review Section */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Status & Review</h3>
                <div className={styles.grid}>
                  <div className={styles.field}>
                    <label htmlFor="status">Status</label>
                    <select
                      id="status"
                      {...register("status")}
                      disabled={isReadOnly}
                      className={styles.input}
                    >
                      {RegulatoryUpdateStatusArrayValues.map((status) => (
                        <option key={status} value={status}>
                          {formatEnum(status)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(currentStatus === "UNDER_REVIEW" ||
                    currentStatus === "VERIFIED" ||
                    currentStatus === "APPLIED") && (
                    <div className={styles.field}>
                      <label htmlFor="reviewedBy">Reviewed By</label>
                      <input
                        id="reviewedBy"
                        {...register("reviewedBy")}
                        disabled={isReadOnly}
                        className={styles.input}
                        placeholder="Reviewer Name"
                      />
                    </div>
                  )}
                </div>

                {/* Read-only timestamps for context */}
                {(mode === "edit" || mode === "view") && initialData && (
                  <div className={styles.grid}>
                    <div className={styles.field}>
                      <label>Detected At</label>
                      <div className={styles.readOnlyValue}>
                        {initialData.detectedAt
                          ? format(initialData.detectedAt, "PPP")
                          : "-"}
                      </div>
                    </div>
                    <div className={styles.field}>
                      <label>Applied At</label>
                      <div className={styles.readOnlyValue}>
                        {initialData.appliedAt
                          ? format(initialData.appliedAt, "PPP")
                          : "-"}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Impact & Actions Section */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Impact & Actions</h3>
                <div className={styles.field}>
                  <label htmlFor="impactAssessment">Impact Assessment</label>
                  <textarea
                    id="impactAssessment"
                    {...register("impactAssessment")}
                    disabled={isReadOnly}
                    className={styles.textarea}
                    rows={3}
                    placeholder="Assess the impact on operations..."
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="actionRequired">Action Required</label>
                  <textarea
                    id="actionRequired"
                    {...register("actionRequired")}
                    disabled={isReadOnly}
                    className={styles.textarea}
                    rows={3}
                    placeholder="Required actions to ensure compliance..."
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="notes">Internal Notes</label>
                  <textarea
                    id="notes"
                    {...register("notes")}
                    disabled={isReadOnly}
                    className={styles.textarea}
                    rows={2}
                    placeholder="Additional notes..."
                  />
                </div>
              </div>
            </div>

            <div className={styles.footer}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={styles.cancelButton}
                disabled={isSubmitting}
              >
                {mode === "view" ? "Close" : "Cancel"}
              </button>
              {mode !== "view" && (
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? "Saving..."
                    : mode === "create"
                    ? "Log Update"
                    : "Save Changes"}
                </button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}