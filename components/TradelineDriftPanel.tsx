import React, { useState } from "react";
import { 
  Activity, 
  AlertTriangle, 
  ArrowRight, 
  Calendar, 
  DollarSign, 
  FileText, 
  Info, 
  Link as LinkIcon,
  RefreshCw, 
  Search 
} from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { useDetectChanges, useDriftLogs } from "../helpers/changeDetectionQueries";
import { formatDate } from "../helpers/formatters";
import { toast } from "sonner";
import styles from "./TradelineDriftPanel.module.css";

interface Props {
  tradelineId: number;
  className?: string;
}

export const TradelineDriftPanel: React.FC<Props> = ({ tradelineId, className }) => {
  const { data, isLoading } = useDriftLogs(tradelineId);
  const detectMutation = useDetectChanges();
  const [filterType, setFilterType] = useState<string>("ALL");

  const handleDetect = () => {
    toast.promise(detectMutation.mutateAsync({ tradelineId }), {
      loading: "Analyzing artifacts for drift...",
      success: (res) => res.summary,
      error: "Failed to run drift analysis",
    });
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "ERROR": return <Badge variant="error">Critical</Badge>;
      case "WARNING": return <Badge variant="warning">Warning</Badge>;
      default: return <Badge variant="info">Info</Badge>;
    }
  };

  const getIconForField = (fieldName: string) => {
    if (["balance", "amountPastDue", "highCredit"].some(f => fieldName.includes(f))) return <DollarSign size={16} />;
    if (fieldName.toLowerCase().includes("date")) return <Calendar size={16} />;
    if (fieldName === "remarks") return <FileText size={16} />;
    return <Activity size={16} />;
  };

  const filteredLogs = data?.logs.filter(log => {
    if (filterType === "ALL") return true;
        if (filterType === "FINANCIAL") return log.fieldName ? ["balance", "amount", "credit"].some(k => log.fieldName!.toLowerCase().includes(k)) : false;
    if (filterType === "TEMPORAL") return log.fieldName ? log.fieldName.toLowerCase().includes("date") : false;
    if (filterType === "STATUS") return log.fieldName === "accountStatus";
    return true;
  });

  return (
    <div className={`${styles.panel} ${className || ""}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Change Check</h3>
          <p className={styles.subtitle}>See what changed between your credit reports</p>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleDetect} 
          disabled={detectMutation.isPending}
        >
          {detectMutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Activity size={16} />}
          Check Now
        </Button>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <button 
            className={`${styles.filterChip} ${filterType === "ALL" ? styles.active : ""}`}
            onClick={() => setFilterType("ALL")}
          >
            All
          </button>
          <button 
            className={`${styles.filterChip} ${filterType === "FINANCIAL" ? styles.active : ""}`}
            onClick={() => setFilterType("FINANCIAL")}
          >
            Financial
          </button>
          <button 
            className={`${styles.filterChip} ${filterType === "TEMPORAL" ? styles.active : ""}`}
            onClick={() => setFilterType("TEMPORAL")}
          >
            Temporal
          </button>
          <button 
            className={`${styles.filterChip} ${filterType === "STATUS" ? styles.active : ""}`}
            onClick={() => setFilterType("STATUS")}
          >
            Status
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loading}>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !filteredLogs || filteredLogs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Search size={24} />
            </div>
            <p>No changes found yet.</p>
            <p className={styles.emptySub}>Upload a new report to see what changed.</p>
          </div>
        ) : (
          <div className={styles.timeline}>
            {filteredLogs.map((log) => (
              <div key={log.id} className={styles.logItem}>
                <div className={styles.logIcon}>
                                    {getIconForField(log.fieldName || "")}
                </div>
                <div className={styles.logContent}>
                  <div className={styles.logHeader}>
                    <span className={styles.fieldName}>{log.fieldName}</span>
                    {getSeverityBadge(log.severity)}
                    <span className={styles.date}>
                      {log.reportDate ? formatDate(log.reportDate) : "Unknown Date"}
                    </span>
                  </div>
                  
                  <div className={styles.diffBox}>
                    <div className={styles.diffVal}>
                      <span className={styles.label}>Previous</span>
                      <span className={styles.value}>{log.expectedValue || "—"}</span>
                    </div>
                    <ArrowRight size={14} className={styles.arrow} />
                    <div className={styles.diffVal}>
                      <span className={styles.label}>Current</span>
                      <span className={styles.value}>{log.actualValue || "—"}</span>
                    </div>
                  </div>

                  <p className={styles.message}>{log.message}</p>
                  
                  {log.timingDriftDays ? (
                    <div className={styles.driftMetric}>
                      <AlertTriangle size={12} />
                      <span>Changed by {log.timingDriftDays} days</span>
                    </div>
                  ) : null}

                  {log.packetId ? (
                    <div className={styles.packetLink}>
                      <LinkIcon size={12} />
                      <span>Letter #{log.packetId}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};