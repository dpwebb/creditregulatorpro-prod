import React from "react";
import { useStatutes } from "../helpers/statuteQueries";
import { FileText, CheckCircle, Archive, Globe } from "lucide-react";
import { Skeleton } from "./Skeleton";
import styles from "./StatuteStats.module.css";

interface StatuteStatsProps {
  className?: string;
}

export function StatuteStats({ className }: StatuteStatsProps) {
  const { data, isFetching } = useStatutes({ includeSuperseded: true });

  if (isFetching) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <Skeleton style={{ height: "100px" }} />
        <Skeleton style={{ height: "100px" }} />
        <Skeleton style={{ height: "100px" }} />
        <Skeleton style={{ height: "100px" }} />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const totalStatutes = data.statutes.length;
  const activeVersions = data.statutes.filter(s => s.lifecycleStatus === "ACTIVE").length;
  const amendedVersions = data.statutes.filter(s => s.lifecycleStatus === "AMENDED").length;
  const repealedVersions = data.statutes.filter(s => s.lifecycleStatus === "REPEALED").length;
  const uniqueJurisdictions = new Set(data.statutes.map(s => s.jurisdiction)).size;

  const stats = [
    {
      label: "Total Versions",
      value: totalStatutes,
      icon: FileText,
      color: "var(--primary)",
    },
    {
      label: "Active",
      value: activeVersions,
      icon: CheckCircle,
      color: "var(--success)",
    },
    {
      label: "Amended",
      value: amendedVersions,
      icon: Archive,
      color: "var(--warning)",
    },
    {
      label: "Repealed",
      value: repealedVersions,
      icon: Archive,
      color: "var(--muted-foreground)",
    },
    {
      label: "Jurisdictions",
      value: uniqueJurisdictions,
      icon: Globe,
      color: "var(--secondary)",
    },
  ];

  return (
    <div className={`${styles.container} ${className || ""}`}>
      {stats.map((stat) => (
        <div key={stat.label} className={styles.card}>
          <div className={styles.iconWrapper} style={{ color: stat.color }}>
            <stat.icon size={24} />
          </div>
          <div className={styles.content}>
            <div className={styles.value}>{stat.value}</div>
            <div className={styles.label}>{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
