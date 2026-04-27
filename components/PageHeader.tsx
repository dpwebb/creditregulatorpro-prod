import React from "react";
import { UserRole } from "../helpers/schema";
import { RoleBadge } from "./RoleBadge";
import styles from "./PageHeader.module.css";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  role?: UserRole;
  children?: React.ReactNode; // For action buttons
}

export const PageHeader = ({ title, subtitle, role, children }: PageHeaderProps) => {
  return (
    <div className={styles.header}>
      <div className={styles.content}>
        <div className={styles.textContainer}>
          <div className={styles.titleWrapper}>
            <h1 className={styles.title}>{title}</h1>
            {role && <RoleBadge role={role} size="md" />}
          </div>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      <div className={styles.actions}>
        {children}
      </div>
    </div>
  );
};