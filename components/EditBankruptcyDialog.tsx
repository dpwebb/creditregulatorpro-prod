import React, { useEffect, useState } from "react";
import { z } from "zod";
import { useUpdateBankruptcy, BankruptcyRecordEnhanced } from "../helpers/bankruptcyQueries";
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
  BankruptcyStatusArrayValues,
  BankruptcyType,
  CanadianProvince,
  BankruptcyStatus,
} from "../helpers/schema";
import {
  getProvinceLabel,
  getBankruptcyTypeLabel,
  calculateRetentionPeriod,
  calculateExpectedRemovalDate,
} from "../helpers/bankruptcyRules";
import styles from "./CreateBankruptcyDialog.module.css"; // Reuse styles

const updateSchema = z.object({
  bankruptcyType: z.enum(BankruptcyTypeArrayValues),
  province: z.enum(CanadianProvinceArrayValues),
  status: z.enum(BankruptcyStatusArrayValues),
  filingDate: z.date({ required_error: "Filing date is required" }),
  dischargeDate: z.date().optional(),
  completionDate: z.date().optional(),
  caseNumber: z.string().optional(),
  filingCourt: z.string().optional(),
  tradelineId: z.string().optional(),
  notes: z.string().optional(),
});

interface EditBankruptcyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: BankruptcyRecordEnhanced;
}

export function EditBankruptcyDialog({ open, onOpenChange, record }: EditBankruptcyDialogProps) {
  const { mutate: updateBankruptcy, isPending } = useUpdateBankruptcy();
  const { data: tradelineData } = useTradelineList();
  const { showSuccess, showError } = useToast();

  const form = useForm({
    schema: updateSchema,
    defaultValues: {
      bankruptcyType: record.bankruptcyType,
      province: record.province,
      status: record.status,
      filingDate: typeof record.filingDate === 'string' ? new Date(record.filingDate) : record.filingDate,
      dischargeDate: record.dischargeDate ? (typeof record.dischargeDate === 'string' ? new Date(record.dischargeDate) : record.dischargeDate) : undefined,
      completionDate: record.completionDate ? (typeof record.completionDate === 'string' ? new Date(record.completionDate) : record.completionDate) : undefined,
      caseNumber: record.caseNumber || "",
      filingCourt: record.filingCourt || "",
      notes: record.notes || "",
      tradelineId: record.tradelineId ? String(record.tradelineId) : "_empty",
    },
  });

  // Reset form when record changes
  useEffect(() => {
    if (open && record) {
      form.setValues({
        bankruptcyType: record.bankruptcyType,
        province: record.province,
        status: record.status,
        filingDate: typeof record.filingDate === 'string' ? new Date(record.filingDate) : record.filingDate,
        dischargeDate: record.dischargeDate ? (typeof record.dischargeDate === 'string' ? new Date(record.dischargeDate) : record.dischargeDate) : undefined,
        completionDate: record.completionDate ? (typeof record.completionDate === 'string' ? new Date(record.completionDate) : record.completionDate) : undefined,
        caseNumber: record.caseNumber || "",
        filingCourt: record.filingCourt || "",
        notes: record.notes || "",
        tradelineId: record.tradelineId ? String(record.tradelineId) : "_empty",
      });
    }
  }, [open, record, form.setValues]);

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

  const onSubmit = (values: z.infer<typeof updateSchema>) => {
    updateBankruptcy(
      {
        id: record.id,
        ...values,
        tradelineId: values.tradelineId && values.tradelineId !== "_empty" ? Number(values.tradelineId) : null,
        dischargeDate: values.dischargeDate || null,
        completionDate: values.completionDate || null,
        caseNumber: values.caseNumber || null,
        filingCourt: values.filingCourt || null,
        notes: values.notes || null,
      },
      {
        onSuccess: () => {
          showSuccess("Bankruptcy record updated successfully");
          onOpenChange(false);
        },
        onError: (err) => {
          showError(err.message || "Failed to update record");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Edit Bankruptcy Record</DialogTitle>
          <DialogDescription>
            Update details for this insolvency event.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.container}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className={styles.form}>
              <div className={styles.row}>
                <FormItem name="status" className={styles.flex1}>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.status}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, status: val as BankruptcyStatus }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {BankruptcyStatusArrayValues.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>

                <FormItem name="bankruptcyType" className={styles.flex1}>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.bankruptcyType}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, bankruptcyType: val as BankruptcyType }))}
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
              </div>

              <div className={styles.row}>
                <FormItem name="province" className={styles.flex1}>
                  <FormLabel>Province</FormLabel>
                  <FormControl>
                    <Select
                      value={form.values.province}
                      onValueChange={(val) => form.setValues(prev => ({ ...prev, province: val as CanadianProvince }))}
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
              </div>

              <div className={styles.row}>
                <FormItem name="dischargeDate" className={styles.flex1}>
                  <FormLabel>Discharge Date</FormLabel>
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

                <FormItem name="completionDate" className={styles.flex1}>
                  <FormLabel>Completion Date</FormLabel>
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
              </div>

              <div className={styles.row}>
                <FormItem name="tradelineId" className={styles.flex1}>
                  <FormLabel>Linked Tradeline</FormLabel>
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
              </div>

              <div className={styles.row}>
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
                  {isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}