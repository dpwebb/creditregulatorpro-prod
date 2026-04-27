import React from "react";
import { Link } from "react-router-dom";
import { LucideIcon, TrendingUp, Lock } from "lucide-react";
import { useCountAnimation } from "../helpers/useCountAnimation";
import { Skeleton } from "./Skeleton";
import styles from "./DashboardStatCard.module.css";

interface DashboardStatCardProps {
  title: string;
  value?: number | string;
  loading?: boolean;
  icon: LucideIcon;
  link: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  accentColor?: "primary" | "secondary" | "accent" | "success" | "info" | "warning" | "destructive";
  isAdminOnly?: boolean;
  className?: string;
}

export const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  title,
  value,
  loading,
  icon: Icon,
  link,
  trend,
  accentColor = "primary",
  isAdminOnly,
  className = "",
}) => {
  const isNumeric = typeof value === "number";
  const animatedValue = useCountAnimation(isNumeric ? value : undefined);
  const displayValue = isNumeric ? animatedValue : value;

  return (
    <Link to={link} className={`${styles.card} ${styles[accentColor]} ${className}`}>
      <div className={styles.cardContent}>
        <div className={styles.header}>
          <div className={styles.titleWrapper}>
            <span className={styles.title}>{title}</span>
            {isAdminOnly && <Lock className={styles.lockIcon} size={14} />}
          </div>
          <div className={`${styles.iconWrapper} ${styles[`iconWrapper${accentColor.charAt(0).toUpperCase() + accentColor.slice(1)}`]}`}>
            <Icon className={styles.icon} />
          </div>
        </div>
        
        <div className={styles.valueContainer}>
          {loading ? (
            <Skeleton className={styles.valueSkeleton} />
          ) : (
            <span className={styles.value}>{displayValue ?? 0}</span>
          )}
        </div>

        {trend && !loading && (
          <div className={`${styles.trend} ${trend.isPositive ? styles.trendPositive : styles.trendNegative}`}>
            <TrendingUp className={styles.trendIcon} />
            <span>{trend.value}% vs last month</span>
          </div>
        )}
      </div>
      
      <div className={styles.shine} />
    </Link>
  );
};