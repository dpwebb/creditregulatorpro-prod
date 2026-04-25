import React from "react";
import { Terminal, ShieldCheck, Clock, Bell, Globe, Info } from "lucide-react";
import styles from "./autoEscalationSetup.module.css";

/**
 * Configuration constants for the Auto-Escalation system.
 * Adheres to Credit Regulator Pro regional policies.
 */
export const AUTO_ESCALATION_CONFIG = {
  recommendedFrequency: "Every 6 to 12 hours",
  offPeakHours: "02:00 - 05:00 EST",
  webhookPath: "/_api/escalation/auto-trigger",
  region: "CA",
  maxRetries: 3,
  retentionPeriod: "1 year",
};

/**
 * Returns the full webhook URL for the auto-trigger endpoint.
 */
export const getAutoEscalationWebhookUrl = () => {
  // Returns the production URL as requested
  return `https://creditregulatorpro.com${AUTO_ESCALATION_CONFIG.webhookPath}`;
};

/**
 * Raw documentation string for programmatic use or simple text displays.
 

 */
export const AUTO_ESCALATION_DOCS_RAW = `
Credit Regulator Pro AUTO-ESCALATION SETUP GUIDE
Region: ${AUTO_ESCALATION_CONFIG.region} Only

1. WEBHOOK CONFIGURATION
URL: ${getAutoEscalationWebhookUrl()}
Method: POST
Payload: {} (Empty JSON object)

2. AUTHENTICATION
The endpoint requires an Admin session. 
Header: Cookie: floot_built_app_session=[YOUR_ADMIN_SESSION_TOKEN]
Note: Ensure the session token is kept secure and refreshed as needed.

3. CRON SCHEDULE RECOMMENDATIONS
- High Frequency: 0 */6 * * * (Every 6 hours) - Recommended for prompt response handling.
- Daily: 0 3 * * * (Daily at 3 AM EST) - Recommended for lower system load.

4. MONITORING & COMPLIANCE
- Check the 'summary' object in the JSON response.
- 'triggeredCount' indicates successful escalations.
- 'errors' array contains specific failures that require manual review.
- All events are logged in the Audit Trail for 1 year.
- Disputes progress through a 4-phase escalation cycle (Phase 1 through Phase 4).
`.trim();

/**
 * A UI component that displays the setup instructions in a clean, modern layout.
 */
export const AutoEscalationSetupGuide: React.FC = () => {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.iconWrapper}>
          <Terminal size={20} />
        </div>
        <div>
          <h3 className={styles.title}>Auto-Escalation Setup</h3>
          <p className={styles.subtitle}>Configure external cron services for automated processing.</p>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Globe size={16} className={styles.sectionIcon} />
            <h4>Webhook Endpoint</h4>
          </div>
          <div className={styles.codeBlock}>
            <code>POST {getAutoEscalationWebhookUrl()}</code>
          </div>
          <p className={styles.description}>
            This endpoint scans for obligations where the response deadline has passed without a recorded response.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <ShieldCheck size={16} className={styles.sectionIcon} />
            <h4>Authentication</h4>
          </div>
          <p className={styles.description}>
            Requests must include a precise Admin session cookie. Use a dedicated service account for automation.
          </p>
          <div className={styles.codeBlock}>
            <code>Cookie: floot_built_app_session=...</code>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Clock size={16} className={styles.sectionIcon} />
            <h4>Scheduling Patterns</h4>
          </div>
          <ul className={styles.list}>
            <li>
              <strong>Every 6 Hours:</strong> <code>0 */6 * * *</code>
              <span>Best for high-volume environments.</span>
            </li>
            <li>
              <strong>Daily (Off-peak):</strong> <code>0 4 * * *</code>
              <span>Recommended to minimize system load during business hours.</span>
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Bell size={16} className={styles.sectionIcon} />
            <h4>Monitoring Best Practices</h4>
          </div>
          <p className={styles.description}>
            The system returns a summary of actions. Monitor the <code>errors</code> array in the response payload.
          </p>
          <div className={styles.infoBox}>
            <Info size={14} />
            <span>
              All escalations adhere to the 1-year evidence retention policy. Disputes progress through a
              <strong> 4-phase escalation cycle</strong> (Phase 1 through Phase 4: Procedural Exhaustion).
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};