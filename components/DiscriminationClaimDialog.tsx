import React, { useEffect } from "react";
import { useForm } from "./Form";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./Dialog";
import { Button } from "./Button";
import {
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from "./Form";
import { Textarea } from "./Textarea";
import { Checkbox } from "./Checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Calendar } from "./Calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "../helpers/dateUtils";
import {
  useCreateDiscriminationClaim,
  useUpdateDiscriminationClaim,
} from "../helpers/useDiscriminationClaims";
import { DiscriminationClaimWithDetails } from "../endpoints/discrimination/list_GET.schema";
import { DiscriminationGround } from "../helpers/schema";
import { toast } from "sonner";
import styles from "./DiscriminationClaimDialog.module.css";

// Mapping for user-friendly labels
const GROUND_LABELS: Record<DiscriminationGround, string> = {
  RACE: "Race",
  NATIONAL_ETHNIC_ORIGIN: "National/Ethnic Origin",
  COLOUR: "Colour",
  RELIGION: "Religion",
  AGE: "Age",
  SEX: "Sex",
  SEXUAL_ORIENTATION: "Sexual Orientation",
  GENDER_IDENTITY_EXPRESSION: "Gender Identity/Expression",
  MARITAL_STATUS: "Marital Status",
  FAMILY_STATUS: "Family Status",
  GENETIC_CHARACTERISTICS: "Genetic Characteristics",
  DISABILITY: "Disability",
  CONVICTION_PARDONED: "Conviction (Pardoned)",
  OTHER: "Other",
};

const formSchema = z.object({
  grounds: z.array(z.string()).min(1, "Select at least one ground"),
  description: z.string().optional(),
  evidenceSummary: z.string().optional(),
  allegedDiscriminationDate: z.date().optional(),
  status: z.string().optional(),
  resolution: z.string().optional(),
});

interface DiscriminationClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradelineId: number;
  claim?: DiscriminationClaimWithDetails; // If provided, we are in edit mode
  obligationInstanceId?: number;
  packetId?: number;
  onSuccess?: () => void;
}

export function DiscriminationClaimDialog({
  open,
  onOpenChange,
  tradelineId,
  claim,
  obligationInstanceId,
  packetId,
  onSuccess,
}: DiscriminationClaimDialogProps) {
  const isEditMode = !!claim;
  const createMutation = useCreateDiscriminationClaim();
  const updateMutation = useUpdateDiscriminationClaim();

  const form = useForm({
    schema: formSchema,
    defaultValues: {
      grounds: [],
      description: "",
      evidenceSummary: "",
      status: "REPORTED",
      resolution: "",
    },
  });

  // Reset form when dialog opens or claim changes
  useEffect(() => {
    if (open) {
      if (claim) {
        form.setValues({
          grounds: claim.grounds || [],
          description: claim.description || "",
          evidenceSummary: claim.evidenceSummary || "",
          allegedDiscriminationDate: claim.allegedDiscriminationDate
            ? new Date(claim.allegedDiscriminationDate)
            : undefined,
          status: claim.status || "REPORTED",
          resolution: claim.resolution || "",
        });
      } else {
        form.setValues({
          grounds: [],
          description: "",
          evidenceSummary: "",
          allegedDiscriminationDate: undefined,
          status: "REPORTED",
          resolution: "",
        });
      }
    }
  }, [open, claim, form.setValues]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      if (isEditMode && claim) {
        await updateMutation.mutateAsync({
          id: claim.id,
          grounds: values.grounds as DiscriminationGround[],
          description: values.description,
          evidenceSummary: values.evidenceSummary,
          status: values.status,
          resolution: values.resolution,
          // Note: update schema doesn't support allegedDiscriminationDate update currently based on schema provided,
          // but create does. If needed, backend schema should be updated.
          // For now we only send what's in the update schema.
        });
        toast.success("Claim updated successfully");
      } else {
        await createMutation.mutateAsync({
          tradelineId,
          obligationInstanceId,
          packetId,
          grounds: values.grounds as DiscriminationGround[],
          description: values.description,
          evidenceSummary: values.evidenceSummary,
          allegedDiscriminationDate: values.allegedDiscriminationDate,
        });
        toast.success("Claim reported successfully");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save claim"
      );
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleGroundChange = (ground: string, checked: boolean) => {
    const currentGrounds = form.values.grounds || [];
    if (checked) {
      form.setValues((prev) => ({
        ...prev,
        grounds: [...currentGrounds, ground],
      }));
    } else {
      form.setValues((prev) => ({
        ...prev,
        grounds: currentGrounds.filter((g) => g !== ground),
      }));
    }
    // Trigger validation for grounds
    form.validateField("grounds");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Discrimination Claim" : "Report Discrimination"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the details of the discrimination claim."
              : "File a new claim regarding potential human rights violations."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className={styles.formContainer}
          >
            <div className={styles.scrollArea}>
              <FormItem name="grounds">
                <FormLabel>Grounds of Discrimination</FormLabel>
                <FormDescription>
                  Select all grounds that apply to this claim.
                </FormDescription>
                <div className={styles.groundsGrid}>
                  {Object.entries(GROUND_LABELS).map(([value, label]) => (
                    <div key={value} className={styles.checkboxItem}>
                      <Checkbox
                        id={`ground-${value}`}
                        checked={form.values.grounds?.includes(value)}
                        onChange={(e) =>
                          handleGroundChange(value, e.target.checked as boolean)
                        }
                      />
                      <label
                        htmlFor={`ground-${value}`}
                        className={styles.checkboxLabel}
                      >
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>

              <FormItem name="allegedDiscriminationDate">
                <FormLabel>Date of Alleged Discrimination</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={`${styles.dateButton} ${
                          !form.values.allegedDiscriminationDate
                            ? styles.mutedText
                            : ""
                        }`}
                      >
                        {form.values.allegedDiscriminationDate ? (
                          format(form.values.allegedDiscriminationDate, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className={styles.calendarIcon} />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent
                    className={styles.calendarPopover}
                    align="start"
                    removeBackgroundAndPadding
                  >
                    <Calendar
                      mode="single"
                      selected={form.values.allegedDiscriminationDate}
                      onSelect={(date) =>
                        form.setValues((prev) => ({
                          ...prev,
                          allegedDiscriminationDate: date,
                        }))
                      }
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>

              <FormItem name="description">
                <FormLabel>Description of Incident</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe the alleged discrimination in detail..."
                    value={form.values.description}
                    onChange={(e) =>
                      form.setValues((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className={styles.textarea}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              <FormItem name="evidenceSummary">
                <FormLabel>Evidence Summary</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Summarize any supporting evidence available..."
                    value={form.values.evidenceSummary}
                    onChange={(e) =>
                      form.setValues((prev) => ({
                        ...prev,
                        evidenceSummary: e.target.value,
                      }))
                    }
                    className={styles.textarea}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              {isEditMode && (
                <>
                  <div className={styles.separator} />
                  <FormItem name="status">
                    <FormLabel>Status</FormLabel>
                    <Select
                      value={form.values.status}
                      onValueChange={(val) =>
                        form.setValues((prev) => ({ ...prev, status: val }))
                      }
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="REPORTED">Reported</SelectItem>
                        <SelectItem value="UNDER_REVIEW">
                          Under Review
                        </SelectItem>
                        <SelectItem value="ESCALATED">Escalated</SelectItem>
                        <SelectItem value="RESOLVED">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>

                  {form.values.status === "RESOLVED" && (
                    <FormItem name="resolution">
                      <FormLabel>Resolution Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe how this claim was resolved..."
                          value={form.values.resolution}
                          onChange={(e) =>
                            form.setValues((prev) => ({
                              ...prev,
                              resolution: e.target.value,
                            }))
                          }
                          className={styles.textarea}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                </>
              )}
            </div>

            <DialogFooter className={styles.footer}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : isEditMode
                    ? "Update Claim"
                    : "Submit Report"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}