import React from "react";
import { Shield, User } from "lucide-react";
import { Badge } from "./Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./Tooltip";
import { UserRole } from "../helpers/schema";
import styles from "./RoleBadge.module.css";

interface RoleBadgeProps {
  role: UserRole;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTooltip?: boolean;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({
  role,
  size = "md",
  className,
  showTooltip = true,
}) => {
  const config = {
    admin: {
      icon: Shield,
      label: "Admin",
      variant: "error" as const, // Using error variant for red/destructive look
      description: "Full system access and administrative privileges",
    },
    user: {
      icon: User,
      label: "User",
      variant: "default" as const,
      description: "Standard user access",
    },
  };

  const { icon: Icon, label, variant, description } = config[role];

  const badgeContent = (
    <Badge
      variant={variant}
      className={`${styles.badge} ${styles[size]} ${className || ""}`}
    >
      <Icon className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </Badge>
  );

  if (!showTooltip) return badgeContent;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={styles.triggerWrapper}>{badgeContent}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p className={styles.tooltipText}>{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};