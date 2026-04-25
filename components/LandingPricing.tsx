import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingPricing.module.css";

export function LandingPricing() {
  const revealRef = useScrollReveal();

  const monthlyFeatures = ["No charge today", "Cancel anytime", "No contracts"];
  const annualFeatures = ["No charge today", "Saves ~$178 a year", "Cancel anytime"];

  return (
    <section id="pricing" className={styles.section}>
      <div className={styles.container}>
        <div ref={revealRef} className={styles.reveal}>
          <h2 className={styles.sectionTitle}>Start Free</h2>
        </div>

        <div className={styles.planWrapper}>
          <div className={styles.cardsContainer}>
            <div
              ref={revealRef}
              className={`${styles.card} ${styles.reveal}`}
            >
              <div className={styles.cardHeader}>
                <h3 className={styles.planTitle}>7-Day Free Trial</h3>
                <p className={styles.planSubtitle}>$19 CAD/month after trial</p>
              </div>

              <div className={styles.cardBody}>
                <ul className={styles.featureList}>
                  {monthlyFeatures.map((feature, i) => (
                    <li key={i} className={styles.featureItem}>
                      <CheckCircle2 className={styles.checkIcon} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.cardFooter}>
                <Button variant="secondary" size="lg" asChild className={styles.planButton}>
                  <Link to="/register">Start Free Trial</Link>
                </Button>
              </div>
            </div>

            <div
              ref={revealRef}
              className={`${styles.card} ${styles.cardHighlighted} ${styles.reveal}`}
            >
              <div className={styles.badgeWrapper}>
                <Badge variant="primary">Best Value</Badge>
              </div>
              <div className={styles.cardHeader}>
                <h3 className={styles.planTitle}>7-Day Free Trial</h3>
                <p className={styles.planSubtitle}>$49.99 CAD/year after trial</p>
              </div>

              <div className={styles.cardBody}>
                <ul className={styles.featureList}>
                  {annualFeatures.map((feature, i) => (
                    <li key={i} className={styles.featureItem}>
                      <CheckCircle2 className={styles.checkIcon} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.cardFooter}>
                <Button variant="primary" size="lg" asChild className={styles.planButton}>
                  <Link to="/register">Start Free Trial</Link>
                </Button>
              </div>
            </div>
          </div>
          
          <div ref={revealRef} className={`${styles.billingDetails} ${styles.reveal}`}>
            <h4 className={styles.billingTitle}>Billing Details</h4>
            <p className={styles.billingText}>Your trial is free for 7 days.</p>
            <p className={styles.billingText}>After 7 days, you will be charged either $19 CAD/month or $49.99 CAD/year depending on your choice.</p>
            <p className={styles.billingText}>Cancel before 7 days to avoid charges.</p>
          </div>
        </div>
      </div>

      <div className={styles.ctaWrapper}>
        <div ref={revealRef} className={`${styles.ctaBox} ${styles.reveal}`}>
          <h2 className={styles.ctaTitle}>Start your free trial and check your credit report</h2>
          <Button variant="primary" size="lg" asChild className={styles.ctaButton}>
            <Link to="/register">Start Free Trial</Link>
          </Button>
          <p className={styles.ctaSubtext}>No charge today</p>
        </div>
      </div>
    </section>
  );
}