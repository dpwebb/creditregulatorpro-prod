import React from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Button } from "./Button";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingValuePreview.module.css";

export function LandingValuePreview() {
  const revealRef = useScrollReveal();

  const values = [
    "Incorrect account details",
    "Missing information",
    "Reporting errors",
  ];

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div ref={revealRef} className={styles.reveal}>
          <h2 className={styles.title}>See What We Find</h2>
          <p className={styles.contentLine}>
            We highlight possible problems in your report before you pay.
          </p>
        </div>

        <div className={styles.grid}>
          {values.map((value, index) => (
            <div
              key={index}
              ref={revealRef}
              className={`${styles.card} ${styles.reveal}`}
              style={{ transitionDelay: `${(index + 1) * 100}ms` }}
            >
              <div className={styles.iconWrapper}>
                <Search size={20} />
              </div>
              <span className={styles.cardText}>{value}</span>
            </div>
          ))}
        </div>

        <div
          ref={revealRef}
          className={styles.reveal}
          style={{ transitionDelay: `${(values.length + 1) * 100}ms` }}
        >
          <div className={styles.ctaWrapper}>
            <Button size="lg" asChild className={styles.cta}>
              <Link to="/try-upload">Upload Your Report Free</Link>
            </Button>
            <Link to="/register" className={styles.secondaryLink}>
              or start your free trial &rarr;
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}