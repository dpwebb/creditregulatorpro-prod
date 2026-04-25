import React from "react";
import { Link } from "react-router-dom";
import { ClockIcon, ShieldCheckIcon } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { useSubscription } from "../helpers/subscriptionQueries";
import { Button } from "./Button";
import styles from "./TrialCountdownBanner.module.css";

interface TrialCountdownBannerProps {
  className?: string;
}

export const TrialCountdownBanner = ({ className }: TrialCountdownBannerProps) => {
  const { authState, userRole } = useAuth();
  const { subscription, isTrialing, isBeta, daysLeftInTrial, isLoading } = useSubscription();

  // Show only for authenticated users with 'user' role
  if (isLoading) return null;
  if (authState.type !== "authenticated" || userRole !== "user") return null;

  // Show only if trialing on a beta plan and has a valid trial end date
  if (!isTrialing || !isBeta || !subscription?.trialEnd) return null;
  
  // Do not show if the trial has already expired
  if (daysLeftInTrial <= 0) return null;

  const trialStart = subscription.trialStart ? new Date(subscription.trialStart) : new Date();
  const trialEnd = new Date(subscription.trialEnd);
  
  // Calculate duration, defaulting to 30 as per project spec if math yields a bad value
  let totalDays = Math.round((trialEnd.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0 || isNaN(totalDays)) totalDays = 30;
  
  const daysPassed = Math.max(1, totalDays - daysLeftInTrial);

  return (
    <div className={`${styles.banner} ${className || ""}`}>
      <div className={styles.content}>
        <div className={styles.info}>
          <div className={styles.badge}>
            <ClockIcon size={14} className={styles.icon} aria-hidden="true" />
            <span>Day {daysPassed} of {totalDays}</span>
          </div>
          <div className={styles.textGroup}>
            <span className={styles.mainText}>
              Your free trial ends in {daysLeftInTrial} {daysLeftInTrial === 1 ? 'day' : 'days'}
            </span>
            <span className={styles.subText}>
              <ShieldCheckIcon size={12} className={styles.subIcon} aria-hidden="true" />
              Cancel anytime before trial ends
            </span>
          </div>
        </div>
        <div className={styles.actions}>
          <Button size="sm" variant="primary" asChild className={styles.button}>
            <Link to="/my-info?tab=profile">Choose a Plan</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};