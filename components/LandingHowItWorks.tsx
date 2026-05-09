import { Link } from "react-router-dom";
import { Upload, Search, ShieldCheck } from "lucide-react";
import { Button } from "./Button";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingHowItWorks.module.css";

export function LandingHowItWorks() {
  const revealRef = useScrollReveal();

  const steps = [
    {
      number: "01",
      icon: <Upload size={20} />,
      title: "Upload Your Report",
      description: "Upload your credit report PDF",
    },
    {
      number: "02",
      icon: <Search size={20} />,
      title: "Automated Analysis",
      description: "We scan it for errors and compliance findings",
    },
    {
      number: "03",
      icon: <ShieldCheck size={20} />,
      title: "Review Findings",
      description: "See what we found, instantly",
    },
  ];

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div ref={revealRef} className={styles.reveal}>
          <h2 className={styles.title}>How It Works</h2>
        </div>

        <div className={styles.steps}>
          {steps.map((step, index) => (
            <div
              key={index}
              ref={revealRef}
              className={`${styles.step} ${styles.reveal}`}
              style={{ transitionDelay: `${(index + 1) * 100}ms` }}
            >
              <div className={styles.iconWrapper}>{step.icon}</div>
              <div className={styles.stepNumber}>{step.number}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDescription}>{step.description}</p>
            </div>
          ))}
        </div>

        <div
          ref={revealRef}
          className={`${styles.ctaSection} ${styles.reveal}`}
          style={{ transitionDelay: `${(steps.length + 1) * 100}ms` }}
        >
          <Button size="lg" asChild className={styles.cta}>
            <Link to="/try-upload">Try It Now — Free</Link>
          </Button>
          <p className={styles.reassurance}>
            No sign-up needed. We only save your report if you create an account.
          </p>
        </div>
      </div>
    </section>
  );
}
