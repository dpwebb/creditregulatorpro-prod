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
import { evaluateSubscriptionAccess } from "../helpers/subscriptionAccess";
import { needsTermsAcceptance } from "../helpers/termsAcceptance";
import { useConsumerIdentification } from "../helpers/useConsumerIdentification";
import { ConsumerIdentificationManager } from "./ConsumerIdentificationManager";
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
            <p className={styles.termsText}>
              If you choose our print-and-mail option, we act only as a mailing service at your direction. Mailing a letter for you does not mean we represent you or speak for you.
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

const IdentificationRequiredGate: React.FC<{
  user: User;
  children: React.ReactNode;
}> = ({ user, children }) => {
  const { identification, isLoading } = useConsumerIdentification();

  if (user.role !== "user") {
    return <>{children}</>;
  }

  if (isLoading) {
    return <AuthLoadingState title="Checking identification" />;
  }

  if (!identification) {
    return (
      <div className={styles.lockedContainer}>
        <div className={styles.identityRequirement}>
          <h1 className={styles.lockedTitle}>Identification Required</h1>
          <p className={styles.identityMessage}>
            Upload your identification before continuing. It will be saved to your account and used only for dispute packages that require consumer identification.
          </p>
          <ConsumerIdentificationManager />
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

/**
 * Higher-order component factory to create protected route layouts.
 * Routes are named based on the User Persona they represent, while the internal 
 * implementation checks against the User Role.
 */
const MakeProtectedRoute = (roles: Array<User["role"] | "support">): React.FC<{
  children: React.ReactNode;
}> => {
  const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

    const subscriptionAccess = evaluateSubscriptionAccess({
      role: user.role,
      subscriptionPlan: user.subscriptionPlan,
      subscriptionStatus: user.subscriptionStatus,
      trialEnd: user.trialEnd,
    });

    if (subscriptionAccess.blocked) {
      return (
        <div className={styles.lockedContainer}>
          <div className={styles.lockedCard}>
            <div className={styles.lockedIconContainer}>
              <CreditCard className={styles.lockedIcon} size={64} />
            </div>
            <h1 className={styles.lockedTitle}>{subscriptionAccess.title}</h1>
            <p className={styles.lockedMessage}>
              {subscriptionAccess.message}
            </p>
            <Button asChild className={styles.lockedButton}>
              <Link to="/my-info?tab=profile">Manage Subscription</Link>
            </Button>
          </div>
        </div>
      );
    }

    const shouldRequireTermsAcceptance = needsTermsAcceptance({
      role: user.role,
      termsAcceptedAt: user.termsAcceptedAt,
      termsAcceptedVersion: user.termsAcceptedVersion,
      currentTermsVersion: user.currentTermsVersion,
    });

    if (shouldRequireTermsAcceptance) {
      return <TermsAcceptanceBlock />;
    }

    return (
      <IdentificationRequiredGate user={user}>
        {children}
      </IdentificationRequiredGate>
    );
  };

  return ProtectedRoute;
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
