import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { PasswordRegisterForm } from "../components/PasswordRegisterForm";
import { useAuth } from "../helpers/useAuth";
import { Link } from "react-router-dom";
import { OAuthButtonGroup } from "../components/OAuthButtonGroup";
import styles from "./register.module.css";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();

  useEffect(() => {
    if (authState.type === "authenticated") {
      navigate("/");
    }
  }, [authState, navigate]);

  return (
    <>
      <Helmet>
        <title>Create Account - Credit Regulator Pro</title>
        <meta name="description" content="Create an account on Credit Regulator Pro" />
      </Helmet>

      <div className={styles.container}>
        <div className={styles.backgroundGlow} />

        <div className={styles.contentWrapper}>
          <div className={styles.logoWrapper}>
            <img 
              src="/brand/app-icon.png"
              alt="Credit Regulator Pro Shield"
              className={styles.logoIcon}
            />
            <h1 className={styles.brandName}>Credit Regulator Pro</h1>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.title}>Unlock Your Full Report</h2>
              <p className={styles.subtitle}>See all problems / Download your letters / Take action today</p>
            </div>

            <div className={styles.promoNote}>
              No charge for 7 days
            </div>

            <PasswordRegisterForm />

            <div className={styles.secureNote}>
              🔒 Your information is securely encrypted
            </div>

            <div className={styles.divider}>
              <span>or</span>
            </div>

            <OAuthButtonGroup />
          </div>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Already have an account?{" "}
              <Link to="/login" className={styles.link}>
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
