import React from "react";
import { z } from "zod";
import { format } from "../helpers/dateUtils";
import { Save, Loader2 } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "./Form";
import { Input } from "./Input";
import { Button } from "./Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./Select";
import { OutputType as ProfileData } from "../endpoints/user/profile_GET.schema";
import { normalizePostalCode } from "../helpers/postalCodeUtils";
import styles from "./ProfileForm.module.css";

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

const MONTHS = [
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

export const profileSchema = z.object({
  fullName: z.string().min(1, "Full legal name is required"),
  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1, "City is required"),
  province: z.string().min(1, "Province is required"),
  postalCode: z
    .string()
    .min(1, "Postal code is required")
    .regex(
      /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
      "Invalid Canadian postal code format (e.g. A1A 1A1)"
    ),
  dateOfBirth: z.date().optional().nullable(),
  phone: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || val.length >= 10, {
      message: "Phone number must be at least 10 digits",
    }),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileFormProps {
  initialData: ProfileData;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  isUpdating: boolean;
}

export function ProfileForm({
  initialData,
  onSubmit,
  isUpdating,
}: ProfileFormProps) {
  const form = useForm<typeof profileSchema>({
    schema: profileSchema,
    defaultValues: {
      fullName: initialData.fullName || "",
      addressLine1: initialData.addressLine1 || "",
      addressLine2: initialData.addressLine2 || "",
      city: initialData.city || "",
      province: initialData.province || "",
      postalCode: initialData.postalCode || "",
      dateOfBirth: initialData.dateOfBirth
        ? new Date(initialData.dateOfBirth)
        : null,
      phone: initialData.phone || "",
    },
  });

  // Local state for split DOB fields
  const [dobMonth, setDobMonth] = React.useState<string>(
    initialData.dateOfBirth
      ? new Date(initialData.dateOfBirth).getUTCMonth().toString()
      : ""
  );
  const [dobDay, setDobDay] = React.useState<string>(
    initialData.dateOfBirth
      ? new Date(initialData.dateOfBirth).getUTCDate().toString()
      : ""
  );
  const [dobYear, setDobYear] = React.useState<string>(
    initialData.dateOfBirth
      ? new Date(initialData.dateOfBirth).getUTCFullYear().toString()
      : ""
  );

  // Sync effect: update form value when local state changes
  React.useEffect(() => {
    // Only try to construct a date if we have some values.
    // However, if all are empty, we might want to set it to null.
    if (!dobMonth && !dobDay && !dobYear) {
      if (form.values.dateOfBirth !== null) {
        form.setValues((prev) => ({ ...prev, dateOfBirth: null }));
      }
      return;
    }

    // Basic validation before creating date
    const monthIndex = parseInt(dobMonth, 10);
    const day = parseInt(dobDay, 10);
    const year = parseInt(dobYear, 10);

    if (
      !isNaN(monthIndex) &&
      !isNaN(day) &&
      !isNaN(year) &&
      day > 0 &&
      day <= 31 &&
      year >= 1900 &&
      year <= new Date().getFullYear() &&
      dobYear.length === 4
    ) {
      const newDate = new Date(Date.UTC(year, monthIndex, day));
      // Check if date is valid (e.g., Feb 31 will roll over to March)
      if (
        newDate.getUTCFullYear() === year &&
        newDate.getUTCMonth() === monthIndex &&
        newDate.getUTCDate() === day
      ) {
        // Only update if different to avoid loops (though Date object comparison is tricky, rely on semantic difference)
        const current = form.values.dateOfBirth;
        if (!current || current.getTime() !== newDate.getTime()) {
          form.setValues((prev) => ({ ...prev, dateOfBirth: newDate }));
        }
      } else {
        // Invalid date logic (e.g. Feb 30), effectively invalid
        // We can choose to set it to null or let zod validation catch "invalid date" if we passed that,
        // but since our schema expects Date object, we might just keep the previous valid value or set null.
        // Let's set null so it fails 'required' check if it was required (it's optional in schema though).
        // Since it's optional in schema, clearing it is fine, but maybe we want to show error?
        // The individual fields will show their own validation state visually via HTML5 validation or simple logic below.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dobMonth, dobDay, dobYear]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={styles.formGrid}
      >
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Personal Information</h3>
          <FormItem name="fullName">
            <FormLabel>Full Legal Name *</FormLabel>
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
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          <div className={styles.row}>
            <FormItem name="dateOfBirth" className={styles.halfWidth}>
              <FormLabel>Date of Birth</FormLabel>
              <div className={styles.dobFieldsRow}>
                {/* Month */}
                <div style={{ flex: 2 }}>
                  <Select value={dobMonth} onValueChange={setDobMonth}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Day */}
                <div style={{ flex: 1 }}>
                  <Input
                    placeholder="Day"
                    type="number"
                    min={1}
                    max={31}
                    value={dobDay}
                    onChange={(e) => setDobDay(e.target.value)}
                  />
                </div>

                {/* Year */}
                <div style={{ flex: 1.5 }}>
                  <Input
                    placeholder="Year"
                    type="number"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={dobYear}
                    onChange={(e) => setDobYear(e.target.value)}
                  />
                </div>
              </div>
              <FormMessage />
            </FormItem>

            <FormItem name="phone" className={styles.halfWidth}>
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <Input
                  placeholder="(555) 123-4567"
                  type="tel"
                  value={form.values.phone || ""}
                  onChange={(e) =>
                    form.setValues((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </div>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Address</h3>
          <FormItem name="addressLine1">
            <FormLabel>Address Line 1 *</FormLabel>
            <FormControl>
              <Input
                placeholder="Street address, P.O. box, company name"
                value={form.values.addressLine1}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    addressLine1: e.target.value,
                  }))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          <FormItem name="addressLine2">
            <FormLabel>Address Line 2</FormLabel>
            <FormControl>
              <Input
                placeholder="Apartment, suite, unit, building, floor, etc."
                value={form.values.addressLine2 || ""}
                onChange={(e) =>
                  form.setValues((prev) => ({
                    ...prev,
                    addressLine2: e.target.value,
                  }))
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>

          <div className={styles.row}>
            <FormItem name="city" className={styles.halfWidth}>
              <FormLabel>City *</FormLabel>
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
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <FormItem name="province" className={styles.halfWidth}>
              <FormLabel>Province *</FormLabel>
              <Select
                value={form.values.province || ""}
                onValueChange={(val) =>
                  form.setValues((prev) => ({ ...prev, province: val }))
                }
              >
                <FormControl>
                  <SelectTrigger>
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

          <FormItem name="postalCode" className={styles.halfWidth}>
            <FormLabel>Postal Code *</FormLabel>
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
              />
            </FormControl>
            <FormDescription>Format: A1A 1A1</FormDescription>
            <FormMessage />
          </FormItem>
        </div>

        <div className={styles.actions}>
          <Button type="submit" disabled={isUpdating} size="lg">
            {isUpdating ? (
              <>
                <Loader2 className={styles.spinner} size={18} />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}