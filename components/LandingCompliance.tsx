import React from "react";
import { Check, X } from "lucide-react";
import { useScrollReveal } from "../helpers/useScrollReveal";
import styles from "./LandingCompliance.module.css";

export function LandingCompliance() {
  const revealRef = useScrollReveal();

  const doesList = [
    "Check your report for problems",
    "Show you what might be wrong",
    "Create letters you can send",
  ];

  const doNotDoList = [
    "We don't fix your credit",
    "We don't contact companies for you",
    "You stay in control",
  ];

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.grid}>
          <div
            ref={revealRef}
            className={`${styles.card} ${styles.reveal}`}
            style={{ transitionDelay: "0ms" }}
          >
            <h3 className={styles.cardTitle}>What This Tool Does</h3>
            <ul className={styles.list}>
              {doesList.map((item, index) => (
                <li key={index} className={styles.listItem}>
                  <Check className={styles.iconCheck} />
                  <span className={styles.itemText}>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            ref={revealRef}
            className={`${styles.card} ${styles.reveal}`}
            style={{ transitionDelay: "150ms" }}
          >
            <h3 className={styles.cardTitle}>What We Do Not Do</h3>
            <ul className={styles.list}>
              {doNotDoList.map((item, index) => (
                <li key={index} className={styles.listItem}>
                  <X className={styles.iconX} />
                  <span className={styles.itemText}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}