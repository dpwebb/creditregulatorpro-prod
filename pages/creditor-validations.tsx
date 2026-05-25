import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { AlertCircle, AlertTriangle, ListChecks, ShieldAlert } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { DashboardStatCard } from "../components/DashboardStatCard";
import { ComplianceTradelineCard } from "../components/ComplianceTradelineCard";
import { Skeleton } from "../components/Skeleton";
import { useCreditorValidationList } from "../helpers/creditorValidationQueries";
import { useTradelineList } from "../helpers/tradelineQueries";
import { bureauDisplayName } from "../helpers/accountDisplayLabels";
import { buildProblemAccountSummaries } from "../helpers/problemAccountSummaries";

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
    if (!validationData) {
      const totalAccounts = tradelineData?.tradelines?.length ?? 0;
      return { 
        tradelinesWithIssues: [], 
        bureauGroups: [],
        stats: { totalIssues: 0, affectedTradelines: 0, highPriority: 0, totalAccounts } 
      };
    }

    const affectedTradelinesList = buildProblemAccountSummaries(
      validationData.obligationTests,
      tradelineData?.tradelines ?? [],
    );

    // Calculate stats using all issues with tradeline associations
    const totalIssues = affectedTradelinesList.reduce((total, item) => total + item.issueCount, 0);
    const affectedTradelines = affectedTradelinesList.length;
    const totalAccounts = tradelineData?.tradelines?.length ?? affectedTradelines;
    // High priority: issues where obligationState is 'NO_RESPONSE' or 'INSUFFICIENT_RESPONSE'
    const highPriority = affectedTradelinesList.reduce(
      (total, item) => total + item.highPriorityCount,
      0,
    );

    const groupedByBureau = affectedTradelinesList.reduce((acc, item) => {
      const bureauName = bureauDisplayName(item.tradeline.bureauName);
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
      stats: { totalIssues, affectedTradelines, highPriority, totalAccounts }
    };
  }, [validationData, tradelineData]);

  return (
    <div className={styles.container}>
      <Helmet>
        <title>Problems to Review | Credit Regulator Pro</title>
      </Helmet>

      <PageHeader
        title="Problems to Review"
        subtitle={
          stats.totalAccounts > 0
            ? `We found possible reporting problems on ${stats.affectedTradelines} of ${stats.totalAccounts} account${stats.totalAccounts !== 1 ? "s" : ""}. Open an account to see what is missing or wrong.`
            : "We checked your accounts and will list possible reporting problems here."
        }
        
      />

      {/* Stats Row */}
      <div className={styles.statsGrid}>
        <DashboardStatCard
          title="Problems Found"
          value={stats.totalIssues}
          icon={AlertTriangle}
          link="#"
          accentColor="warning"
          loading={isLoading}
          className={styles.statCard}
        />
        <DashboardStatCard
          title="Accounts to Review"
          value={stats.affectedTradelines}
          icon={ListChecks}
          link="#"
          accentColor="info"
          loading={isLoading}
          className={styles.statCard}
        />
      </div>

      {/* Info Banner */}
      <div className={styles.infoPanel}>
        <AlertCircle size={20} className={styles.infoIcon} />
        <div>
          <h4>What this means</h4>
          <p>
            These are active possible reporting problems from your uploaded reports. Each card uses the saved account details we have for that account and shows the main problem types to review next.
          </p>
        </div>
      </div>

      {/* Tradelines Grid */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Accounts to Review</h2>
        
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
                  {bureauName} - {items.length} account{items.length !== 1 ? 's' : ''}
                </h3>
                <div className={styles.tradelineGrid}>
                  {items.map(({ tradeline, issueCount, highPriorityCount, problemLabels }) => (
                    <ComplianceTradelineCard
                      key={tradeline.id}
                      tradeline={tradeline}
                      issueCount={issueCount}
                      priorityIssueCount={highPriorityCount}
                      problemLabels={problemLabels}
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
            <h3>No Problems Found</h3>
            <p>We checked your accounts and did not find any reporting problems.</p>
          </div>
        )}
      </div>
    </div>
  );
}
