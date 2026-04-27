import { isAfter, isBefore, parseISO } from "./dateUtils";

export interface Metro2VersionInfo {
  version: string;
  releaseDate: Date;
  status: "current" | "deprecated" | "legacy";
  majorChanges: string[];
  deprecatedFields: string[];
  newFields: string[];
  description: string;
}

export const METRO2_VERSION_HISTORY: Metro2VersionInfo[] = [
  {
    version: "2024",
    releaseDate: parseISO("2024-01-01"),
    status: "current",
    description: "Latest standard incorporating new Canadian regulatory compliance rules regarding medical debt reporting.",
    majorChanges: [
      "Enhanced medical debt reporting restrictions",
      "Updated compliance codes for BNPL (Buy Now Pay Later)",
      "Stricter validation on J1/J2 segments for joint accounts",
    ],
    deprecatedFields: ["Special Comment Code 'M' (Medical)"],
    newFields: ["Medical Debt Indicator", "BNPL Payment Schedule Code"],
  },
  {
    version: "2023",
    releaseDate: parseISO("2023-01-01"),
    status: "legacy",
    description: "Introduced natural disaster codes and pandemic-related forbearance reporting standards.",
    majorChanges: [
      "Added Natural Disaster Indicator",
      "Revised forbearance reporting guidelines",
      "Clarified reporting of accommodation periods",
    ],
    deprecatedFields: [],
    newFields: ["Natural Disaster Code", "Deferred Payment Start Date"],
  },
  {
    version: "426",
    releaseDate: parseISO("2005-01-01"), // Approximate adoption era for standard 426
    status: "legacy",
    description: "Standard 426 format widely used for credit reporting prior to modern XML/JSON adoption.",
    majorChanges: [
      "Standardized 426 character fixed-width format",
      "Base Segment definition finalized",
      "J1/J2 Segment introduction for joint holders",
    ],
    deprecatedFields: ["Old 13-month payment history format"],
    newFields: ["Consumer Information Indicator", "ECOA Code"],
  },
  {
    version: "430",
    releaseDate: parseISO("2018-01-01"), // Approximate update
    status: "legacy",
    description: "Extended format allowing for expanded address fields and international compatibility.",
    majorChanges: [
      "Expanded address fields to support longer street names",
      "Added support for international postal codes",
    ],
    deprecatedFields: [],
    newFields: ["L2 Segment (Employment Information)", "N1 Segment (Name Append)"],
  },
];

/**
 * Returns the version info for a specific Metro2 version string.
 */
export function getVersionFeatures(version: string): Metro2VersionInfo | null {
  return METRO2_VERSION_HISTORY.find((v) => v.version === version) || null;
}

/**
 * Returns a list of versions that support a specific field.
 * This is a heuristic check based on newFields and deprecatedFields lists.
 * 
 * Logic:
 * - If a field is in `newFields` of version X, it is supported in X and all subsequent versions (by date),
 *   UNLESS it appears in `deprecatedFields` of a later version.
 * - If a field is not explicitly mentioned in `newFields` of any version, we assume it's a base field supported by all,
 *   UNLESS it appears in `deprecatedFields`.
 */
export function getFieldSupportedVersions(fieldName: string): string[] {
  // Sort versions by date ascending
  const sortedVersions = [...METRO2_VERSION_HISTORY].sort((a, b) => 
    a.releaseDate.getTime() - b.releaseDate.getTime()
  );

  const supportedVersions: string[] = [];
  let isSupported = true; // Default assumption for base fields not mentioned

  // Check if it's introduced in any specific version
  const introductionVersion = sortedVersions.find(v => v.newFields.includes(fieldName));
  if (introductionVersion) {
    isSupported = false; // It wasn't supported before this
  }

  for (const v of sortedVersions) {
    // If we hit the introduction version, it becomes supported
    if (v.newFields.includes(fieldName)) {
      isSupported = true;
    }

    // If we hit a deprecation, it stops being supported
    if (v.deprecatedFields.includes(fieldName)) {
      isSupported = false;
    }

    if (isSupported) {
      supportedVersions.push(v.version);
    }
  }

  return supportedVersions;
}