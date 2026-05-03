import { Link } from "react-router-dom";
import { LucideIcon, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Skeleton } from "./Skeleton";
import styles from "./DashboardMetricCard.module.css";

export interface DashboardMetricCardProps {
  title: string;
  value?: string | number;
  loading?: boolean;
  icon: LucideIcon;
  link?: string;
  accentColor?: "primary" | "secondary" | "accent" | "info" | "warning" | "error";
  trend?: {
    value: number; // percentage
    direction: "up" | "down" | "neutral";
    label?: string; // e.g., "vs last month"
  };
}

export const DashboardMetricCard = ({
  title,
  value,
  loading = false,
  icon: Icon,
  link,
  accentColor = "primary",
  trend,
}: DashboardMetricCardProps) => {
  const content = (
    <>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <div className={`${styles.iconWrapper} ${styles[accentColor]}`}>
          <Icon size={18} />
        </div>
      </div>
      
      <div className={styles.mainContent}>
        {loading ? (
          <Skeleton className={styles.valueSkeleton} />
        ) : (
          <div className={styles.value}>{value ?? "—"}</div>
        )}

        {loading ? (
          <Skeleton className={styles.trendSkeleton} />
        ) : trend ? (
          <div className={`${styles.trend} ${styles[trend.direction]}`}>
            {trend.direction === "up" && <ArrowUpRight size={14} />}
            {trend.direction === "down" && <ArrowDownRight size={14} />}
            {trend.direction === "neutral" && <Minus size={14} />}
            <span className={styles.trendValue}>{Math.abs(trend.value)}%</span>
            {trend.label && <span className={styles.trendLabel}>{trend.label}</span>}
          </div>
        ) : null}
      </div>
    </>
  );

  if (link) {
    return (
      <Link to={link} className={styles.cardLink}>
        {content}
      </Link>
    );
  }

  return <div className={styles.card}>{content}</div>;
};