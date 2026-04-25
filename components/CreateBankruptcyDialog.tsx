import React, { useEffect, useState } from "react";
import { z } from "zod";
import { useCreateBankruptcy } from "../helpers/bankruptcyQueries";
import { useTradelineList } from "../helpers/tradelineQueries";
import { Button } from "./Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "./Dialog";
import {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  useForm,
  FormDescription,
} from "./Form";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { Calendar } from "./Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { HelpTooltip } from "./HelpTooltip";
import { useToast } from "../helpers/useToast";
import { CalendarIcon } from "lucide-react";
import { format } from "../helpers/dateUtils";
import {
  BankruptcyTypeArrayValues,
  CanadianProvinceArrayValues,
  BankruptcyType,
  CanadianProvince,
} from "../helpers/schema";
import {
  getProvinceLabel,
  getBankruptcyTypeLabel,
  calculateRetentionPeriod,
  calculateExpectedRemovalDate,
} from "../helpers/bankruptcyRules";
import styles from "./CreateBankruptcyDialog.module.css";

const createSchema = z.object({
  bankruptcyType: z.enum(BankruptcyTypeArrayValues),
  province: z.enum(CanadianProvinceArrayValues),
  filingDate: z.date({ required_error: "Filing date is required" }),
  dischargeDate: z.date().optional(),
  completionDate: z.date().optional(),
  caseNumber: z.string().optional(),
  filingCourt: z.string().optional(),
  tradelineId: z.string().optional(), // Form uses string for select, convert to number on submit
  notes: z.string().optional(),
}).refine((data) => {
  if (data.dischargeDate && data.filingDate > data.dischargeDate) {
    return false;
  }
  return true;
}, {
  message: "Discharge date cannot be before filing date",
  path: ["dischargeDate"],
}).refine((data) => {
  if (data.completionDate && data.filingDate > data.completionDate) {
    return false;
  }
  return true;
}, {
  message: "Completion date cannot be before filing date",
  path: ["completionDate"],
});

interface CreateBankruptcyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBankruptcyDialog({ open, onOpenChange }: CreateBankruptcyDialogProps) {
  const { mutate: createBankruptcy, isPending } = useCreateBankruptcy();
  const { data: tradelineData } = useTradelineList();
  const { showSuccess, showError } = useToast();

  const form = useForm({
    schema: createSchema,
    defaultValues: {
      bankruptcyType: "BANKRUPTCY_DISCHARGED",
      province: "ON",
      caseNumber: "",
      filingCourt: "",
      notes: "",
      tradelineId: "_empty",
    },
  });

      // Destructure values from form for reactive preview
  const { bankruptcyType: watchedType, province: watchedProvince, filingDate: watchedFiling, dischargeDate: watchedDischarge, completionDate: watchedCompletion } = form.values;

  const [preview, setPreview] = useState<{
    retention: string;
    removalDate: Date | null;
  } | null>(null);

  useEffect(() => {
    if (watchedType && watchedProvince) {
      const retention = calculateRetentionPeriod(
        watchedType as BankruptcyType,
        watchedProvince as CanadianProvince
      );
      
      const removalDate = calculateExpectedRemovalDate(
        watchedFiling,
        watchedDischarge || null,
        watchedCompletion || null,
        watchedType as BankruptcyType,
        watchedProvince as CanadianProvince
      );

      setPreview({
        retention: retention.description,
        removalDate,
      });
    }
  }, [watchedType, watchedProvince, watchedFiling, watchedDischarge, watchedCompletion]);

  const onSubmit = (values: z.infer<typeof createSchema>) => {
    createBankruptcy(
      {
        ...values,
        tradelineId: values.tradelineId && values.tradelineId !== "_empty" ? Number(values.tradelineId) : undefined,
        dischargeDate: values.dischargeDate || null,
        completionDate: values.completionDate || null,
        caseNumber: values.caseNumber || null,
        filingCourt: values.filingCourt || null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => {
          showSuccess("Bankruptcy record created successfully");
          onOpenChange(false);
                    form.setValues({
            bankruptcyType: "BANKRUPTCY_DISCHARGED",
            province: "ON",
            caseNumber: "",
            filingCourt: "",
            notes: "",
            tradelineId: "_empty",
            filingDate: new Date(),
            dischargeDate: undefined,
            completionDate: undefined,
          });
        },
        onError: (err) => {
          showError(err.message || "Failed to create record");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Add Bankruptcy Record</DialogTitle>
          <DialogDescription>
            Track a new insolvency event. Retention periods are calculated automatically based on Canadian regulations.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.container}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
              <div className={styles.row}>
                <FormItem name="bankruptcyType" className={styles.flex1}>
                  <FormLabel>
                    Type
                    <HelpTooltip content="Select the specific type of insolvency. This determines the base retention rule (e.g., 6 years vs 14 years)." />
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.bankruptcyType}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, bankruptcyType: val as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {BankruptcyTypeArrayValues.map((type) => (
                          <SelectItem key={type} value={type}>
                            {getBankruptcyTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>

                <FormItem name="province" className={styles.flex1}>
                  <FormLabel>
                    Province
                    <HelpTooltip content="Province of filing. Some provinces (e.g., PEI, ON) have specific variations in retention periods." />
                  </FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.province}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, province: val as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Province" />
                      </SelectTrigger>
                      <SelectContent>
                        {CanadianProvinceArrayValues.map((prov) => (
                          <SelectItem key={prov} value={prov}>
                            {getProvinceLabel(prov)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>

              <div className={styles.row}>
                <FormItem name="filingDate" className={styles.flex1}>
                  <FormLabel>Filing Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={`${styles.dateButton} ${!form.values.filingDate ? styles.mutedText : ""}`}
                        >
                          {form.values.filingDate ? format(form.values.filingDate, "PPP") : "Pick a date"}
                          <CalendarIcon className={styles.calendarIcon} />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" removeBackgroundAndPadding>
                      <Calendar
                        mode="single"
                        selected={form.values.filingDate}
                        onSelect={(date) => form.setValues(prev => ({ ...prev, filingDate: date as Date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>

                <FormItem name="dischargeDate" className={styles.flex1}>
                  <FormLabel>
                    Discharge Date
                    <HelpTooltip content="Required for calculating removal date for bankruptcies. Must be after filing date." />
                  </FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={`${styles.dateButton} ${!form.values.dischargeDate ? styles.mutedText : ""}`}
                        >
                          {form.values.dischargeDate ? format(form.values.dischargeDate, "PPP") : "Pick a date"}
                          <CalendarIcon className={styles.calendarIcon} />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" removeBackgroundAndPadding>
                      <Calendar
                        mode="single"
                        selected={form.values.dischargeDate}
                        onSelect={(date) => form.setValues(prev => ({ ...prev, dischargeDate: date as Date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              </div>

              <div className={styles.row}>
                <FormItem name="completionDate" className={styles.flex1}>
                  <FormLabel>
                    Completion Date
                    <HelpTooltip content="Required for Proposals. The retention clock often starts from this date." />
                  </FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={`${styles.dateButton} ${!form.values.completionDate ? styles.mutedText : ""}`}
                        >
                          {form.values.completionDate ? format(form.values.completionDate, "PPP") : "Pick a date"}
                          <CalendarIcon className={styles.calendarIcon} />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" removeBackgroundAndPadding>
                      <Calendar
                        mode="single"
                        selected={form.values.completionDate}
                        onSelect={(date) => form.setValues(prev => ({ ...prev, completionDate: date as Date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>

                <FormItem name="tradelineId" className={styles.flex1}>
                  <FormLabel>Linked Tradeline (Optional)</FormLabel>
                  <FormControl>
                    <Select
                      value={String(form.values.tradelineId)}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, tradelineId: val }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Tradeline" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_empty">None</SelectItem>
                        {tradelineData?.tradelines.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.accountNumber} - {t.bureauName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>

              <div className={styles.row}>
                <FormItem name="caseNumber" className={styles.flex1}>
                  <FormLabel>Case Number</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. 31-456789" 
                      value={form.values.caseNumber}
                      onChange={(e) => form.setValues(prev => ({ ...prev, caseNumber: e.target.value }))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>

                <FormItem name="filingCourt" className={styles.flex1}>
                  <FormLabel>Filing Court</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. Superior Court of Justice" 
                      value={form.values.filingCourt}
                      onChange={(e) => form.setValues(prev => ({ ...prev, filingCourt: e.target.value }))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>

              <FormItem name="notes">
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Additional details..." 
                    value={form.values.notes}
                    onChange={(e) => form.setValues(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              {/* Calculation Preview */}
              {preview && (
                <div className={styles.previewBox}>
                  <h4 className={styles.previewTitle}>Calculation Preview</h4>
                  <div className={styles.previewRow}>
                    <span className={styles.previewLabel}>Rule:</span>
                    <span className={styles.previewValue}>{preview.retention}</span>
                  </div>
                  <div className={styles.previewRow}>
                    <span className={styles.previewLabel}>Expected Removal:</span>
                    <span className={styles.previewValue}>
                      {preview.removalDate ? format(preview.removalDate, "PPP") : "Pending dates"}
                    </span>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)} type="button">
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating..." : "Create Record"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}