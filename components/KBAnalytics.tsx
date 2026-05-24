import { Link } from "react-router-dom";
import { BarChart3, FileSearch, TrendingUp, Target } from "lucide-react";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import { KBAnalyticsSuccessDashboard } from "./KBAnalyticsSuccessDashboard";
import { KBAnalyticsStrategy } from "./KBAnalyticsStrategy";
import styles from "./KBAnalytics.module.css";

export const KBAnalytics = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        id="success-rate-analytics"
        title="Success Rate Analytics"
        icon={TrendingUp}
        badge="MULTI-DIMENSIONAL"
        badgeVariant="primary"
      >
        <p>
          Credit Regulator Pro tracks success rates across multiple dimensions to identify systemic compliance
          patterns and effective challenge strategies.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="dimensions">
            <AccordionTrigger>Tracking Dimensions</AccordionTrigger>
            <AccordionContent>
              <div className={styles.dimensionGrid}>
                <div className={styles.dimensionCard}>
                  <h4>By Dispute Vector</h4>
                  <p>
                    Identifies which vectors (AUTHORITY_TO_REPORT, VERIFICATION_METHOD, etc.)
                    are most effective for deletion/correction.
                  </p>
                  <ul className={styles.metricList}>
                    <li>Total challenges per vector</li>
                    <li>Success count and rate</li>
                    <li>Average response time in days</li>
                  </ul>
                </div>

                <div className={styles.dimensionCard}>
                  <h4>By Creditor</h4>
                  <p>
                    Tracks compliance patterns for specific creditors and collection agencies
                    to identify repeat unresolved patterns.
                  </p>
                  <ul className={styles.metricList}>
                    <li>Creditor-specific success rates</li>
                    <li>Response compliance history</li>
                    <li>Procedural finding frequency</li>
                  </ul>
                </div>

                <div className={styles.dimensionCard}>
                  <h4>By Bureau</h4>
                  <p>
                    Compares Equifax vs TransUnion investigation quality and response timeliness.
                  </p>
                  <ul className={styles.metricList}>
                    <li>Bureau-specific deletion rates</li>
                    <li>Investigation deadline compliance</li>
                    <li>Response quality scores</li>
                  </ul>
                </div>

                <div className={styles.dimensionCard}>
                  <h4>By Finding Category</h4>
                  <p>
                    Measures which compliance findings (chronology conflicts, reporting-standard issues,
                    etc.) lead to successful outcomes.
                  </p>
                  <ul className={styles.metricList}>
                    <li>Success rate per finding type</li>
                    <li>Severity impact on outcomes</li>
                    <li>Combined finding effectiveness</li>
                  </ul>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="success-outcomes">
            <AccordionTrigger>Success Outcome Definitions</AccordionTrigger>
            <AccordionContent>
              <p>
                The system considers the following outcomes as "successful":
              </p>
              <ul className={styles.outcomeList}>
                <li>
                  <Badge variant="success">DELETED</Badge>
                  <span>Account completely removed from credit report</span>
                </li>
                <li>
                  <Badge variant="success">CORRECTED</Badge>
                  <span>Error corrected (balance, status, dates, etc.)</span>
                </li>
                <li>
                  <Badge variant="success">REMOVED</Badge>
                  <span>Negative information removed while account remains</span>
                </li>
                <li>
                  <Badge variant="success">UPDATED</Badge>
                  <span>Reporting updated to accurate status</span>
                </li>
              </ul>
              <p className={styles.calculationNote}>
                <strong>Success Rate Calculation:</strong> (Successful Outcomes / Total Closed Challenges) × 100
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="analytics-dashboard"
        title="Analytics Dashboard & Metrics"
        icon={BarChart3}
      >
        <p>
          The <Link to="/analytics-dashboard">Analytics Dashboard</Link>{" "}
          provides high-level insights into the performance of your dispute
          campaigns.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="key-metrics">
            <AccordionTrigger>Key Metrics Explained</AccordionTrigger>
            <AccordionContent>
              <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                  <h4>Success Rate</h4>
                  <p>
                    Percentage of challenged items with a "Successful" outcome:{" "}
                    <strong>DELETED</strong>, <strong>CORRECTED</strong>,{" "}
                    <strong>REMOVED</strong>, or <strong>UPDATED</strong>.
                  </p>
                </div>
                <div className={styles.metricCard}>
                  <h4>Avg. Response Time</h4>
                  <p>Average days taken by a bureau/creditor to respond to a packet.</p>
                </div>
                <div className={styles.metricCard}>
                  <h4>Pressure Score</h4>
                  <p>A calculated index (0-100) indicating how much documented challenge activity exists for a specific tradeline.</p>
                </div>
                <div className={styles.metricCard}>
                  <h4>Exhaustion Rate</h4>
                  <p>Percentage of tradelines that have reached the final Phase 4 procedural exhaustion state.</p>
                </div>
              </div>
              <div className={styles.metricExplanation}>
                <p>
                  <strong>Exhaustion Rate Calculation:</strong> (Phase 4 Tradelines / Total Tradelines) × 100
                </p>
                <p>
                  A tradeline is considered exhausted only when it reaches <strong>Phase 4</strong>.
                  Prior phases are considered "Active Challenges".
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pressure-score">
            <AccordionTrigger>Understanding Pressure Score</AccordionTrigger>
            <AccordionContent>
              <p>
                The Pressure Score is proprietary to Credit Regulator Pro. It increases based on:
              </p>
              <ul>
                <li><strong>Unanswered Challenges:</strong> +10 points per missed response deadline</li>
                <li><strong>Reporting-standard finding severity:</strong> +5 for WARNING, +15 for ERROR severity</li>
                <li><strong>Time Since Procedural Exhaustion:</strong> +2 points per month elapsed</li>
                <li><strong>Regulatory Complaints Filed:</strong> +20 points per provincial regulator complaint</li>
              </ul>
              <div className={styles.scoreGuide}>
                <h4>Score Interpretation Guide</h4>
                <div className={styles.scoreRange}>
                  <Badge variant="default">0-30</Badge>
                  <span>Low pressure - Initial disputes</span>
                </div>
                <div className={styles.scoreRange}>
                  <Badge variant="warning">31-60</Badge>
                  <span>Moderate pressure - Multiple findings detected</span>
                </div>
                <div className={styles.scoreRange}>
                  <Badge variant="error">61-80</Badge>
                  <span>High pressure - Near procedural exhaustion</span>
                </div>
                <div className={styles.scoreRange}>
                  <Badge variant="error">81-100</Badge>
                  <span>Critical pressure - Review for escalation or outside advice</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KBAnalyticsSuccessDashboard />

      <KBAnalyticsStrategy />

      <KnowledgeBaseSection
        id="vector-rotation-analytics"
        title="Vector Rotation Analytics"
        icon={Target}
        badge="STRATEGY OPTIMIZATION"
      >
        <p>
          Analyze which dispute vector rotations are most effective for specific finding types.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="rotation-effectiveness">
            <AccordionTrigger>Rotation Effectiveness Tracking</AccordionTrigger>
            <AccordionContent>
              <p>
                The system tracks which sequence combinations lead to successful outcomes:
              </p>
              <ul>
                <li>Most effective first vector per finding category</li>
                <li>Average sequences needed to reach a closed outcome</li>
                <li>Creditor-specific rotation patterns that work</li>
                <li>Vector combinations that trigger escalation</li>
              </ul>
              <p>
                This data informs automatic vector selection when the compliance scanner
                detects new findings.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        id="audit-logs"
        title="Audit & Reporting"
        icon={FileSearch}
        badge="Compliance"
      >
        <p>
          Every action in Credit Regulator Pro is logged for compliance and evidence purposes.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="audit-trail">
            <AccordionTrigger>Compliance Audit Trail</AccordionTrigger>
            <AccordionContent>
              <p>
                The <Link to="/compliance-audit">Compliance Audit</Link> page
                shows a chronological history of all system events.
              </p>
              <p>
                This trail is designed to help document that disputes were sent,
                responses were received or missed, and key events were preserved.
              </p>
              <p>
                Audit logs include:
              </p>
              <ul>
                <li>Action type (LOGIN, CREATE, UPDATE, DELETE, etc.)</li>
                <li>Entity type and ID affected</li>
                <li>User ID and IP address</li>
                <li>Timestamp with microsecond precision</li>
                <li>Status (SUCCESS/FAILURE) with error messages</li>
                <li>Detailed change records (before/after states)</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </KnowledgeBaseSection>
    </div>
  );
};
