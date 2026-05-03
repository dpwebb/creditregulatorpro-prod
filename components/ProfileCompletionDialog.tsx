import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";

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
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "./Form";
import { Input } from "./Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { useUserProfile } from "../helpers/useUserProfile";
import { normalizePostalCode } from "../helpers/postalCodeUtils";
import styles from "./ProfileCompletionDialog.module.css";

const CANADIAN_PROVINCES = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Ontario",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
];

const completionSchema = z.object({
  fullName: z.string().min(1, "Full legal name is required"),
  addressLine1: z.string().min(1, "Address line 1 is required"),
  city: z.string().min(1, "City is required"),
  province: z.string().min(1, "Province is required"),
  postalCode: z
    .string()
    .min(1, "Postal code is required")
    .regex(
      /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
      "Invalid Canadian postal code format (e.g. A1A 1A1)",
    ),
});

type CompletionFormValues = z.infer<typeof completionSchema>;

interface ProfileCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingUserFields: string[];
  onComplete: () => void;
}

export function ProfileCompletionDialog({
  open,
  onOpenChange,
  missingUserFields,
  onComplete,
}: ProfileCompletionDialogProps) {
  const { profile, updateProfile, isUpdating } = useUserProfile();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<typeof completionSchema>({
    schema: completionSchema,
    defaultValues: {
      fullName: "",
      addressLine1: "",
      city: "",
      province: "",
      postalCode: "",
    },
  });

  // Pre-fill form with existing profile data so user doesn't have to re-type known info
  useEffect(() => {
    if (open && profile) {
      form.setValues({
        fullName: profile.fullName || "",
        addressLine1: profile.addressLine1 || "",
        city: profile.city || "",
        province: profile.province || "",
        postalCode: profile.postalCode || "",
      });
    }
  }, [open, profile, form.setValues]);

  const onSubmit = async (values: CompletionFormValues) => {
    setIsSaving(true);
    try {
      // We merge the new values with the existing profile data (which might have other fields like phone/dob)
      // The updateProfile hook handles the API call.
      await updateProfile({
        ...values,
        // Preserve other fields if they exist in profile but aren't in this form
        addressLine2: profile?.addressLine2 || null,
        dateOfBirth: profile?.dateOfBirth || null,
        phone: profile?.phone || null,
      });

      toast.success("Info saved!");

      onComplete();
    } catch (error) {
      console.error("Failed to update profile", error);
      // Toast handled by hook usually, but just in case
    } finally {
      setIsSaving(false);
    }
  };

  const hasMissingUserFields = missingUserFields.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.dialogContent}>
        <DialogHeader>
          <div className={styles.headerIcon}>
            <AlertTriangle size={24} />
          </div>
          <DialogTitle>We Need More Info</DialogTitle>
          <DialogDescription>
            Please fill in what's missing so we can write your dispute letter.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.body}>
          {hasMissingUserFields && (
            <div className={styles.userSection}>
              <p className={styles.sectionTitle}>Your Details</p>
              <p className={styles.sectionSub}>
                Fill in these fields to continue.
              </p>

              <Form {...form}>
                <form
                  id="completion-form"
                  onSubmit={form.handleSubmit(onSubmit)}
                  className={styles.formGrid}
                >
                  <FormItem name="fullName">
                    <FormLabel>Full Legal Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Johnathan Doe"
                        value={form.values.fullName}
                        onChange={(e) =>
                          form.setValues((prev) => ({
                            ...prev,
                            fullName: e.target.value,
                          }))
                        }
                        className={
                          missingUserFields.includes("fullName")
                            ? styles.highlightInput
                            : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>

                  <FormItem name="addressLine1">
                    <FormLabel>Address Line 1</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Street address"
                        value={form.values.addressLine1}
                        onChange={(e) =>
                          form.setValues((prev) => ({
                            ...prev,
                            addressLine1: e.target.value,
                          }))
                        }
                        className={
                          missingUserFields.includes("addressLine1")
                            ? styles.highlightInput
                            : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>

                  <div className={styles.row}>
                    <FormItem name="city" className={styles.halfWidth}>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="City"
                          value={form.values.city}
                          onChange={(e) =>
                            form.setValues((prev) => ({
                              ...prev,
                              city: e.target.value,
                            }))
                          }
                          className={
                            missingUserFields.includes("city")
                              ? styles.highlightInput
                              : ""
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>

                    <FormItem name="province" className={styles.halfWidth}>
                      <FormLabel>Province</FormLabel>
                      <Select
                        value={form.values.province || ""}
                        onValueChange={(val) =>
                          form.setValues((prev) => ({ ...prev, province: val }))
                        }
                      >
                        <FormControl>
                          <SelectTrigger
                            className={
                              missingUserFields.includes("province")
                                ? styles.highlightInput
                                : ""
                            }
                          >
                            <SelectValue placeholder="Select province" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CANADIAN_PROVINCES.map((province) => (
                            <SelectItem key={province} value={province}>
                              {province}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  </div>

                  <FormItem name="postalCode">
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="A1A 1A1"
                        value={form.values.postalCode}
                        onChange={(e) =>
                          form.setValues((prev) => ({
                            ...prev,
                            postalCode: normalizePostalCode(e.target.value),
                          }))
                        }
                        maxLength={7}
                        className={
                          missingUserFields.includes("postalCode")
                            ? styles.highlightInput
                            : ""
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                </form>
              </Form>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isUpdating}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="completion-form"
            disabled={isSaving || isUpdating}
          >
            {isSaving || isUpdating ? (
              <>
                <Loader2 className={styles.spinner} size={16} />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save & Keep Going
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}