import React from "react";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingFeatures.module.css";

const STEPS = [
  { num: "1", text: "Upload your credit report" },
  { num: "2", text: "We scan it for problems" },
  { num: "3", text: "You see what might be wrong" },
  { num: "4", text: "We create letters for you" },
];

export function LandingFeatures() {
  const revealRef = useScrollReveal();

  return (
    <section id="how-it-works" className={styles.section}>
      <div className={styles.container}>
        <div className={styles.howItWorksWrapper}>
          <div ref={revealRef} className={styles.reveal}>
            <h2 className={styles.sectionTitle}>How It Works</h2>
          </div>
          <div className={styles.stepsFlow}>
            {STEPS.map((step, index) => (
              <React.Fragment key={index}>
                <div
                  ref={revealRef}
                  className={`${styles.stepItem} ${styles.reveal}`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  <div className={styles.stepNumber}>{step.num}</div>
                  <p className={styles.stepText}>{step.text}</p>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    ref={revealRef}
                    className={`${styles.stepConnector} ${styles.reveal}`}
                    style={{ transitionDelay: `${(index * 100) + 50}ms` }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}