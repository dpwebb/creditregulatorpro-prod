import React, { useState, useEffect } from "react";
import { useForm } from "./Form";
import { z } from "zod";
import { addDays, format } from "../helpers/dateUtils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./Dialog";
import {
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "./Form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { Button } from "./Button";
import { Textarea } from "./Textarea";
import { Input } from "./Input";
import { Calendar } from "./Calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { useRequestThaw } from "../helpers/freezeQueries";
import { toast } from "sonner";
import { FreezeWithDetails } from "../endpoints/fraud-freeze/list_GET.schema";
import { CalendarIcon, Loader2, AlertTriangle } from "lucide-react";
import styles from "./ThawRequestDialog.module.css";

const formSchema = z.object({
  duration: z.string(),
  customDate: z.date().optional(),
  purpose: z.string().min(5, "Please provide a reason for the thaw"),
  creditorName: z.string().optional(),
}).refine((data) => {
  if (data.duration === "custom" && !data.customDate) {
    return false;
  }
  return true;
}, {
  message: "Please select an end date",
  path: ["customDate"],
});

interface ThawRequestDialogProps {
  freeze: FreezeWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ThawRequestDialog = ({
  freeze,
  open,
  onOpenChange,
}: ThawRequestDialogProps) => {
  const requestThawMutation = useRequestThaw();
  
  const form = useForm({
    schema: formSchema,
    defaultValues: {
      duration: "1", // 1 day default
      purpose: "",
      creditorName: "",
    },
  });

  // Reset form when dialog opens/closes or freeze changes
  useEffect(() => {
    if (open) {
      form.setValues({
        duration: "1",
        purpose: "",
        creditorName: "",
        customDate: undefined,
      });
    }
  }, [open, freeze, form.setValues]);

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    if (!freeze) return;

    let thawUntilDate: Date;
    let thawDuration: number | undefined;

    if (values.duration === "custom" && values.customDate) {
      thawUntilDate = values.customDate;
    } else {
      const days = parseInt(values.duration);
      thawDuration = days;
      thawUntilDate = addDays(new Date(), days);
    }

    requestThawMutation.mutate(
      {
        freezeId: freeze.id,
        thawDuration,
        thawUntilDate,
        purpose: values.purpose,
        creditorName: values.creditorName,
      },
      {
        onSuccess: () => {
          toast.success("Thaw request submitted successfully");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(`Failed to request thaw: ${error.message}`);
        },
      }
    );
  };

  const calculateEndDate = () => {
    const duration = form.values.duration;
    if (duration === "custom") {
      return form.values.customDate ? format(form.values.customDate, "PPP") : "Select a date";
    }
    const days = parseInt(duration);
    if (isNaN(days)) return "-";
    return format(addDays(new Date(), days), "PPP");
  };

  if (!freeze) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Request Security Thaw</DialogTitle>
          <DialogDescription>
            Temporarily lift the security freeze for {freeze.bureauName}.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.warningBox}>
          <AlertTriangle size={16} className={styles.warningIcon} />
          <p>
            Thawing your credit exposes your file to inquiries. Only thaw for the minimum time necessary.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className={styles.form}>
            <FormItem name="duration">
              <FormLabel>Thaw Duration</FormLabel>
              <FormControl>
                <Select
                  value={form.values.duration}
                  onValueChange={(val) => form.setValues(prev => ({ ...prev, duration: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">24 Hours</SelectItem>
                    <SelectItem value="3">3 Days</SelectItem>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="custom">Custom Date</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
            </FormItem>

            {form.values.duration === "custom" && (
              <FormItem name="customDate">
                <FormLabel>Thaw Until</FormLabel>
                <FormControl>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`${styles.dateButton} ${!form.values.customDate ? styles.mutedText : ""}`}
                      >
                        <CalendarIcon className={styles.calendarIcon} />
                        {form.values.customDate ? (
                          format(form.values.customDate, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className={styles.calendarContent} align="start" removeBackgroundAndPadding>
                      <Calendar
                        mode="single"
                        selected={form.values.customDate}
                        onSelect={(date) => form.setValues(prev => ({ ...prev, customDate: date }))}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}

            <div className={styles.summaryBox}>
              <span className={styles.summaryLabel}>Freeze will resume on:</span>
              <span className={styles.summaryValue}>{calculateEndDate()}</span>
            </div>

            <FormItem name="creditorName">
              <FormLabel>Creditor Name (Optional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Chase Bank, Amex"
                  value={form.values.creditorName || ""}
                  onChange={(e) => form.setValues(prev => ({ ...prev, creditorName: e.target.value }))}
                />
              </FormControl>
              <FormDescription>
                If known, specifying the creditor can help limit the exposure.
              </FormDescription>
            </FormItem>

            <FormItem name="purpose">
              <FormLabel>Purpose</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Reason for thawing (e.g. applying for mortgage)"
                  value={form.values.purpose}
                  onChange={(e) => form.setValues(prev => ({ ...prev, purpose: e.target.value }))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={requestThawMutation.isPending}>
                {requestThawMutation.isPending && <Loader2 className="animate-spin" size={16} />}
                Request Thaw
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};