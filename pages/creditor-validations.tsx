import React, { useMemo } from "react";
import { Helmet } from "react-helmet";
import { AlertCircle, FileText, AlertTriangle, ShieldAlert } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { DashboardStatCard } from "../components/DashboardStatCard";
import { ComplianceTradelineCard } from "../components/ComplianceTradelineCard";
import { Skeleton } from "../components/Skeleton";
import { useCreditorValidationList } from "../helpers/creditorValidationQueries";
import { useTradelineList } from "../helpers/tradelineQueries";

import styles from "./creditor-validations.module.css";

export default function CreditorValidationsPage() {
  
  
  // Fetch data
  const { data: validationData, isLoading: isLoadingValidations } = useCreditorValidationList();
  const { data: tradelineData, isLoading: isLoadingTradelines } = useTradelineList();

  const isLoading = isLoadingValidations || isLoadingTradelines;

  // Process data
  const { 
    tradelinesWithIssues, 
    bureauGroups,
    stats 
  } = useMemo(() => {
    if (!validationData || !tradelineData?.tradelines) {
      return { 
        tradelinesWithIssues: [], 
        bureauGroups: [],
        stats: { totalIssues: 0, affectedTradelines: 0, highPriority: 0 } 
      };
    }

    const issues = validationData.obligationTests;
    const tradelines = tradelineData.tradelines;
    
    // Create a Set of valid tradeline IDs for efficient lookup
    const validTradelineIds = new Set(tradelines.map(t => t.id));
    
    // Filter issues to only those with valid tradeline associations
    const validIssues = issues.filter(issue => 
      issue.tradelineId != null && validTradelineIds.has(issue.tradelineId)
    );
    
    // Group valid issues by tradelineId
    const issuesByTradeline = validIssues.reduce((acc, issue) => {
      if (issue.tradelineId) {
        if (!acc[issue.tradelineId]) {
          acc[issue.tradelineId] = [];
        }
        acc[issue.tradelineId].push(issue);
      }
      return acc;
    }, {} as Record<number, typeof issues[0][]>);

    // Filter tradelines that have issues
    const affectedTradelinesList = tradelines
      .filter(t => issuesByTradeline[t.id])
      .map(t => {
        const tIssues = issuesByTradeline[t.id];
        const highPriorityCount = tIssues.filter(i => 
          ['NO_RESPONSE', 'INSUFFICIENT_RESPONSE'].includes(i.obligationState || '')
        ).length;

        return {
          tradeline: t,
          issues: tIssues,
          issueCount: tIssues.length,
          highPriorityCount
        };
      })
      .sort((a, b) => b.issueCount - a.issueCount); // Sort by most issues first

    // Calculate stats using only valid issues
    const totalIssues = validIssues.length;
    const affectedTradelines = affectedTradelinesList.length;
    // High priority: issues where obligationState is 'NO_RESPONSE' or 'INSUFFICIENT_RESPONSE'
    const highPriority = validIssues.filter(i =>
      ['NO_RESPONSE', 'INSUFFICIENT_RESPONSE'].includes(i.obligationState || '')
    ).length;

    const groupedByBureau = affectedTradelinesList.reduce((acc, item) => {
      const bureauName = item.tradeline.bureauName || "Other";
      if (!acc[bureauName]) {
        acc[bureauName] = [];
      }
      acc[bureauName].push(item);
      return acc;
    }, {} as Record<string, typeof affectedTradelinesList>);

    const bureauGroups = Object.entries(groupedByBureau).sort(([a], [b]) => a.localeCompare(b));

    return {
      tradelinesWithIssues: affectedTradelinesList,
      bureauGroups,
      stats: { totalIssues, affectedTradelines, highPriority }
    };
  }, [validationData, tradelineData]);

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Errors We Found | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Errors We Found"
        subtitle="We checked your accounts against the rules. Here's what we found."
        
      />

      {/* Stats Row */}
      <div className={styles.statsGrid}>
        <DashboardStatCard
          title="Total Errors"
          value={stats.totalIssues}
          icon={AlertTriangle}
          link="#"
          accentColor="warning"
          loading={isLoading}
          className={styles.statCard}
        />
        <DashboardStatCard
          title="Needs Your Attention"
          value={stats.highPriority}
          icon={ShieldAlert}
          link="#"
          accentColor="destructive"
          loading={isLoading}
          className={styles.statCard}
        />
      </div>

      {/* Info Banner */}
      <div className={styles.infoPanel}>
        <AlertCircle size={20} className={styles.infoIcon} />
        <div>
          <h4>How This Works</h4>
          <p>
            We look at each account on your credit report and check if the company is following the rules. If we find a problem, it shows up here. Tap on an account to learn more.
          </p>
        </div>
      </div>

      {/* Tradelines Grid */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Accounts with Errors</h2>
        
        {isLoading ? (
          <div className={styles.tradelineGrid}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className={styles.cardSkeleton} />
            ))}
          </div>
        ) : bureauGroups.length > 0 ? (
          <div className={styles.bureauGroups}>
            {bureauGroups.map(([bureauName, items]) => (
              <div key={bureauName} className={styles.bureauGroup}>
                <h3 className={styles.bureauHeading}>
                  {bureauName} — {items.length} account{items.length !== 1 ? 's' : ''}
                </h3>
                <div className={styles.tradelineGrid}>
                  {items.map(({ tradeline, issueCount, highPriorityCount }) => (
                    <ComplianceTradelineCard
                      key={tradeline.id}
                      tradeline={tradeline}
                      issueCount={issueCount}
                      priorityIssueCount={highPriorityCount}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyStateIcon}>
              <ShieldAlert size={48} />
            </div>
            <h3>No Errors Found!</h3>
            <p>Great news! We checked everything and didn't find any errors.</p>
          </div>
        )}
      </div>
    </div>
  );
}