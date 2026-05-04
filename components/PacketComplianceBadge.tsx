import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { format } from "../helpers/dateUtils";
import { useComplianceAudit } from "../helpers/complianceAuditQueries";
import { Badge } from "./Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./Tooltip";
import { Skeleton } from "./Skeleton";
import styles from "./PacketComplianceBadge.module.css";

interface PacketComplianceBadgeProps {
  packetId: number;
  className?: string;
}

export const PacketComplianceBadge = ({
  packetId,
  className,
}: PacketComplianceBadgeProps) => {
  const { data, isLoading, isError } = useComplianceAudit({
    packetId,
    limit: 100, // Fetch enough to show a comprehensive list
    offset: 0,
  }, {
    // Avoid per-row polling load on packets list.
    refetchInterval: false,
  });

  if (isLoading) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <Skeleton className={styles.skeletonBadge} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <Badge variant="error" className={styles.badge}>
          <AlertTriangle size={14} className={styles.icon} />
        </Badge>
      </div>
    );
  }

  const audits = data?.audits || [];
  const count = audits.length;

  if (count === 0) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <Badge variant="default" className={styles.badge}>
          <ShieldAlert size={14} className={styles.icon} />
        </Badge>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={styles.triggerWrapper}>
              <Badge variant="success" className={`${styles.badge} ${styles.verified}`}>
                <ShieldCheck size={14} className={styles.icon} />
                <span className={styles.count}>{count}</span>
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent className={styles.tooltipContent} side="top">
            <div className={styles.tooltipHeader}>
              <span className={styles.tooltipTitle}>Rules Applied</span>
              <span className={styles.tooltipCount}>{count} total</span>
            </div>
            <div className={styles.auditList}>
              {audits.map((audit) => (
                <div key={audit.id} className={styles.auditItem}>
                  <div className={styles.auditHeader}>
                    <span className={styles.statuteCode}>
                      {audit.statuteCode || "Unknown Statute"}
                    </span>
                    {audit.appliedAt && (
                      <span className={styles.auditDate}>
                        {format(new Date(audit.appliedAt), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                  <p className={styles.obligationDesc}>
                    {audit.obligationDescription
                      ? audit.obligationDescription.length > 50
                        ? `${audit.obligationDescription.substring(0, 50)}...`
                        : audit.obligationDescription
                      : "No details"}
                  </p>
                  {audit.statuteSectionReference && (
                    <div className={styles.reference}>
                      Ref: {audit.statuteSectionReference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
