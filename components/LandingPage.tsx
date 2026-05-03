import { useEffect } from "react";
import { LandingHeader } from "./LandingHeader";
import { LandingHero } from "./LandingHero";
import { LandingProblemAwareness } from "./LandingProblemAwareness";
import { LandingHowItWorks } from "./LandingHowItWorks";
import { LandingFeatures } from "./LandingFeatures";
import { LandingValuePreview } from "./LandingValuePreview";
import { LandingPricing } from "./LandingPricing";
import { LandingCompliance } from "./LandingCompliance";
import { LandingFooter } from "./LandingFooter";
import styles from "./LandingPage.module.css";

export function LandingPage() {
  // Ensure the page starts at the top when loaded
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className={styles.layout}>
      <LandingHeader />
      <main className={styles.main}>
        <LandingHero />
        <LandingProblemAwareness />
        <LandingHowItWorks />
        <LandingFeatures />
        <LandingValuePreview />
        <LandingPricing />
        <LandingCompliance />
      </main>
      <LandingFooter />
    </div>
  );
}