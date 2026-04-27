import React, { useMemo, useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format, subDays, isAfter } from "../helpers/dateUtils";
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Activity, 
  Search, 
  ArrowRight,
  Clock
} from "lucide-react";

import { useAuth } from "../helpers/useAuth";
import { useDriftLogs } from "../helpers/changeDetectionQueries";

import { DriftLogWithArtifact } from "../endpoints/tradeline/drift-logs_GET.schema";

import { PageHeader } from "../components/PageHeader";

import { Badge } from "../components/Badge";
import { Input } from "../components/Input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { Button } from "../components/Button";

import styles from "./change-detection.module.css";

// --- Helpers ---

const categorizeField = (fieldName: string | null): 'financial' | 'temporal' | 'status' | 'other' => {
  if (!fieldName) return 'other';
  const lower = fieldName.toLowerCase();
  if (['balance', 'amount', 'creditlimit', 'payment', 'pastdue', 'highcredit'].some(k => lower.includes(k))) return 'financial';
  if (['date', 'time', 'opened', 'closed', 'month'].some(k => lower.includes(k))) return 'temporal';
  if (['status', 'type', 'phase', 'code'].some(k => lower.includes(k))) return 'status';
  return 'other';
};

const getSeverityBadgeVariant = (severity: string) => {
  switch (severity) {
    case 'ERROR': return 'error';
    case 'WARNING': return 'warning';
    case 'INFO': return 'info';
    default: return 'default';
  }
};

// --- Components ---

const StatsCard = ({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  variant = 'default' 
}: { 
  title: string; 
  value: number | string; 
  icon: React.ElementType; 
  trend?: string;
  variant?: 'default' | 'error' | 'warning' | 'info';
}) => (
  <div className={`${styles.statsCard} ${styles[variant]}`}>
    <div className={styles.statsHeader}>
      <span className={styles.statsTitle}>{title}</span>
      <Icon className={styles.statsIcon} size={18} />
    </div>
    <div className={styles.statsValue}>{value}</div>
    {trend && <div className={styles.statsTrend}>{trend}</div>}
  </div>
);

export default function ChangeDetectionPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  
  
  // State for filters
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [postDisputeFilter, setPostDisputeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Data Fetching
  const { data, isLoading, isError } = useDriftLogs(); // Fetch all logs

  // Auth Protection
  useEffect(() => {
    if (authState.type === "unauthenticated") {
      navigate("/login");
    }
  }, [authState, navigate]);

  // Derived State: Stats & Filtered Logs
  const { stats, filteredLogs } = useMemo(() => {
    if (!data?.logs) return { 
      stats: { total: 0, critical: 0, warnings: 0, recent: 0 }, 
      filteredLogs: [] 
    };

    const allLogs = data.logs;
    const now = new Date();
    const sevenDaysAgo = subDays(now, 7);

    // Calculate Stats
    const stats = {
      total: allLogs.length,
      critical: allLogs.filter(l => l.severity === 'ERROR').length,
      warnings: allLogs.filter(l => l.severity === 'WARNING').length,
      recent: allLogs.filter(l => l.detectedAt && isAfter(new Date(l.detectedAt), sevenDaysAgo)).length,
    };

    // Apply Filters
    const filtered = allLogs.filter(log => {
      // Severity Filter
      if (severityFilter !== "all" && log.severity !== severityFilter) return false;
      
      // Type Filter
      if (typeFilter !== "all") {
        const category = categorizeField(log.fieldName);
        if (category !== typeFilter) return false;
      }

      // Post-Dispute Filter
      if (postDisputeFilter === "post-dispute" && !log.packetId) return false;
      if (postDisputeFilter === "no-packet" && log.packetId) return false;

      // Search Filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const accountMatch = log.accountNumber?.toLowerCase().includes(query);
        const fieldMatch = log.fieldName?.toLowerCase().includes(query);
        if (!accountMatch && !fieldMatch) return false;
      }

      return true;
    });

    // Sort by detectedAt desc
    filtered.sort((a, b) => {
      const dateA = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
      const dateB = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
      return dateB - dateA;
    });

    return { stats, filteredLogs: filtered };
  }, [data, severityFilter, typeFilter, postDisputeFilter, searchQuery]);

  if (authState.type === "loading") return null; // Or a full page loader

  return (
    <div className={styles.container}>
      <div className={styles.contentWrapper}>
        
        
        <PageHeader 
          title="What Changed on Your Report" 
          subtitle="See what's different from the last time we checked your reports."
        />

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          {isLoading ? (
            <>
              <Skeleton className={styles.statsSkeleton} />
              <Skeleton className={styles.statsSkeleton} />
              <Skeleton className={styles.statsSkeleton} />
              <Skeleton className={styles.statsSkeleton} />
            </>
          ) : (
            <>
              <StatsCard 
                title="Total Changes" 
                value={stats.total} 
                icon={Activity} 
                trend="Total found so far"
              />
              <StatsCard 
                title="Big Problems" 
                value={stats.critical} 
                icon={AlertCircle} 
                variant="error"
                trend="Need to look at right away"
              />
              <StatsCard 
                title="Warnings" 
                value={stats.warnings} 
                icon={AlertTriangle} 
                variant="warning"
                trend="Could be a problem"
              />
              <StatsCard 
                title="Recent Changes" 
                value={stats.recent} 
                icon={Clock} 
                variant="info"
                trend="Last 7 days"
              />
            </>
          )}
        </div>

        {/* Filters & Search */}
        <div className={styles.controls}>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} size={18} />
            <Input 
              placeholder="Search by account number..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          
          <div className={styles.filters}>
            <Select 
              value={severityFilter} 
              onValueChange={setSeverityFilter}
            >
              <SelectTrigger className={styles.filterSelect}>
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="ERROR">Critical (Error)</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={typeFilter} 
              onValueChange={setTypeFilter}
            >
              <SelectTrigger className={styles.filterSelect}>
                <SelectValue placeholder="All Field Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Field Types</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="temporal">Temporal</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={postDisputeFilter} 
              onValueChange={setPostDisputeFilter}
            >
              <SelectTrigger className={styles.filterSelect}>
                <SelectValue placeholder="All Changes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Changes</SelectItem>
                <SelectItem value="post-dispute">Post-Dispute Only</SelectItem>
                <SelectItem value="no-packet">Unlinked Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Drift Logs List */}
        <div className={styles.cardList}>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.driftCard}>
                <Skeleton className={styles.cardSkeleton} />
              </div>
            ))
          ) : filteredLogs.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyContent}>
                <Activity size={48} className={styles.emptyIcon} />
                <h3>No Changes Found</h3>
                <p>We didn't find any changes with these filters.</p>
              </div>
            </div>
          ) : (
            filteredLogs.map((log: DriftLogWithArtifact) => (
              <div key={log.id} className={styles.driftCard}>
                <div className={styles.cardTopRow}>
                  <div className={styles.accountInfo}>
                    <span className={styles.accountNumber}>{log.accountNumber || "Unknown"}</span>
                    <span className={styles.creditorName}>{log.creditorName}</span>
                  </div>
                  <div className={styles.topRowBadges}>
                    <Badge variant={getSeverityBadgeVariant(log.severity)}>
                      {log.severity}
                    </Badge>
                    {log.packetId && (
                      <Link to={`/tradelines/${log.tradelineId}?tab=impact`}>
                        <Badge variant="primary" className={styles.packetBadge}>
                          Letter #{log.packetId}
                        </Badge>
                      </Link>
                    )}
                    <span className={styles.detectedDate}>
                      {log.detectedAt ? format(new Date(log.detectedAt), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                </div>
                <div className={styles.cardBottomRow}>
                  <div className={styles.changeDetails}>
                    <code className={styles.fieldCode}>{log.fieldName}</code>
                    <span className={styles.valueOld}>{log.expectedValue || "—"}</span>
                    <ArrowRight size={14} className={styles.arrowIcon} />
                    <span className={styles.valueNew}>{log.actualValue || "—"}</span>
                    {log.timingDriftDays && (
                      <Badge variant="warning" className={styles.driftBadge}>
                        {log.timingDriftDays} days
                      </Badge>
                    )}
                  </div>
                  {log.tradelineId && (
                    <Button asChild variant="ghost" size="sm" className={styles.viewLink}>
                      <Link to={`/tradelines/${log.tradelineId}`} title="View Account">
                        View Account <ArrowRight size={16} />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}