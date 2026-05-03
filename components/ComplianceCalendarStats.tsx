import { AlertTriangle, Clock, Calendar as CalendarIcon, CheckCircle } from "lucide-react";
import styles from "./ComplianceCalendarStats.module.css";

interface Props {
  criticalCount: number;
  onOverdueClick?: () => void;
  regulatoryStats: {
    dueThisWeek: number;
    dueThisMonth: number;
    appliedYTD: number;
  };
  packetStats: {
    totalSent: number;
    awaitingResponse: number;
    overdue: number;
    responded: number;
  };
}

export const ComplianceCalendarStats = ({ criticalCount, regulatoryStats, packetStats, onOverdueClick }: Props) => {
  return (
    <div className={styles.statsGrid}>
      <div 
        className={`${styles.statCard} ${styles.statCritical} ${onOverdueClick ? styles.clickable : ''}`}
        onClick={onOverdueClick}
        role={onOverdueClick ? "button" : undefined}
        tabIndex={onOverdueClick ? 0 : undefined}
      >
        <div className={styles.statIcon}>
          <AlertTriangle size={20} />
        </div>
        <div className={styles.statContent}>
          <span className={styles.statLabel}>Overdue Items</span>
          <span className={styles.statValue}>{criticalCount}</span>
        </div>
      </div>
      
      <div className={styles.statCard}>
        <div className={styles.statIcon}>
          <Clock size={20} />
        </div>
        <div className={styles.statContent}>
          <span className={styles.statLabel}>Packets Sent</span>
          <span className={styles.statValue}>{packetStats.totalSent}</span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statIcon}>
          <CalendarIcon size={20} />
        </div>
        <div className={styles.statContent}>
          <span className={styles.statLabel}>Awaiting Response</span>
          <span className={styles.statValue}>{packetStats.awaitingResponse}</span>
        </div>
      </div>

      <div className={styles.statCard}>
        <div className={styles.statIcon}>
          <CheckCircle size={20} />
        </div>
        <div className={styles.statContent}>
          <span className={styles.statLabel}>Responded</span>
          <span className={styles.statValue}>{packetStats.responded}</span>
        </div>
      </div>
    </div>
  );
};