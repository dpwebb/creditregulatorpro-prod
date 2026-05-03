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
import { useBureauList } from "../helpers/bureauQueries";
import { useCreateFreeze } from "../helpers/freezeQueries";
import { HelpTooltip } from "./HelpTooltip";
import { toast } from "sonner";
import { FreezeType } from "../helpers/schema";
import { Loader2 } from "lucide-react";
import { IdentityTheftReportUpload } from "./IdentityTheftReportUpload";
import {
  VerificationDocumentsSchema,
  isDocumentationComplete,
} from "../helpers/identityTheftDocuments";
import styles from "./CreateFreezeDialog.module.css";

const formSchema = z
  .object({
    bureauId: z.string().min(1, "Please select a bureau"),
    freezeType: z.enum([
      "fraud_alert",
      "extended_fraud_alert",
      "security_freeze",
    ]),
    notes: z.string().optional(),
    verificationDocuments: VerificationDocumentsSchema.nullable().optional(),
  })
  .refine(
    (data) => {
      if (
        data.freezeType === "extended_fraud_alert" &&
        !isDocumentationComplete(data.verificationDocuments)
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Required identity theft documentation is incomplete",
      path: ["verificationDocuments"],
    },
  );

interface CreateFreezeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CreateFreezeDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: CreateFreezeDialogProps) => {
  const { data: bureauData, isLoading: isLoadingBureaus } = useBureauList();
  const createFreezeMutation = useCreateFreeze();

  const form = useForm({
    schema: formSchema,
    defaultValues: {
      bureauId: "",
      freezeType: "fraud_alert",
      notes: "",
      verificationDocuments: null,
    },
  });

  const bureaus = bureauData?.bureaus || [];
  const selectedType = form.values.freezeType;

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    createFreezeMutation.mutate(
      {
        bureauId: parseInt(values.bureauId),
        freezeType: values.freezeType as FreezeType,
        notes: values.notes || null,
        verificationDocuments: values.verificationDocuments || null,
      },
      {
        onSuccess: () => {
          toast.success("Freeze request created successfully");
          onOpenChange(false);
          form.setValues({
            bureauId: "",
            freezeType: "fraud_alert",
            notes: "",
            verificationDocuments: null,
          });
          onSuccess?.();
        },
        onError: (error) => {
          toast.error(`Failed to create freeze: ${error.message}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <DialogTitle>Request Fraud Protection</DialogTitle>
          <DialogDescription>
            Initiate a fraud alert or security freeze with a credit bureau.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className={styles.form}
          >
            <FormItem name="bureauId">
              <FormLabel>Credit Bureau</FormLabel>
              <FormControl>
                <Select
                  value={form.values.bureauId}
                  onValueChange={(val) =>
                    form.setValues((prev) => ({ ...prev, bureauId: val }))
                  }
                  disabled={isLoadingBureaus}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a bureau" />
                  </SelectTrigger>
                  <SelectContent>
                    {bureaus.map((bureau) => (
                      <SelectItem key={bureau.id} value={bureau.id.toString()}>
                        {bureau.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>

            <FormItem name="freezeType">
              <div className={styles.labelWithHelp}>
                <FormLabel>Protection Type</FormLabel>
                <HelpTooltip
                  content={
                    <div className={styles.tooltipContent}>
                      <p>
                        <strong>Initial Fraud Alert:</strong> Lasts 90 days.
                        Requires creditors to verify your identity before
                        extending credit.
                      </p>
                      <p>
                        <strong>Extended Fraud Alert:</strong> Lasts 7 years.
                        Requires a valid Identity Theft Report.
                      </p>
                      <p>
                        <strong>Security Freeze:</strong> Locks your credit file
                        completely. No one can access it without a PIN/thaw.
                      </p>
                    </div>
                  }
                />
              </div>
              <FormControl>
                <Select
                  value={form.values.freezeType}
                  onValueChange={(val) =>
                    form.setValues((prev) => ({
                      ...prev,
                      freezeType: val as any,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fraud_alert">
                      Initial Fraud Alert (90 Days)
                    </SelectItem>
                    <SelectItem value="extended_fraud_alert">
                      Extended Fraud Alert (7 Years)
                    </SelectItem>
                    <SelectItem value="security_freeze">
                      Security Freeze
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>

            {selectedType === "extended_fraud_alert" && (
              <div className={styles.uploadSection}>
                <FormItem name="verificationDocuments">
                  <FormControl>
                    <IdentityTheftReportUpload
                      value={form.values.verificationDocuments}
                      onChange={(docs) => {
                        form.setValues((prev) => ({
                          ...prev,
                          verificationDocuments: docs,
                        }));
                        // Manually trigger validation for this field when changed
                        form.validateField("verificationDocuments");
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>
            )}

            <FormItem name="notes">
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Add any internal notes about this request..."
                  value={form.values.notes || ""}
                  onChange={(e) =>
                    form.setValues((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <DialogFooter>
              <Button
                variant="ghost"
                type="button"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createFreezeMutation.isPending}>
                {createFreezeMutation.isPending && (
                  <Loader2 className="animate-spin" size={16} />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};