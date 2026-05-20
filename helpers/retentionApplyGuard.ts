export const RETENTION_APPLY_CONFIRMATION = "APPLY_RETENTION_PURGE" as const;

export type RetentionApplyMode = "preview" | "apply";

export type RetentionApplyInput = {
  mode?: RetentionApplyMode;
  confirmDelete?: boolean;
};

export function isRetentionApplyRequested(input: RetentionApplyInput): boolean {
  return input.mode === "apply" || input.confirmDelete === true;
}
