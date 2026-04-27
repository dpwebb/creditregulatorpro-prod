import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { HelpTooltip } from "./HelpTooltip";
import styles from "./DashboardEmptyState.module.css";

interface DashboardEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  helpContent?: React.ReactNode;
}

export const DashboardEmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  helpContent,
}: DashboardEmptyStateProps) => {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <Icon size={32} className={styles.icon} />
      </div>
      <div className={styles.content}>
        <h3 className={styles.title}>
          {title}
          {helpContent && <HelpTooltip content={helpContent} className={styles.help} />}
        </h3>
        <p className={styles.description}>{description}</p>
        {action && (
          <Button onClick={action.onClick} variant="outline" size="sm" className={styles.button}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
};