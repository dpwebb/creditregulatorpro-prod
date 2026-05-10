import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { LayoutDashboard, Filter, Download, PieChart } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./Accordion";
import styles from "./KBAnalyticsSuccessDashboard.module.css";

export const KBAnalyticsSuccessDashboard = () => {
  return (
    <KnowledgeBaseSection
      id="success-dashboard"
      title="Success Rate Analytics Dashboard"
      icon={LayoutDashboard}
      badge="New Feature"
      badgeVariant="primary"
    >
      <p>
        The Success Rate Analytics Dashboard provides a granular view of dispute performance across multiple dimensions, helping you optimize evidence-backed challenge strategy.
      </p>

      <Accordion type="single" collapsible className={styles.accordion}>
        <AccordionItem value="overall-metrics">
          <AccordionTrigger>Overall Performance Metrics</AccordionTrigger>
          <AccordionContent>
            <div className={styles.metricsList}>
              <div className={styles.metricItem}>
                <strong>Total Challenges:</strong> The absolute count of items disputed within the selected period.
              </div>
              <div className={styles.metricItem}>
                <strong>Success Rate:</strong> The percentage of closed challenges that resulted in a positive correction or deletion.
              </div>
              <div className={styles.metricItem}>
                <strong>Avg Response Time:</strong> The mean duration between sending a packet and receiving a final determination.
              </div>
              <div className={styles.metricItem}>
                <strong>Escalation Rate:</strong> How often a first-round dispute requires secondary or tertiary escalation.
              </div>
              <div className={styles.metricItem}>
                <strong>Exhaustion Rate:</strong> The percentage of items that have reached the "Procedurally Exhausted" state, making them candidates for escalation review.
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="breakdown-views">
          <AccordionTrigger>Detailed Breakdown Views</AccordionTrigger>
          <AccordionContent>
            <p>You can toggle between four primary views to analyze data from different angles:</p>
            <ul>
              <li><strong>By Vector:</strong> Compare the effectiveness of different dispute methods (e.g., Metro 2 Compliance vs. Direct Verification).</li>
              <li><strong>By Finding:</strong> Identify which compliance finding types and authority mappings yield the highest deletion rates.</li>
              <li><strong>By Furnisher:</strong> Track the responsiveness and compliance history of specific banks and collection agencies.</li>
              <li><strong>By Bureau:</strong> Compare performance metrics between Equifax and TransUnion.</li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="visualizations">
          <AccordionTrigger>Interpreting Visualizations</AccordionTrigger>
          <AccordionContent>
            <div className={styles.visualGuide}>
              <div className={styles.guideItem}>
                <PieChart size={16} className={styles.guideIcon} />
                <p><strong>Color Coding:</strong> Green indicates successful deletions/corrections, Amber indicates updated/verified items, and Red indicates items still under dispute or failed verification.</p>
              </div>
              <div className={styles.guideItem}>
                <Filter size={16} className={styles.guideIcon} />
                <p><strong>Date Filtering:</strong> Use the global date picker to filter results by specific months, quarters, or custom ranges to track seasonal trends.</p>
              </div>
              <div className={styles.guideItem}>
                <Download size={16} className={styles.guideIcon} />
                <p><strong>Exporting:</strong> All charts and underlying data tables can be exported as PDF or CSV reports for client presentations or evidence folders.</p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </KnowledgeBaseSection>
  );
};
