import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { PasswordLoginForm } from "../components/PasswordLoginForm";
import { useAuth } from "../helpers/useAuth";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { TourStartButton } from "../components/TourStartButton";
import { OAuthButtonGroup } from "../components/OAuthButtonGroup";
import styles from "./login.module.css";

export default function LoginPage() {
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
        <title>Sign In - Credit Regulator Pro</title>
        <meta name="description" content="Sign in to Credit Regulator Pro" />
      </Helmet>

      <div className={styles.container}>
        <div className={styles.backgroundGlow} />
        
        <div className={styles.contentWrapper}>
          <div className={styles.logoWrapper}>
            <img 
              src="https://assets.floot.app/e11b9956-edbd-4f31-b22c-500fa8dbcb00/6c01a6f6-e4b0-4e16-a059-bc8e0eeb041b.png" 
              alt="Credit Regulator Pro Logo" 
              className={styles.logoIcon} 
            />
            <h1 className={styles.brandName}>Credit Regulator Pro</h1>
          </div>

          <div className={styles.tourSection}>
            <span className={styles.tourLabel}>New here?</span>
            <TourStartButton variant="ghost" size="sm" label="See How It Works" />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.title}>Welcome Back</h2>
              <p className={styles.subtitle}>Log in to your account</p>
            </div>

            <PasswordLoginForm />

            <div className={styles.divider}>
              <span>or</span>
            </div>

            <OAuthButtonGroup />
          </div>

          <div className={styles.footer}>
            <p className={styles.footerText}>
              Don't have an account?{" "}
              <Link to="/register" className={styles.link}>
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}