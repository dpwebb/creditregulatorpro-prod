import React, { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Activity,
  BarChart3,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";

import { useTradelineList } from "../helpers/tradelineQueries";
import { getRotationHistory } from "../endpoints/tradeline/rotation-history_GET.schema";
import {
  analyzeVectorEffectiveness,
  getRotationRecommendations,
  getVectorColor,
  formatVectorName,
  VectorEffectiveness,
} from "../helpers/vectorRotationAnalytics";
import { useAuth } from "../helpers/useAuth";


import { PageHeader } from "../components/PageHeader";

import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartConfig,
} from "../components/Chart";

import styles from "./dispute-rotation-analytics.module.css";

// --- Types & Helpers ---

type RotationHealth = "healthy" | "warning" | "critical";

interface TradelineAnalyticsData {
  tradelineId: number;
  accountNumber: string;
  bureauName: string | null;
  creditorName: string | null;
  lastVector: string | null;
  lastUsedDate: Date | null;
  availableVectorsCount: number; // High/Medium priority recommendations
  health: RotationHealth;
  avgSuccessRate: number;
  totalDisputes: number;
}

const ALL_KNOWN_VECTORS = [
  "accuracy",
  "completeness",
  "method_of_verification",
  "reporting_authority",
  "consumer_consent",
  "frivolous_defense",
  "identity_theft",
];

const getHealthColor = (health: RotationHealth) => {
  switch (health) {
    case "healthy":
      return "success";
    case "warning":
      return "warning";
    case "critical":
      return "error";
    default:
      return "default";
  }
};

// --- Components ---

const StatsCard = ({
  title,
  value,
  icon: Icon,
  description,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  trend?: "up" | "down" | "neutral";
}) => (
  <div className={styles.statsCard}>
    <div className={styles.statsHeader}>
      <span className={styles.statsTitle}>{title}</span>
      <Icon className={styles.statsIcon} />
    </div>
    <div className={styles.statsValue}>{value}</div>
    {description && <div className={styles.statsDesc}>{description}</div>}
  </div>
);

export default function DisputeRotationAnalyticsPage() {
  const { authState } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<RotationHealth | "all">("all");

  // 1. Fetch all tradelines
  const { data: tradelinesData, isLoading: isTradelinesLoading } = useTradelineList();
  const tradelines = tradelinesData?.tradelines || [];

  // 2. Fetch history for all tradelines
  // Note: In a large production app, this should be a paginated or aggregated backend endpoint.
  // For this implementation, we fetch details client-side to build the analytics view.
  const historyQueries = useQueries({
    queries: tradelines.map((tl) => ({
      queryKey: ["rotationHistory", tl.id],
      queryFn: () => getRotationHistory(tl.id),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })),
  });

  const isLoadingHistory = historyQueries.some((q) => q.isLoading);
  const isGlobalLoading = isTradelinesLoading || isLoadingHistory;

  // 3. Aggregate Data
  const analyticsData = useMemo(() => {
    if (isGlobalLoading) return null;

    const processedTradelines: TradelineAnalyticsData[] = [];
    const vectorUsage: Record<string, number> = {};
    const vectorSuccess: Record<string, { total: number; success: number }> = {};

    // Initialize counters
    ALL_KNOWN_VECTORS.forEach((v) => {
      vectorUsage[v] = 0;
      vectorSuccess[v] = { total: 0, success: 0 };
    });

    tradelines.forEach((tl, index) => {
      const queryResult = historyQueries[index];
      if (!queryResult.data) return;

      const { history, stats, currentBlockedVector } = queryResult.data;

      // -- Global Stats Aggregation --
      stats.forEach((stat) => {
        vectorUsage[stat.vector] = (vectorUsage[stat.vector] || 0) + stat.totalUses;
        
        if (!vectorSuccess[stat.vector]) {
          vectorSuccess[stat.vector] = { total: 0, success: 0 };
        }
        // We don't have raw success count in stats, but we have rate and totalUses
        const successCount = Math.round(stat.successRate * stat.totalUses);
        vectorSuccess[stat.vector].total += stat.totalUses;
        vectorSuccess[stat.vector].success += successCount;
      });

      // -- Per Tradeline Analysis --
      const recommendations = getRotationRecommendations(
        history,
        stats,
        currentBlockedVector
      );

      // Count "good" options (High or Medium priority)
      const goodOptionsCount = recommendations.filter(
        (r) => r.priority === "high" || r.priority === "medium"
      ).length;

      let health: RotationHealth = "healthy";
      if (goodOptionsCount === 0) health = "critical";
      else if (goodOptionsCount < 2) health = "warning";

      // Calculate average success rate for this tradeline
      const totalUses = stats.reduce((acc, s) => acc + s.totalUses, 0);
      const weightedSuccess = stats.reduce(
        (acc, s) => acc + s.successRate * s.totalUses,
        0
      );
      const avgSuccessRate = totalUses > 0 ? weightedSuccess / totalUses : 0;

      // Last used vector
      const lastHistoryItem = history[0]; // Assuming sorted desc by date, if not we'd need to sort
      // Actually history in schema isn't guaranteed sorted, but usually is. 
      // Let's find the most recent one.
      const sortedHistory = [...history].sort((a, b) => {
        const dateA = a.usedDate ? new Date(a.usedDate).getTime() : 0;
        const dateB = b.usedDate ? new Date(b.usedDate).getTime() : 0;
        return dateB - dateA;
      });
      const lastUsed = sortedHistory[0];

      processedTradelines.push({
        tradelineId: tl.id,
        accountNumber: tl.accountNumber,
        bureauName: tl.bureauName,
        creditorName: tl.creditorName,
        lastVector: lastUsed?.vector || null,
        lastUsedDate: lastUsed?.usedDate ? new Date(lastUsed.usedDate) : null,
        availableVectorsCount: goodOptionsCount,
        health,
        avgSuccessRate,
        totalDisputes: totalUses,
      });
    });

    // -- Format for Charts --
    const usageChartData = Object.entries(vectorUsage)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);

    const successChartData = Object.entries(vectorSuccess)
      .map(([name, { total, success }]) => ({
        name,
        rate: total > 0 ? Math.round((success / total) * 100) : 0,
        total,
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.rate - a.rate);

    return {
      processedTradelines,
      usageChartData,
      successChartData,
    };
  }, [tradelines, historyQueries, isGlobalLoading]);

  // --- Filter Logic ---
  const filteredTradelines = useMemo(() => {
    if (!analyticsData) return [];
    return analyticsData.processedTradelines.filter((tl) => {
      const matchesSearch =
        tl.accountNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (tl.creditorName &&
          tl.creditorName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesHealth =
        healthFilter === "all" || tl.health === healthFilter;
      return matchesSearch && matchesHealth;
    });
  }, [analyticsData, searchQuery, healthFilter]);

  // --- Auth Check ---
  if (authState.type === "loading") return null;
  if (authState.type === "unauthenticated") {
    return <Navigate to="/" replace />;
  }

  // --- Chart Configs ---
  const usageChartConfig: ChartConfig = {
    value: {
      label: "Usage Count",
      color: "var(--primary)",
    },
  };

  const successChartConfig: ChartConfig = {
    rate: {
      label: "Success Rate (%)",
      color: "var(--success)",
    },
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Your Dispute History"
        subtitle="See how your dispute strategies are working"
        
      >
        <div className={styles.headerActions}>
          <div className={styles.lastUpdated}>
            <RefreshCw className="w-4 h-4" />
            <span>Real-time Analysis</span>
          </div>
        </div>
      </PageHeader>

      {isGlobalLoading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.statsGrid}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className={styles.statsCardSkeleton} />
            ))}
          </div>
          <div className={styles.chartsGrid}>
            <Skeleton className={styles.chartSkeleton} />
            <Skeleton className={styles.chartSkeleton} />
          </div>
          <Skeleton className={styles.tableSkeleton} />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className={styles.statsGrid}>
            <StatsCard
              title="Accounts Analyzed"
              value={analyticsData?.processedTradelines.length || 0}
              icon={Activity}
              description="How many accounts we checked"
            />
            <StatsCard
              title="Accounts with Disputes"
              value={
                analyticsData?.processedTradelines.filter(
                  (t) => t.totalDisputes > 0
                ).length || 0
              }
              icon={RefreshCw}
              description="Accounts you've disputed"
            />
            <StatsCard
              title="Running Low on Options"
              value={
                analyticsData?.processedTradelines.filter(
                  (t) => t.health === "critical"
                ).length || 0
              }
              icon={AlertTriangle}
              description="Almost out of strategies"
            />
            <StatsCard
              title="Avg Success Rate"
              value={`${Math.round(
                (analyticsData?.processedTradelines.reduce(
                  (acc, t) => acc + t.avgSuccessRate,
                  0
                ) || 0) / (analyticsData?.processedTradelines.length || 1) * 100
              )}%`}
              icon={CheckCircle2}
              description="Across all strategies"
            />
          </div>

          {/* Charts Section */}
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>How Often Each Strategy Was Used</h3>
              <div className={styles.chartWrapper}>
                <ChartContainer config={usageChartConfig}>
                  <BarChart data={analyticsData?.usageChartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(val) => formatVectorName(val).split(" ")[0]}
                    />
                    <YAxis axisLine={false} tickLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="value"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>

            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>How Well Each Strategy Works</h3>
              <div className={styles.chartWrapper}>
                <ChartContainer config={successChartConfig}>
                  <BarChart data={analyticsData?.successChartData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      tickFormatter={(val) => formatVectorName(val).split(" ")[0]}
                    />
                    <YAxis axisLine={false} tickLine={false} unit="%" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="rate"
                      fill="var(--success)"
                      radius={[4, 4, 0, 0]}
                    >
                      {analyticsData?.successChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.rate > 50
                              ? "var(--success)"
                              : entry.rate > 20
                              ? "var(--warning)"
                              : "var(--muted-foreground)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          </div>

          {/* Detailed Table */}
          <div className={styles.tableSection}>
            <div className={styles.tableHeader}>
              <h3 className={styles.tableTitle}>Account Status</h3>
              <div className={styles.filters}>
                <div className={styles.searchWrapper}>
                  <Search className={styles.searchIcon} />
                  <input
                    type="text"
                    placeholder="Search account or creditor..."
                    className={styles.searchInput}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className={styles.filterWrapper}>
                  <Filter className={styles.filterIcon} />
                  <select
                    className={styles.filterSelect}
                    value={healthFilter}
                    onChange={(e) =>
                      setHealthFilter(e.target.value as RotationHealth | "all")
                    }
                  >
                    <option value="all">All Status</option>
                    <option value="healthy">Healthy</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
            </div>

            <div className={styles.cardList}>
              {filteredTradelines.length === 0 ? (
                <div className={styles.emptyState}>
                  No tradelines found matching your criteria.
                </div>
              ) : (
                filteredTradelines.map((tl) => (
                  <div key={tl.tradelineId} className={styles.tradelineCard}>
                    <div className={styles.cardTopRow}>
                      <div className={styles.tradelineInfo}>
                        <span className={styles.accountNumber}>
                          {tl.accountNumber}
                        </span>
                        <span className={styles.creditorName}>
                          {tl.creditorName || "Unknown Creditor"}
                        </span>
                      </div>
                      <div className={styles.healthCell}>
                        <div
                          className={`${styles.healthIndicator} ${
                            styles[tl.health]
                          }`}
                        />
                        <span className={styles.healthText}>
                          {tl.health === "healthy"
                            ? "Healthy"
                            : tl.health === "warning"
                            ? "Limited Options"
                            : "No Options Left"}
                        </span>
                      </div>
                      <div className={styles.successRate}>
                        {Math.round(tl.avgSuccessRate * 100)}%
                        <div className={styles.progressBar}>
                          <div
                            className={styles.progressFill}
                            style={{
                              width: `${tl.avgSuccessRate * 100}%`,
                              backgroundColor:
                                tl.avgSuccessRate > 0.5
                                  ? "var(--success)"
                                  : "var(--warning)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className={styles.cardBottomRow}>
                      <div className={styles.strategyInfo}>
                        {tl.lastVector ? (
                          <Badge variant={getVectorColor(tl.lastVector)}>
                            {formatVectorName(tl.lastVector)}
                          </Badge>
                        ) : (
                          <span className={styles.mutedText}>None</span>
                        )}
                        {tl.lastUsedDate && (
                          <span className={styles.dateSubtext}>
                            {tl.lastUsedDate.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <Link
                        to={`/tradelines/${tl.tradelineId}`}
                        className={styles.actionLink}
                      >
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}