type AuditLogDisplayInput = {
  actionType: string;
  details?: unknown;
};

function detailsAction(details: unknown): string | null {
  if (!details || typeof details !== "object" || !("action" in details)) {
    return null;
  }

  const action = (details as { action?: unknown }).action;
  return typeof action === "string" ? action : null;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAuditActionLabel(log: AuditLogDisplayInput): string {
  const action = detailsAction(log.details);

  if (action === "ACCOUNT_DATA_RESET") {
    return "Account Data Reset";
  }

  if (action === "FULL_ACCOUNT_DELETION") {
    return "Full Account Deletion";
  }

  return humanize(log.actionType);
}

export function getAuditActionBadgeAction(log: AuditLogDisplayInput): string {
  const action = detailsAction(log.details);
  if (action === "ACCOUNT_DATA_RESET") return "UPDATE";
  if (action === "FULL_ACCOUNT_DELETION") return "DELETE";
  return log.actionType;
}
