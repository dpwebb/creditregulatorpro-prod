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
            Monitor which dispute vectors (e.g., "Metro 2 Header Mismatch") are resulting in corrections, removals, or useful responses. If a specific vector has a low success rate, consider a different evidence-backed challenge strategy.
          </p>
        </div>

        <div className={styles.strategyCard}>
          <TrendingUp className={styles.strategyIcon} />
          <h3>Creditor Profiling</h3>
          <p>
            Recognize which creditors respond clearly and which often require stronger documentation. If analytics show a specific creditor rarely responds to digital challenges, consider registered mail for those items.
          </p>
        </div>

        <div className={styles.strategyCard}>
          <ShieldCheck className={styles.strategyIcon} />
          <h3>Finding Focus</h3>
          <p>
            Prioritize disputes based on finding type data. Findings that historically lead to higher Pressure Scores often trigger faster responses from compliance departments.
          </p>
        </div>
      </div>
    </KnowledgeBaseSection>
  );
};
