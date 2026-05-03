import { ArrowDown } from "lucide-react";
import { Badge } from "./Badge";
import styles from "./KBObligationsVectorProgression.module.css";

export const KBObligationsVectorProgression = () => {
  return (
    <div className={styles.container}>
      <div className={styles.phaseCard}>
        <div className={styles.phaseHeader}>
          <Badge variant="primary">Phase 1</Badge>
          <h4>The Basics</h4>
        </div>
        <div className={styles.vectorList}>
          <div className={styles.vectorItem}>
            <span>AUTHORITY_TO_REPORT</span>
            <p>Right to Report</p>
          </div>
          <div className={styles.vectorItem}>
            <span>PERMISSIBLE_PURPOSE</span>
            <p>Valid Reason</p>
          </div>
        </div>
      </div>
      
      <ArrowDown className={styles.arrow} />

      <div className={styles.phaseCard}>
        <div className={styles.phaseHeader}>
          <Badge variant="primary">Phase 2</Badge>
          <h4>The Process</h4>
        </div>
        <div className={styles.vectorList}>
          <div className={styles.vectorItem}>
            <span>VERIFICATION_METHOD</span>
            <p>How They Checked</p>
          </div>
          <div className={styles.vectorItem}>
            <span>COMPLETENESS_ATTESTATION</span>
            <p>Complete Information</p>
          </div>
        </div>
      </div>

      <ArrowDown className={styles.arrow} />

      <div className={styles.phaseCard}>
        <div className={styles.phaseHeader}>
          <Badge variant="primary">Phase 3</Badge>
          <h4>The Details</h4>
        </div>
        <div className={styles.vectorList}>
          <div className={styles.vectorItem}>
            <span>ACCURACY_ATTESTATION</span>
            <p>Accurate Information</p>
          </div>
          <div className={styles.vectorItem}>
            <span>INVESTIGATION_PROCEDURE</span>
            <p>How They Investigated</p>
          </div>
        </div>
      </div>

      <ArrowDown className={styles.arrow} />

      <div className={styles.phaseCard}>
        <div className={styles.phaseHeader}>
          <Badge variant="error">Phase 4</Badge>
          <h4>Final Steps</h4>
        </div>
        <div className={styles.vectorList}>
          <div className={styles.vectorItem}>
            <span>TIMING_COMPLIANCE</span>
            <p>Missed Deadlines</p>
          </div>
        </div>
      </div>
    </div>
  );
};