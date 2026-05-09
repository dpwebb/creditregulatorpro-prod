import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, AlertCircle, ChevronDown, ArrowRight } from 'lucide-react';
import { useHiddenRisks } from '../helpers/hiddenRiskQueries';
import { Skeleton } from './Skeleton';
import { Button } from './Button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './Collapsible';
import { HiddenRiskItem } from '../endpoints/hidden-risk/list_GET.schema';
import styles from './HiddenRiskWidget.module.css';

interface HiddenRiskWidgetProps {
  isAdmin: boolean;
  userId?: number;
}

const humanizeCategory = (category: string) => {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const RiskCard = ({ item }: { item: HiddenRiskItem }) => {
  const explanation = item.userExplanation || humanizeCategory(item.violationCategory);
  
  return (
    <div className={styles.riskCard}>
      <div className={styles.riskHeader}>
        <span className={`${styles.badge} ${item.severity === 'ERROR' ? styles.badgeError : styles.badgeWarning}`}>
          {item.severity === 'ERROR' ? 'High Risk' : 'Warning'}
        </span>
        <span className={styles.creditorName}>
          {item.creditorName || "Unknown Creditor"}
          {item.bureauName && <span className={styles.bureauName}> • {item.bureauName}</span>}
        </span>
      </div>
      <p className={styles.riskDescription}>{explanation}</p>
      <div className={styles.riskAction}>
        <Button asChild variant="link" size="sm">
          <Link to={`/tradelines/${item.tradelineId}`}>
            See This Account <ArrowRight size={14} className={styles.actionIcon} />
          </Link>
        </Button>
      </div>
    </div>
  );
};

export const HiddenRiskWidget: React.FC<HiddenRiskWidgetProps> = ({ isAdmin, userId }) => {
  const { data, isLoading, isError } = useHiddenRisks(userId);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Skeleton className={styles.skeletonHeader} />
        <Skeleton className={styles.skeletonCard} />
        <Skeleton className={styles.skeletonCard} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={`${styles.container} ${styles.errorState}`}>
        <p>Failed to load risk analysis.</p>
      </div>
    );
  }

  const { risks, aggregate } = data;

  if (isAdmin) {
    const hasIssues = aggregate.errorCount > 0 || aggregate.warningCount > 0;
    
    return (
      <div className={`${styles.container} ${hasIssues ? styles.adminHasIssues : styles.adminClear}`}>
        <div className={styles.adminHeader}>
          {hasIssues ? (
            <AlertCircle className={styles.iconRed} size={24} />
          ) : (
            <ShieldCheck className={styles.iconGreen} size={24} />
          )}
          <h3 className={styles.title}>Compliance Risk Triage</h3>
        </div>
        <p className={styles.adminDescription}>
          Active findings from uploaded report tradelines. These are compliance risks, not app/server errors.
        </p>
        
        <div className={styles.adminStats}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{aggregate.totalCount}</span>
            <span className={styles.statLabel}>Unresolved Risk Findings</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{aggregate.uniqueUserCount ?? 0}</span>
            <span className={styles.statLabel}>Affected Users</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValueError}>{aggregate.errorCount}</span>
            <span className={styles.statLabel}>High-Risk Findings</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValueWarning}>{aggregate.warningCount}</span>
            <span className={styles.statLabel}>Needs Review</span>
          </div>
        </div>

        <div className={styles.adminAction}>
          <Button asChild variant="outline">
            <Link to="/admin-ai-assist">Open Finding Lookup</Link>
          </Button>
        </div>
      </div>
    );
  }

  // User View
  const isClean = aggregate.errorCount === 0 && aggregate.warningCount === 0;
  const hasErrors = aggregate.errorCount > 0;
  
    if (isClean) {
    return null;
  }

  let headerIcon = <ShieldCheck className={styles.iconGreen} size={28} />;
  let headerText = "";
  let statusClass = styles.statusClear;

  if (hasErrors) {
    headerIcon = <AlertCircle className={styles.iconRed} size={28} />;
    headerText = `${aggregate.totalCount} problem${aggregate.totalCount > 1 ? 's are' : ' is'} hiding in your report`;
    statusClass = styles.statusError;
  } else if (aggregate.warningCount > 0) {
    headerIcon = <AlertTriangle className={styles.iconYellow} size={28} />;
    headerText = `We spotted ${aggregate.warningCount} thing${aggregate.warningCount > 1 ? 's' : ''} worth checking`;
    statusClass = styles.statusWarning;
  }

  const topRisks = risks.slice(0, 2);
  const remainingRisks = risks.slice(2);

  return (
    <div className={styles.container}>
      <div className={`${styles.statusBanner} ${statusClass}`}>
        {headerIcon}
        <h3 className={styles.statusTitle}>{headerText}</h3>
      </div>

      {!isClean && (
        <div className={styles.risksList}>
          {topRisks.map(risk => (
            <RiskCard key={risk.id} item={risk} />
          ))}

          {remainingRisks.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className={styles.showMoreTrigger}>
                <span>Show {remainingRisks.length} more {remainingRisks.length > 1 ? 'issues' : 'issue'}</span>
                <ChevronDown size={16} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className={styles.expandedRisks}>
                  {remainingRisks.map(risk => (
                    <RiskCard key={risk.id} item={risk} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
};
