import React, { useMemo } from "react";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Snowflake, 
  Activity 
} from "lucide-react";
import { FreezeWithDetails } from "../endpoints/fraud-freeze/list_GET.schema";
import { Skeleton } from "./Skeleton";
import styles from "./FreezeProtectionStats.module.css";

interface FreezeProtectionStatsProps {
  freezes: FreezeWithDetails[];
  isLoading?: boolean;
  className?: string;
}

export const FreezeProtectionStats: React.FC<FreezeProtectionStatsProps> = ({
  freezes,
  isLoading = false,
  className,
}) => {
  const stats = useMemo(() => {
    if (isLoading) return null;

    const activeCount = freezes.filter((f) => f.status === "active").length;
    const pendingCount = freezes.filter((f) => f.status === "requested").length;
    const thawedCount = freezes.filter((f) => f.status === "thawed").length;

    // Calculate coverage
    // We assume the universe of bureaus is the unique set of bureaus found in the freezes list.
    // In a real scenario, we might want to hardcode this to known bureaus (Equifax, TransUnion),
    // but dynamic is safer if new bureaus are added.
    const uniqueBureaus = new Set(freezes.map((f) => f.bureauName));
    const activeBureaus = new Set(
      freezes.filter((f) => f.status === "active").map((f) => f.bureauName)
    );
    
    const totalBureausCount = uniqueBureaus.size || 1; // Avoid division by zero
    const coveragePercent = Math.round((activeBureaus.size / totalBureausCount) * 100);

    return {
      activeCount,
      pendingCount,
      thawedCount,
      coveragePercent,
      totalBureaus: uniqueBureaus.size,
      activeBureaus: activeBureaus.size,
    };
  }, [freezes, isLoading]);

  if (isLoading) {
    return (
      <div className={`${styles.grid} ${className || ""}`}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.card}>
            <div className={styles.cardHeader}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-8 w-16 mt-2" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className={`${styles.grid} ${className || ""}`}>
      <StatCard
        label="Active Protection"
        value={stats.activeCount}
        icon={<ShieldCheck size={20} />}
        trend="Currently secured"
        variant="success"
      />
      <StatCard
        label="Pending Requests"
        value={stats.pendingCount}
        icon={<Activity size={20} />}
        trend="Awaiting processing"
        variant="warning"
      />
      <StatCard
        label="Temporary Thaws"
        value={stats.thawedCount}
        icon={<Snowflake size={20} />}
        trend="Currently accessible"
        variant="info"
      />
      <StatCard
        label="Bureau Coverage"
        value={`${stats.coveragePercent}%`}
        icon={<ShieldAlert size={20} />}
        trend={`${stats.activeBureaus} of ${stats.totalBureaus} bureaus`}
        variant={stats.coveragePercent === 100 ? "success" : stats.coveragePercent > 0 ? "warning" : "error"}
      />
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend: string;
  variant: "success" | "warning" | "info" | "error" | "default";
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  variant,
}) => {
  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.cardHeader}>
        <span className={styles.label}>{label}</span>
        <div className={`${styles.iconWrapper} ${styles[`icon-${variant}`]}`}>
          {icon}
        </div>
      </div>
      <div className={styles.value}>{value}</div>
      <div className={styles.trend}>{trend}</div>
    </div>
  );
};