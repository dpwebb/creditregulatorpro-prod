import { useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet";
import { useVerifyEmail, useRequestVerificationEmail } from "../helpers/useEmailVerification";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { CheckCircle, XCircle, AlertCircle, Mail, ArrowRight } from "lucide-react";
import styles from "./verify-email.module.css";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const hasAttemptedVerification = useRef(false);

  const { 
    mutate: verifyEmail, 
    isPending: isVerifying, 
    isSuccess: isVerified, 
    error: verifyError,
    isIdle
  } = useVerifyEmail();

  const {
    mutate: resendEmail,
    isPending: isResending,
    isSuccess: isResent,
  } = useRequestVerificationEmail();

  useEffect(() => {
    if (token && !hasAttemptedVerification.current) {
      hasAttemptedVerification.current = true;
      verifyEmail(token);
    }
  }, [token, verifyEmail]);

  const renderContent = () => {
    // 1. No token provided
    if (!token) {
      return (
        <div className={styles.stateContainer}>
          <div className={`${styles.iconWrapper} ${styles.errorIcon}`}>
            <AlertCircle size={48} />
          </div>
          <h2 className={styles.title}>Invalid Link</h2>
          <p className={styles.subtitle}>
            No verification token was provided. Please check the link in your email and try again.
          </p>
        </div>
      );
    }

    // 2. Loading / Verifying
    if (isVerifying || isIdle) {
      return (
        <div className={styles.stateContainer}>
          <div className={styles.spinnerWrapper}>
            <Spinner size="lg" />
          </div>
          <h2 className={styles.title}>Verifying your email</h2>
          <p className={styles.subtitle}>
            Please wait a moment while we confirm your email address.
          </p>
        </div>
      );
    }

    // 3. Success
    if (isVerified) {
      return (
        <div className={styles.stateContainer}>
          <div className={`${styles.iconWrapper} ${styles.successIcon}`}>
            <CheckCircle size={48} />
          </div>
          <h2 className={styles.title}>Email Verified!</h2>
          <p className={styles.subtitle}>
            Your email address has been successfully verified. You now have full access to your account.
          </p>
          <div className={styles.actionContainer}>
            <Button asChild size="lg" className={styles.fullWidthButton}>
              <Link to="/">
                Go to Dashboard
                <ArrowRight size={18} />
              </Link>
            </Button>
          </div>
        </div>
      );
    }

    // 4. Error
    return (
      <div className={styles.stateContainer}>
        <div className={`${styles.iconWrapper} ${styles.errorIcon}`}>
          <XCircle size={48} />
        </div>
        <h2 className={styles.title}>Verification Failed</h2>
        <p className={styles.subtitle}>
          {verifyError instanceof Error 
            ? verifyError.message 
            : "The verification link is invalid or has expired."}
        </p>
        <div className={styles.actionContainer}>
          {isResent ? (
            <div className={styles.resentSuccess}>
              <CheckCircle size={16} />
              <span>A new verification link has been sent to your email.</span>
            </div>
          ) : (
            <Button 
              onClick={() => resendEmail()} 
              disabled={isResending}
              variant="primary"
              className={styles.fullWidthButton}
            >
              {isResending ? <Spinner size="sm" /> : <Mail size={18} />}
              Resend Verification Email
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <Helmet>
        <title>Verify Email - Credit Regulator Pro</title>
        <meta name="description" content="Verify your email address for Credit Regulator Pro" />
      </Helmet>

      <div className={styles.container}>
        <div className={styles.backgroundGlow} />
        
        <div className={styles.contentWrapper}>
          <div className={styles.logoWrapper}>
            <div className={styles.logoIcon}>CR</div>
            <h1 className={styles.brandName}>Credit Regulator Pro</h1>
          </div>

          <div className={styles.card}>
            {renderContent()}
          </div>

          <div className={styles.footer}>
            <Button asChild variant="link" className={styles.link}>
              <Link to="/login">Go to Login</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}