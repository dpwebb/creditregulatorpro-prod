import React, { useMemo } from "react";
import { 
  Activity, 
  ArrowRight, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  FileText, 
  MinusCircle, 
  ShieldAlert, 
  ShieldCheck, 
  XCircle 
} from "lucide-react";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";
import { useChangeTimeline } from "../helpers/packetImpactQueries";
import { formatDateTime } from "../helpers/formatters";
import styles from "./PacketImpactView.module.css";

interface Props {
  tradelineId: number;
  className?: string;
}

export const PacketImpactView: React.FC<Props> = ({ tradelineId, className }) => {
  const { data, isLoading, error } = useChangeTimeline(tradelineId);

  const timeline = data?.timeline || [];

  const { packets, impacts, sortedTimeline } = useMemo(() => {
    const pkts = timeline.filter((e) => e.type === "PACKET");
    const imps = timeline.filter((e) => e.type === "IMPACT");
    const sorted = [...timeline].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return { packets: pkts, impacts: imps, sortedTimeline: sorted };
  }, [timeline]);

  if (isLoading) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <Skeleton className={styles.loadingSkeleton} />
        <Skeleton className={styles.loadingSkeleton} />
        <Skeleton className={styles.loadingSkeleton} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.container} ${styles.errorContainer} ${className || ""}`}>
        <ShieldAlert className={styles.errorIcon} />
        <p>Failed to load impact timeline.</p>
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className={`${styles.container} ${styles.emptyContainer} ${className || ""}`}>
        <Activity className={styles.emptyIcon} />
        <p className={styles.emptyTitle}>No activity yet</p>
        <p className={styles.emptySub}>This tradeline has no recorded timeline events.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${className || ""}`}>
      {packets.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>How Your Letters Helped</h3>
          <div className={styles.packetsGrid}>
            {packets.map((packetEntry) => {
              const packetData = packetEntry.data || {};
              const packetId = packetData.id;
              const impactEntry = impacts.find((i) => i.data?.packetId === packetId);
              
              return (
                <PacketCard 
                  key={packetEntry.id} 
                  packetEntry={packetEntry} 
                  impactEntry={impactEntry} 
                />
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>What Happened</h3>
        <div className={styles.timelineList}>
          {sortedTimeline.map((entry, index) => (
            <TimelineItem key={entry.id || index} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
};

const PacketCard: React.FC<{ packetEntry: any; impactEntry: any }> = ({ packetEntry, impactEntry }) => {
  const packetData = packetEntry.data || {};
  const impactData = impactEntry?.data;

  return (
    <div className={styles.packetCard}>
      <div className={styles.packetHeader}>
        <div className={styles.packetTitleGroup}>
          <FileText size={16} className={styles.packetIcon} />
          <span className={styles.packetTitle}>Letter #{packetData.id || "Unknown"}</span>
          <Badge variant={packetData.status === "COMPLETED" ? "success" : "default"}>
            {packetData.status || "Pending"}
          </Badge>
        </div>
        <span className={styles.packetDate}>{formatDateTime(packetEntry.timestamp)}</span>
      </div>

      <div className={styles.packetBody}>
        {!impactData ? (
          <div className={styles.awaitingImpact}>
            <Clock size={16} />
            <span>Waiting for your next report to see what changed</span>
          </div>
        ) : (
          <div className={styles.impactDetails}>
            <div className={styles.impactScoreRow}>
              <div className={styles.scoreInfo}>
                <span className={styles.scoreLabel}>Impact Score</span>
                <span className={`${styles.scoreValue} ${
                  impactData.impactScore > 0 ? styles.textSuccess : 
                  impactData.impactScore < 0 ? styles.textError : ""
                }`}>
                  {impactData.impactScore > 0 ? "+" : ""}{impactData.impactScore || 0}
                </span>
              </div>
              <div className={styles.gaugeContainer}>
                <div 
                  className={styles.gaugeFill} 
                  style={{ 
                    width: `${Math.min(Math.max(((impactData.impactScore || 0) + 100) / 2, 0), 100)}%`,
                    backgroundColor: impactData.impactScore > 0 ? "var(--success)" : 
                                     impactData.impactScore < 0 ? "var(--error)" : "var(--muted-foreground)"
                  }} 
                />
              </div>
            </div>

            <div className={styles.impactCounts}>
              <div className={styles.countItem}>
                <CheckCircle2 size={14} className={styles.textSuccess} />
                <span>{impactData.favorableChanges || 0} Favorable</span>
              </div>
              <div className={styles.countItem}>
                <XCircle size={14} className={styles.textError} />
                <span>{impactData.unfavorableChanges || 0} Unfavorable</span>
              </div>
              <div className={styles.countItem}>
                <MinusCircle size={14} className={styles.textMuted} />
                <span>{impactData.neutralChanges || 0} Neutral</span>
              </div>
            </div>

            {impactData.fieldDiffs && Object.keys(impactData.fieldDiffs).length > 0 && (
              <div className={styles.diffTable}>
                <div className={styles.diffHeader}>
                  <span>Field</span>
                  <span>Change</span>
                </div>
                {Array.isArray(impactData.fieldDiffs) 
                  ? impactData.fieldDiffs.map((diff: any, i: number) => (
                      <DiffRow key={i} diff={diff} />
                    ))
                  : Object.entries(impactData.fieldDiffs).map(([key, diff]: [string, any], i) => (
                      <DiffRow key={i} diff={{ fieldName: key, ...diff }} />
                    ))
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const DiffRow: React.FC<{ diff: any }> = ({ diff }) => {
  const isFavorable = diff.indicator === 'favorable' || diff.favorable === true;
  const isUnfavorable = diff.indicator === 'unfavorable' || diff.unfavorable === true;
  
  const indicatorClass = isFavorable ? styles.indicatorFavorable : 
                         isUnfavorable ? styles.indicatorUnfavorable : 
                         styles.indicatorNeutral;

  return (
    <div className={styles.diffRow}>
      <span className={styles.diffFieldName}>{diff.fieldName}</span>
      <div className={styles.diffValues}>
        <span className={styles.diffOld}>{String(diff.oldValue || diff.previous || "—")}</span>
        <ArrowRight size={12} className={styles.diffArrow} />
        <span className={`${styles.diffNew} ${indicatorClass}`}>
          {String(diff.newValue || diff.current || "—")}
        </span>
      </div>
    </div>
  );
};

const TimelineItem: React.FC<{ entry: any }> = ({ entry }) => {
  const data = entry.data || {};

  const renderContent = () => {
    switch (entry.type) {
      case "SNAPSHOT":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Report Saved</span>
              <Badge variant="info">Report</Badge>
            </div>
            {data.reportArtifactId && (
              <p className={styles.timelineDesc}>Report #: {data.reportArtifactId}</p>
            )}
          </div>
        );
      case "PACKET":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Letter Created</span>
              <Badge variant="primary">Letter</Badge>
            </div>
            <p className={styles.timelineDesc}>Letter #{data.id} created.</p>
          </div>
        );
      case "IMPACT":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Results Checked</span>
              <Badge variant="success">Result</Badge>
            </div>
            <p className={styles.timelineDesc}>
              Score: {data.impactScore > 0 ? "+" : ""}{data.impactScore || 0}. 
              Follow-up snapshot ID: {data.followupSnapshotId}.
            </p>
          </div>
        );
      case "DRIFT":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Change Found: {data.fieldName}</span>
              <Badge variant={data.severity === "ERROR" ? "error" : data.severity === "WARNING" ? "warning" : "default"}>
                {data.severity || "Change"}
              </Badge>
            </div>
            <div className={styles.driftDiff}>
              <span className={styles.driftVal}>{String(data.expectedValue || "—")}</span>
              <ArrowRight size={12} />
              <span className={styles.driftVal}>{String(data.actualValue || "—")}</span>
            </div>
            {data.packetId && <p className={styles.timelineDesc}>Linked to Letter #{data.packetId}</p>}
          </div>
        );
      case "OBLIGATION":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Dispute Update</span>
              <Badge variant="warning">{data.state || "Updated"}</Badge>
            </div>
            {data.disputeVector && (
              <p className={styles.timelineDesc}>Approach: {data.disputeVector}</p>
            )}
            {data.successOutcome && (
              <p className={styles.timelineDesc}>Outcome: {data.successOutcome}</p>
            )}
            {data.responseDeadline && (
              <p className={styles.timelineDesc}>
                Response deadline: {formatDateTime(data.responseDeadline)}
              </p>
            )}
          </div>
        );
      case "OUTCOME":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Dispute Outcome Evaluated</span>
              <Badge
                variant={
                  data.outcome === "WORKED"
                    ? "success"
                    : data.outcome === "PARTIAL"
                      ? "warning"
                      : "error"
                }
              >
                {data.outcome || "Unknown"}
              </Badge>
            </div>
            {data.disputeVector && (
              <p className={styles.timelineDesc}>Approach: {data.disputeVector}</p>
            )}
            {data.responseTimeDays != null && (
              <p className={styles.timelineDesc}>
                Response time: {data.responseTimeDays} day(s)
              </p>
            )}
          </div>
        );
      case "EVIDENCE":
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>{data.eventType || "Proof Recorded"}</span>
              <Badge variant="default">Evidence</Badge>
            </div>
            {data.description && (
              <p className={styles.timelineDesc}>{data.description}</p>
            )}
          </div>
        );
      default:
        return (
          <div className={styles.timelineContent}>
            <div className={styles.timelineHeader}>
              <span className={styles.timelineTitle}>Unknown Event</span>
              <Badge variant="default">{entry.type}</Badge>
            </div>
          </div>
        );
    }
  };

  const getIcon = () => {
    switch (entry.type) {
      case "SNAPSHOT": return <Calendar size={14} />;
      case "PACKET": return <FileText size={14} />;
      case "IMPACT": return <ShieldCheck size={14} />;
      case "DRIFT": return <Activity size={14} />;
      case "OBLIGATION": return <ShieldAlert size={14} />;
      case "OUTCOME": return <CheckCircle2 size={14} />;
      default: return <Clock size={14} />;
    }
  };

  return (
    <div className={styles.timelineItem}>
      <div className={styles.timelineNode}>
        <div className={styles.timelineIconWrapper}>
          {getIcon()}
        </div>
        <div className={styles.timelineLine} />
      </div>
      <div className={styles.timelineDetails}>
        <span className={styles.timelineDate}>{formatDateTime(entry.timestamp)}</span>
        <div className={styles.timelineBox}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
