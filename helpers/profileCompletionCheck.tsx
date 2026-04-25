import { OutputType as ProfileData } from "../endpoints/user/profile_GET.schema";

export const REQUIRED_PROFILE_FIELDS = [
  "fullName",
  "addressLine1",
  "city",
  "province",
  "postalCode",
] as const;

export type RequiredField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export interface ProfileCompletionStatus {
  isComplete: boolean;
  missingFields: RequiredField[];
  completionPercentage: number;
}

/**
 * Checks if a user profile has all the required fields for compliance.
 *
 * @param profile The user profile data to check
 * @returns An object containing completion status, missing fields, and percentage
 */
export function checkProfileCompletion(
  profile: ProfileData | null | undefined
): ProfileCompletionStatus {
  if (!profile) {
    return {
      isComplete: false,
      missingFields: [...REQUIRED_PROFILE_FIELDS],
      completionPercentage: 0,
    };
  }

  const missingFields: RequiredField[] = [];

  for (const field of REQUIRED_PROFILE_FIELDS) {
    const value = profile[field];
    // Check for null, undefined, or empty string (after trimming)
    if (value === null || value === undefined || String(value).trim() === "") {
      missingFields.push(field);
    }
  }

  const totalFields = REQUIRED_PROFILE_FIELDS.length;
  const completedFields = totalFields - missingFields.length;
  const completionPercentage = Math.round((completedFields / totalFields) * 100);

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    completionPercentage,
  };
}

/**
 * Converts a technical field name to a user-friendly label.
 *
 * @param fieldName The field name to convert
 * @returns A human-readable label
 */
export function getFieldLabel(fieldName: string): string {
  switch (fieldName) {
    case "fullName":
      return "Full Legal Name";
    case "addressLine1":
      return "Address Line 1";
    case "city":
      return "City";
    case "province":
      return "Province";
    case "postalCode":
      return "Postal Code";
    default:
      // Fallback: split camelCase and capitalize
      return fieldName
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase());
  }
}