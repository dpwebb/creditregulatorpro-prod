import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingProblemAwareness.module.css";

export function LandingProblemAwareness() {
  const revealRef = useScrollReveal();

  const problems = [
    "Wrong balances",
    "Accounts that are not yours",
    "Late payments reported incorrectly",
  ];

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div ref={revealRef} className={styles.reveal}>
          <h2 className={styles.title}>
            Most People Miss Problems in Their Credit Report
          </h2>
        </div>

        <div className={styles.list}>
          {problems.map((problem, index) => (
            <div
              key={index}
              ref={revealRef}
              className={`${styles.listItem} ${styles.reveal}`}
              style={{ transitionDelay: `${(index + 1) * 100}ms` }}
            >
              <AlertTriangle className={styles.icon} />
              <span className={styles.itemText}>{problem}</span>
            </div>
          ))}
        </div>

        <div
          ref={revealRef}
          className={styles.reveal}
          style={{ transitionDelay: `${(problems.length + 1) * 100}ms` }}
        >
          <p className={styles.finalLine}>
            You will not see these unless you check carefully.
          </p>
          <div className={styles.ctaWrapper}>
            <Button size="lg" asChild className={styles.cta}>
              <Link to="/register">Start Free Trial</Link>
            </Button>
            <Link to="/try-upload" className={styles.secondaryLink}>
              Or upload your report and see for yourself &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}