import React from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "./Skeleton";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { EQUIFAX_DISPUTE_REASONS, type EquifaxDisputeReasonCode } from "../helpers/equifaxDisputeReasons";
import styles from "./CreatePacketDialog.module.css";

export interface CreatePacketRecommendStepProps {
  isLoadingRecs: boolean;
  recsData: any;
  isPending: boolean;
  creatingRecId: number | null;
  onSelectRecommendation: (rec: any) => void;
  onSkipToForm: () => void;
  onSkipWithReset: () => void;
}

export const CreatePacketRecommendStep: React.FC<CreatePacketRecommendStepProps> = ({
  isLoadingRecs,
  recsData,
  isPending,
  creatingRecId,
  onSelectRecommendation,
  onSkipToForm,
  onSkipWithReset,
}) => {
  if (isLoadingRecs) {
    return (
      <div className={styles.recsLoading}>
        <Skeleton style={{ height: "120px", marginBottom: "1rem" }} />
        <Skeleton style={{ height: "120px", marginBottom: "1rem" }} />
        <Skeleton style={{ height: "120px" }} />
      </div>
    );
  }

  if (recsData?.totalTradelines === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Upload a credit report to get started.</p>
        <Button asChild>
          <Link to="/upload">Upload Report</Link>
        </Button>
      </div>
    );
  }

  if (!recsData?.hasViolations && recsData?.proceduralOptions?.length) {
    return (
      <div className={styles.recsContainer}>
        <p className={styles.recsMessage}>
          We didn't find specific errors, but here are procedural challenges you can make:
        </p>
        <div className={styles.proceduralList}>
          {recsData.proceduralOptions.map((opt: any) => (
            <div key={opt.id} className={styles.recCard}>
              <div className={styles.recCardHeader}>
                <h4 className={styles.recCardTitle}>{opt.label}</h4>
              </div>
              <p className={styles.recCardDesc}>{opt.description}</p>
              <div className={styles.recCardFooter}>
                <Button variant="outline" size="sm" onClick={onSkipToForm} disabled={isPending}>Choose This</Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="ghost" className={styles.skipBtn} onClick={onSkipToForm}>
          Skip — I'll choose myself
        </Button>
      </div>
    );
  }

  if (recsData?.recommendations?.length) {
    const topRec = recsData.recommendations[0];
    const otherRecs = recsData.recommendations.slice(1);

    const profileHrefFor = (rec: any) => {
      const params = new URLSearchParams();
      params.set("returnTo", "createPacket");
      params.set("tradelineId", String(rec.tradelineId));
      if (rec.bureauId) params.set("bureauId", String(rec.bureauId));
      if (rec.violationId) params.set("violationId", String(rec.violationId));
      const missingFields = rec.actionPlan?.blockers
        ?.find((blocker: any) => blocker.code === "missing_user_profile")
        ?.fields ?? [];
      if (missingFields.length) params.set("missingFields", missingFields.join(","));
      return `/my-info?tab=profile&${params.toString()}`;
    };

    const getConfidenceBadge = (level: string) => {
      if (level === 'good') return <Badge variant="success">Good chance</Badge>;
      if (level === 'fair') return <Badge variant="warning">Worth trying</Badge>;
      return <Badge variant="info">Procedural</Badge>;
    };

    const renderReasonCode = (code: string) => {
      if (!code) return null;
      const label = EQUIFAX_DISPUTE_REASONS[code as EquifaxDisputeReasonCode];
      if (!label) return null;
      return <p className={styles.recCardSub} style={{ marginTop: '0.25rem' }}>Reason: {label}</p>;
    };

    const renderActionPlan = (rec: any) => {
      if (!rec.actionPlan || rec.actionPlan.status === "ready") return null;
      return (
        <div className={styles.actionPlanBlock}>
          {rec.actionPlan.blockers.map((blocker: any) => (
            <p key={blocker.code} className={styles.actionPlanText}>{blocker.label}</p>
          ))}
        </div>
      );
    };

    const renderActionButton = (rec: any, fallbackLabel: string, variant: "default" | "outline" = "default") => {
      const actionPlan = rec.actionPlan;
      if (actionPlan?.primaryAction === "COMPLETE_PROFILE") {
        return (
          <Button asChild variant={variant} size={variant === "outline" ? "sm" : undefined}>
            <Link to={profileHrefFor(rec)}>{actionPlan.ctaLabel}</Link>
          </Button>
        );
      }

      if (actionPlan?.primaryAction === "UPDATE_BUREAU_CONTACT") {
        return (
          <Button variant={variant} size={variant === "outline" ? "sm" : undefined} disabled>
            {actionPlan.ctaLabel}
          </Button>
        );
      }

      if (actionPlan?.primaryAction === "REVIEW_SOURCE_REPORT") {
        return (
          <Button variant={variant} size={variant === "outline" ? "sm" : undefined} disabled>
            {actionPlan.ctaLabel}
          </Button>
        );
      }

      return (
        <Button
          variant={variant}
          size={variant === "outline" ? "sm" : undefined}
          onClick={() => onSelectRecommendation(rec)}
          disabled={isPending}
        >
          {isPending && creatingRecId === rec.violationId ? "Creating..." : fallbackLabel}
        </Button>
      );
    };

    return (
      <div className={styles.recsContainer}>
        <h3 className={styles.recsHeading}>Our Best Recommendation</h3>
        <div className={`${styles.recCard} ${styles.topRec}`}>
          <div className={styles.recCardHeader}>
            <div>
              <h4 className={styles.recCardTitle}>{topRec.tradelineName}</h4>
              <p className={styles.recCardSub}>{topRec.bureauName}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {topRec.score !== undefined && <Badge variant="default">Score: {topRec.score}</Badge>}
              {getConfidenceBadge(topRec.confidenceLevel)}
            </div>
          </div>
          <div>
            <p className={styles.recCardDesc}>{topRec.violationDescription}</p>
            {renderReasonCode(topRec.suggestedReasonCode)}
            {renderActionPlan(topRec)}
          </div>
          <div className={styles.recCardFooter}>
            {renderActionButton(topRec, "Challenge This Account")}
          </div>
        </div>

        {otherRecs.length > 0 && (
          <>
            <h4 className={styles.recsSubHeading}>Other Options</h4>
            <div className={styles.otherRecsList}>
              {otherRecs.map((rec: any) => (
                <div key={rec.violationId} className={styles.recCard}>
                  <div className={styles.recCardHeader}>
                    <div>
                      <h4 className={styles.recCardTitle}>{rec.tradelineName}</h4>
                      <p className={styles.recCardSub}>{rec.bureauName}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {rec.score !== undefined && <Badge variant="default">Score: {rec.score}</Badge>}
                      {getConfidenceBadge(rec.confidenceLevel)}
                    </div>
                  </div>
                  <div>
                    <p className={styles.recCardDesc}>{rec.violationDescription}</p>
                    {renderReasonCode(rec.suggestedReasonCode)}
                    {renderActionPlan(rec)}
                  </div>
                  <div className={styles.recCardFooter}>
                    {renderActionButton(rec, "Choose This", "outline")}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <Button variant="ghost" className={styles.skipBtn} onClick={onSkipWithReset}>
          Skip — I'll choose myself
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.recsContainer}>
      <Button variant="ghost" className={styles.skipBtn} onClick={onSkipToForm}>
        Skip to Form
      </Button>
    </div>
  );
};
