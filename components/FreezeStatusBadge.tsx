import React from "react";
import { Badge } from "./Badge";
import { Shield, ShieldAlert, ShieldCheck, Lock, Clock, Ban } from "lucide-react";
import { FreezeStatus, FreezeType } from "../helpers/schema";
import { getFreezeStatusBadgeColor, formatFreezeStatus, formatFreezeType } from "../helpers/freezeHelpers";
import styles from "./FreezeStatusBadge.module.css";

interface FreezeStatusBadgeProps {
  status: FreezeStatus;
  freezeType?: FreezeType;
  className?: string;
}

export const FreezeStatusBadge = ({ status, freezeType, className }: FreezeStatusBadgeProps) => {
  const badgeColorClass = getFreezeStatusBadgeColor(status);
  
  // Map status to variant for our Badge component
  // We need to extract the color intent from the tailwind class string returned by the helper
  // or just map it manually since our Badge uses specific variants
  let variant: "default" | "success" | "error" | "warning" | "info" | "primary" = "default";
  
  if (status === "active") variant = "success";
  else if (status === "requested") variant = "warning";
  else if (status === "thawed") variant = "info";
  else if (status === "cancelled") variant = "error";
  else if (status === "expired") variant = "default";

  const getIcon = () => {
    if (status === "active") return <ShieldCheck size={12} />;
    if (status === "requested") return <Clock size={12} />;
    if (status === "thawed") return <Lock size={12} />; // Unlocked/Thawed
    if (status === "cancelled") return <Ban size={12} />;
    if (status === "expired") return <ShieldAlert size={12} />;
    return <Shield size={12} />;
  };

  return (
    <Badge variant={variant} className={`${styles.badge} ${className || ""}`}>
      <span className={styles.iconWrapper}>{getIcon()}</span>
      <span>{formatFreezeStatus(status)}</span>
    </Badge>
  );
};

export const FreezeTypeBadge = ({ type, className }: { type: FreezeType; className?: string }) => {
  let variant: "default" | "success" | "error" | "warning" | "info" | "primary" = "default";
  
  if (type === "security_freeze") variant = "primary";
  else if (type === "extended_fraud_alert") variant = "info"; // Purple-ish usually, mapping to info for now
  else variant = "default"; // fraud_alert

  return (
    <Badge variant={variant} className={`${styles.typeBadge} ${className || ""}`}>
      {formatFreezeType(type)}
    </Badge>
  );
};