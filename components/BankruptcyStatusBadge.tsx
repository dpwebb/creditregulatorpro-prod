import { Badge } from "./Badge";
import { HelpTooltip } from "./HelpTooltip";
import { BankruptcyStatus } from "../helpers/schema";
import styles from "./BankruptcyStatusBadge.module.css";

interface BankruptcyStatusBadgeProps {
  status: BankruptcyStatus;
}

export const BankruptcyStatusBadge = ({ status }: BankruptcyStatusBadgeProps) => {
  let variant: "default" | "success" | "error" | "warning" | "info" | "primary" = "default";
  let tooltip = "";

  switch (status) {
    case "ACTIVE":
      variant = "warning";
      tooltip = "Bankruptcy is currently active and reporting.";
      break;
    case "DISCHARGED":
      variant = "info";
      tooltip = "Debtor has been released from debts. Retention period starts.";
      break;
    case "COMPLETED":
      variant = "success";
      tooltip = "Proposal terms have been fulfilled.";
      break;
    case "PENDING_REMOVAL":
      variant = "error"; // Orange-ish in design system usually, but error is red. Using error for high visibility.
      tooltip = "Retention period has expired. Should be removed from report.";
      break;
    case "REMOVED":
      variant = "default";
      tooltip = "Record has been removed from credit file.";
      break;
  }

  return (
    <div className={styles.wrapper}>
      <Badge variant={variant} className={styles.badge}>
        {status.replace(/_/g, " ")}
      </Badge>
      <HelpTooltip content={tooltip} size={14} className={styles.tooltip} />
    </div>
  );
};