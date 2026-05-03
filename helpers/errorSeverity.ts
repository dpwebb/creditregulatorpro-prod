export const ErrorSeverityValues = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type ErrorSeverity = (typeof ErrorSeverityValues)[number];

