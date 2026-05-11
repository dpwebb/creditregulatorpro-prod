export const USER_DATA_DELETION_CATEGORIES = [
  "profile",
  "identification",
  "creditData",
  "identityProtection",
  "signatures",
  "support",
  "notifications",
  "betaReports",
] as const;

export type UserDataDeletionCategory = (typeof USER_DATA_DELETION_CATEGORIES)[number];

export type UserDataCategorySummary = {
  key: UserDataDeletionCategory;
  label: string;
  description: string;
  count: number;
};

export type UserDataSummary = {
  categories: UserDataCategorySummary[];
  totalCount: number;
};

export type UserDataDeletionResult = {
  success: true;
  purgedCounts: Record<string, number>;
};
