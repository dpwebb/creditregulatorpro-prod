import React from "react";
import { Link } from "react-router-dom";
import { Button } from "./Button";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingHero.module.css";

export function LandingHero() {
  const revealRef = useScrollReveal();

  return (
    <section id="hero" className={styles.heroSection}>
      <div className={styles.container}>
        <div ref={revealRef} className={styles.reveal}>
          <h1 className={styles.headline}>Find Problems in Your Credit Report</h1>
        </div>
        
        <div
          ref={revealRef}
          className={styles.reveal}
          style={{ transitionDelay: "100ms" }}
        >
          <p className={styles.subhead}>
            We check your Canadian credit report and show you what might be wrong.
          </p>
        </div>

        <div
          ref={revealRef}
          className={styles.reveal}
          style={{ transitionDelay: "200ms" }}
        >
          <div className={styles.actions}>
            <div className={styles.buttonGroup}>
              <Button size="lg" asChild className={styles.primaryBtn}>
                <Link to="/register">Start Free Trial</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className={styles.secondaryBtn}>
                <Link to="/try-upload">Try It Free — No Sign-Up</Link>
              </Button>
            </div>
            <p className={styles.subtext}>
              No charge for 7 days. Cancel anytime.
            </p>
            <Link to="/try-upload?guide=true" className={styles.guideLink}>
              Don't have your credit report yet? We'll show you how to get it free →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
