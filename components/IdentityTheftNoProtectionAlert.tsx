import React from "react";
import { AlertCircle } from "lucide-react";
import styles from "./IdentityTheftNoProtectionAlert.module.css";

interface IdentityTheftNoProtectionAlertProps {
  hasActiveProtection: boolean;
  isLoading: boolean;
  className?: string;
}

export const IdentityTheftNoProtectionAlert: React.FC<IdentityTheftNoProtectionAlertProps> = ({
  hasActiveProtection,
  isLoading,
  className = "",
}) => {
  if (isLoading || hasActiveProtection) {
    return null;
  }

  return (
    <div className={`${styles.alert} ${className}`}>
      <AlertCircle className={styles.icon} size={20} />
      <div className={styles.content}>
        <h4 className={styles.title}>Action Required: No Active Protection</h4>
        <p className={styles.description}>
          You currently have no active credit freezes or fraud alerts. We recommend setting up protection across all major Canadian credit bureaus to secure your identity.
        </p>
      </div>
    </div>
  );
};