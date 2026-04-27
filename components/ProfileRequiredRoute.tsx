import React from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { useUserProfile } from "../helpers/useUserProfile";
import {
  checkProfileCompletion,
  getFieldLabel,
} from "../helpers/profileCompletionCheck";
import { AuthLoadingState } from "./AuthLoadingState";
import { Button } from "./Button";
import styles from "./ProfileRequiredRoute.module.css";

interface ProfileRequiredRouteProps {
  children: React.ReactNode;
}

export function ProfileRequiredRoute({ children }: ProfileRequiredRouteProps) {
  const { profile, isLoading, error } = useUserProfile();
  const location = useLocation();

  // Show loading state while fetching profile
  if (isLoading) {
    return <AuthLoadingState title="Checking your info..." />;
  }

  // If there's an error fetching the profile, we probably shouldn't block
  // completely, or we should show a generic error. For now, let's assume
  // if it fails, we can't verify, so we block with an error message.
  if (error || !profile) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={`${styles.iconWrapper} ${styles.errorIcon}`}>
            <ShieldAlert size={48} />
          </div>
          <h1 className={styles.title}>Verification Failed</h1>
          <p className={styles.description}>
            We couldn't check your info. Please refresh the page or ask for help if it keeps happening.
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className={styles.button}
          >
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  const { isComplete, missingFields } = checkProfileCompletion(profile);

  // If profile is complete, render the protected content
  if (isComplete) {
    return <>{children}</>;
  }

  // If profile is incomplete, show the blocking UI
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <AlertTriangle size={40} strokeWidth={1.5} />
          </div>
          <h1 className={styles.title}>We Need Your Info First</h1>
        </div>

        <div className={styles.content}>
          <p className={styles.description}>
            Please fill in your info first so your dispute letters are correct.
          </p>

          <div className={styles.missingFieldsContainer}>
            <p className={styles.missingLabel}>We still need:</p>
            <ul className={styles.missingList}>
              {missingFields.map((field) => (
                <li key={field} className={styles.missingItem}>
                  {getFieldLabel(field)}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.actions}>
            <Button asChild size="lg" className={styles.actionButton}>
              <Link to={`/my-info?tab=profile&returnTo=${encodeURIComponent(location.pathname + location.search)}`}>
                Complete Profile <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}