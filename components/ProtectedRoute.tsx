import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../helpers/useAuth";
import { User } from "../helpers/User";
import { AuthErrorPage } from "./AuthErrorPage";
import { ShieldOff, CreditCard } from "lucide-react";
import { AuthLoadingState } from "./AuthLoadingState";
import { Button } from "./Button";
import { Link } from "react-router-dom";
import { useAcceptTerms } from "../helpers/useAcceptTerms";
import styles from "./ProtectedRoute.module.css";

const TermsAcceptanceBlock: React.FC = () => {
  const { mutate: acceptTerms, isPending } = useAcceptTerms();

  return (
    <div className={styles.lockedContainer}>
      <div className={styles.termsCard}>
        <h1 className={styles.lockedTitle}>Terms of Use</h1>
        <p className={styles.lockedMessage}>
          Please read and accept our Terms of Use to continue using Credit Regulator Pro.
        </p>

        <div className={styles.termsScrollArea}>
          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>1. Facilitation Only</h3>
            <p className={styles.termsText}>
              Credit Regulator Pro is a software facilitation platform, not a law firm or a legal representative. The tools provided are for organizational and generation purposes only.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>2. No Representation</h3>
            <p className={styles.termsText}>
              The consumer acts as the sole disputing party. Credit Regulator Pro does not represent you in any capacity before credit bureaus, furnishers, or courts.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>3. User Control</h3>
            <p className={styles.termsText}>
              The consumer reviews, approves, and directly controls all transmissions. You are responsible for verifying the accuracy of all generated dispute materials before submission.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>4. Data Consent (PIPEDA)</h3>
            <p className={styles.termsText}>
              In accordance with PIPEDA, Credit Regulator Pro collects, uses, and discloses personal information solely to organize, generate, and facilitate dispute materials at the consumer's explicit direction.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>5. Transmission at User Direction</h3>
            <p className={styles.termsText}>
              Credit Regulator Pro transmits only the information and documents that the consumer has explicitly reviewed and approved for delivery.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>6. No Guarantees</h3>
            <p className={styles.termsText}>
              Credit Regulator Pro provides no guarantee of any specific outcome. Credit reporting agencies and creditors make their own independent determinations regarding disputes.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>7. Liability Limitations</h3>
            <p className={styles.termsText}>
              Credit Regulator Pro is not liable for any responses, actions, or inactions by credit bureaus, data furnishers, or creditors resulting from the use of our platform.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>8. Indemnification</h3>
            <p className={styles.termsText}>
              The user agrees to indemnify and hold harmless Credit Regulator Pro, its officers, and employees from any claims, damages, or legal actions arising from the user's utilization of the platform.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>9. Acceptable Use</h3>
            <p className={styles.termsText}>
              Users agree not to submit or facilitate the submission of any false, fraudulent, or materially inaccurate information through the platform.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>10. Governing Law</h3>
            <p className={styles.termsText}>
              These Terms of Use are governed by the laws of Canada. Any disputes arising from these terms shall be resolved under Canadian jurisdiction.
            </p>
          </section>

          <section className={styles.termsSection}>
            <h3 className={styles.termsHeading}>11. Contact Information</h3>
            <p className={styles.termsText}>
              If you have any questions about these Terms, please contact us at support@creditregulatorpro.com.
            </p>
          </section>
        </div>

        <Button
          variant="primary"
          onClick={() => acceptTerms()}
          disabled={isPending}
          className={styles.acceptButton}
        >
          {isPending ? "Accepting..." : "I Accept Terms of Use"}
        </Button>
      </div>
    </div>
  );
};

/**
 * Higher-order component factory to create protected route layouts.
 * Routes are named based on the User Persona they represent, while the internal 
 * implementation checks against the User Role.
 */
const MakeProtectedRoute: (roles: Array<User["role"] | "support">) => React.FC<{
  children: React.ReactNode;
}> =
  (roles) =>
  ({ children }) => {
    const { authState } = useAuth();

    // Show loading state while checking authentication
    if (authState.type === "loading") {
      return <AuthLoadingState title="Authenticating" />;
    }

    // Redirect to login if not authenticated
    if (authState.type === "unauthenticated") {
      return <Navigate to="/login" replace />;
    }

    if (!roles.includes(authState.user.role)) {
      return (
        <AuthErrorPage
          title="Access Denied"
          message={`Access denied. Your role (${authState.user.role}) lacks required permissions.`}
          icon={<ShieldOff className={styles.accessDeniedIcon} size={64} />}
        />
      );
    }

    const { user } = authState;

    const isTrialExpired =
      user.subscriptionStatus === "trialing" &&
      !!user.trialEnd &&
      new Date(user.trialEnd) < new Date();

    const isSubscriptionBlocked =
      user.role !== "admin" &&
      user.role !== "support" &&
      user.subscriptionPlan !== "beta" &&
      (isTrialExpired ||
        !user.subscriptionPlan ||
        !user.subscriptionStatus ||
        user.subscriptionStatus === "expired" ||
        user.subscriptionStatus === "cancelled" ||
        user.subscriptionStatus === "past_due");

    if (isSubscriptionBlocked) {
      const lockedMessage = isTrialExpired
        ? "Your free trial has expired. Please subscribe to regain access to your account."
        : `Your subscription is currently ${user.subscriptionStatus ? user.subscriptionStatus.replace("_", " ") : "inactive"}. Please update your billing information to regain access to your account.`;

      return (
        <div className={styles.lockedContainer}>
          <div className={styles.lockedCard}>
            <div className={styles.lockedIconContainer}>
              <CreditCard className={styles.lockedIcon} size={64} />
            </div>
            <h1 className={styles.lockedTitle}>{isTrialExpired ? "Free Trial Expired" : "Subscription Inactive"}</h1>
            <p className={styles.lockedMessage}>
              {lockedMessage}
            </p>
            <Button asChild className={styles.lockedButton}>
              <Link to="/my-info?tab=profile">Manage Subscription</Link>
            </Button>
          </div>
        </div>
      );
    }

    const hasVersionMismatch =
      user.currentTermsVersion !== null &&
      user.termsAcceptedVersion !== user.currentTermsVersion;

    const needsTermsAcceptance =
      user.role !== "admin" &&
      user.role !== "support" &&
      (!user.termsAcceptedAt || hasVersionMismatch);

    if (needsTermsAcceptance) {
      return <TermsAcceptanceBlock />;
    }

    // Render children if authenticated
    return <>{children}</>;
  };

/**
 * AdminRoute: Restricts access to Admin Users only.
 * Technical Mapping: role === "admin"
 */
export const AdminRoute = MakeProtectedRoute(["admin"]);

/**
 * SupportRoute: Restricts access to Support and Admin users only.
 */
export const SupportRoute = MakeProtectedRoute(["support", "admin"]);

/**
 * UserRoute: Represents general user access (Individual or Admin).
 * Often used for shared features between standard users and staff.
 */
export const UserRoute = MakeProtectedRoute(["user", "admin", "support"]);

/**
 * IndividualRoute: Restricts access to the Individual User persona.
 * Technical Mapping: role === "user"
 */
export const IndividualRoute = MakeProtectedRoute(["user"]);

/**
 * AllAuthenticatedRoute: Any logged-in user regardless of persona.
 */
export const AllAuthenticatedRoute = MakeProtectedRoute(["user", "admin", "support"]);