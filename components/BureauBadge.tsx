import React from "react";
import { Building2 } from "lucide-react";
import styles from "./BureauBadge.module.css";

interface BureauBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  bureauName: string | null | undefined;
  size?: "sm" | "md" | "lg";
}

export const BureauBadge = React.forwardRef<HTMLDivElement, BureauBadgeProps>(
  ({ bureauName, size = "md", className, ...props }, ref) => {
    const normalizedName = (bureauName || "").toLowerCase().trim();

    let bureauType: "equifax" | "transunion" | "unknown" = "unknown";
    let label = bureauName || "Unknown";

    if (normalizedName.includes("equifax")) {
      bureauType = "equifax";
      label = "Equifax";
    } else if (
      normalizedName.includes("transunion") ||
      normalizedName.includes("trans union")
    ) {
      bureauType = "transunion";
      label = "TransUnion";
    }

    return (
      <div
        ref={ref}
        className={`${styles.badge} ${styles[bureauType]} ${styles[size]} ${
          className || ""
        }`}
        {...props}
      >
        <Building2 className={styles.icon} />
        <span className={styles.label}>{label}</span>
      </div>
    );
  }
);

BureauBadge.displayName = "BureauBadge";