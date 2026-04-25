import React from "react";
import { Badge } from "./Badge";
import { LucideIcon } from "lucide-react";
import styles from "./KnowledgeBaseSection.module.css";

interface KnowledgeBaseSectionProps {
  id?: string;
  title: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: "default" | "primary" | "success" | "error" | "warning" | "info";
  children: React.ReactNode;
  className?: string;
}

export const KnowledgeBaseSection = ({
  id,
  title,
  icon: Icon,
  badge,
  badgeVariant = "info",
  children,
  className,
}: KnowledgeBaseSectionProps) => {
  return (
    <section id={id} className={`${styles.section} ${className || ""}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {Icon && <Icon className={styles.icon} size={24} />}
          <h2 className={styles.title}>{title}</h2>
        </div>
        {badge && (
          <Badge variant={badgeVariant} className={styles.badge}>
            {badge}
          </Badge>
        )}
      </div>
      <div className={styles.content}>{children}</div>
    </section>
  );
};