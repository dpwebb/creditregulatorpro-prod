import React from "react";
import { Link } from "react-router-dom";
import { BarChart3, CheckCircle2, Zap } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./Accordion";
import { Badge } from "./Badge";
import styles from "./KBObligationsSuccessMetrics.module.css";

export const KBObligationsSuccessMetrics = () => {
  return (
    <Accordion type="single" collapsible className={styles.accordion}>
      <AccordionItem value="success-metrics-overview">
        <AccordionTrigger>Recording Success Metrics for Analytics</AccordionTrigger>
        <AccordionContent>
          <div className={styles.container}>
            <p>
              To track the effectiveness of different dispute strategies, Credit Regulator Pro automatically captures outcomes in the <code>success_metric</code> table.
            </p>

            <div className={styles.callout}>
              <Zap size={18} className={styles.calloutIcon} />
              <p>
                When an obligation instance is completed, developers should ensure the <code>recordSuccess</code> helper from <code>successAnalytics</code> is invoked.
              </p>
            </div>

            <div className={styles.details}>
              <h4>Captured Data Points</h4>
              <p>The system automatically logs the following for every recorded outcome:</p>
              <ul>
                <li><strong>Dispute Vector:</strong> The strategy used (e.g., AUTHORITY_TO_REPORT).</li>
                <li><strong>Entity:</strong> The specific Furnisher, Bureau, or Collector involved.</li>
                <li><strong>Violation Category:</strong> The type of obligation breached.</li>
                <li><strong>Outcome:</strong> The final result from the responding party.</li>
                <li><strong>Response Time:</strong> Latency between challenge and resolution.</li>
              </ul>
            </div>

            <div className={styles.outcomes}>
              <h4>Success Criteria</h4>
              <p>Only the following outcomes are flagged as "Successful" in reports:</p>
              <div className={styles.badgeGrid}>
                <Badge variant="success">DELETED</Badge>
                <Badge variant="success">CORRECTED</Badge>
                <Badge variant="success">REMOVED</Badge>
                <Badge variant="success">UPDATED</Badge>
              </div>
            </div>

            <div className={styles.footer}>
              <p>
                These metrics power the comprehensive <Link to="/analytics-dashboard" className={styles.link}><BarChart3 size={14} /> Analytics Dashboard</Link>.
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};