import React from "react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { Lightbulb, Target, TrendingUp, ShieldCheck } from "lucide-react";
import styles from "./KBAnalyticsStrategy.module.css";

export const KBAnalyticsStrategy = () => {
  return (
    <KnowledgeBaseSection
      id="analytics-strategy"
      title="Using Analytics to Improve Strategy"
      icon={Lightbulb}
    >
      <p>
        Data-driven disputing is the core of the Credit Regulator Pro methodology. Use these insights to refine your approach for better client outcomes.
      </p>

      <div className={styles.strategyGrid}>
        <div className={styles.strategyCard}>
          <Target className={styles.strategyIcon} />
          <h3>Vector Optimization</h3>
          <p>
            Monitor which dispute vectors (e.g., "Metro 2 Header Mismatch") are resulting in immediate deletions. If a specific vector has a success rate below 10%, consider switching to a more aggressive legal challenge.
          </p>
        </div>

        <div className={styles.strategyCard}>
          <TrendingUp className={styles.strategyIcon} />
          <h3>Creditor Profiling</h3>
          <p>
            Recognize which creditors are "hard" vs "soft" targets. If analytics show a specific creditor ignores 90% of automated challenges, move directly to Certified Mail for those items.
          </p>
        </div>

        <div className={styles.strategyCard}>
          <ShieldCheck className={styles.strategyIcon} />
          <h3>Violation Focus</h3>
          <p>
            Prioritize disputes based on violation type data. Violations that historically lead to higher Pressure Scores often trigger faster responses from compliance departments.
          </p>
        </div>
      </div>
    </KnowledgeBaseSection>
  );
};