import React from "react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./Accordion";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { KnowledgeBaseSection } from "./KnowledgeBaseSection";
import { Activity, Clock, Mail, BookOpen, LifeBuoy, Shield, AlertCircle, Database } from "lucide-react";
import styles from "./KBAdminOperations.module.css";

export const KBAdminOperations = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Activity Logs"
        icon={Activity}
        badge="SECURITY"
        badgeVariant="error"
      >
        <p>
          The Activity Logs show every major action taken in the app. 
          You can use this to investigate issues or monitor security.
        </p>
        <ul className={styles.list}>
          <li><strong>Filter by Type:</strong> Look only for logins, logouts, or data updates.</li>
          <li><strong>Date Range:</strong> Find actions that happened on a specific day.</li>
          <li><strong>User ID:</strong> See what a specific person did.</li>
          <li><strong>Expand Details:</strong> Click a log entry to see extra data, like error messages or IP addresses.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-activity-logs">Go to Activity Logs</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Security Logs"
        icon={Shield}
        badge="MONITORING"
        badgeVariant="info"
      >
        <p>
          The Security Logs page lets you watch for strange account activity. You can see who logged in, who failed to log in, their IP addresses, and any suspicious actions.
        </p>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-security">Go to Security Logs</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Error Logs"
        icon={AlertCircle}
        badge="DEBUGGING"
        badgeVariant="warning"
      >
        <p>
          The Error Logs page shows system errors, failed tasks, and when parts of the app break. This is very helpful when you need to investigate a bug that a user reported.
        </p>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-error-logs">Go to Error Logs</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Domain Guard & Anti-Duplication"
        icon={Shield}
        badge="SECURITY"
        badgeVariant="error"
      >
        <p>
          These tools stop bad actors from scraping our app or using our API from other websites.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="domain-guard">
            <AccordionTrigger>Domain Guard & Fingerprints</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Domain Guard:</strong> Checks that requests come from allowed websites.</li>
                <li><strong>Modes:</strong> It can be "log_only" (default, just records issues) or "enforce" (blocks bad requests with a 403 error). Change this in Admin Settings (key: DOMAIN_GUARD_MODE).</li>
                <li><strong>Fingerprints:</strong> We track requests using a secure hash of the IP, User-Agent, and Accept headers.</li>
                <li><strong>Suspicious Activity:</strong> If a fingerprint hits more than 50 different endpoints or makes over 200 requests in 5 minutes, it gets logged in the suspicious_activity_log table.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="content-protection">
            <AccordionTrigger>Content Protection & Watermarks</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Watermarks:</strong> All PDFs get an invisible user ID and timestamp. This uses hidden text, diagonal marks, and file metadata.</li>
                <li><strong>Proprietary Content:</strong> Special parts of the app (like this KB or compliance results) stop copying and right-clicking. Admins and Support staff bypass this automatically.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Data Retention"
        icon={Clock}
        badge="POLICY"
        badgeVariant="warning"
      >
        <p>
          We follow strict privacy rules. The app must not keep user data forever.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="retention">
            <AccordionTrigger>1-Year Policy</AccordionTrigger>
            <AccordionContent>
              <p>
                All evidence and generated packets are kept for exactly 1 year. 
                After 365 days, the system deletes them automatically. 
                You can view stats in the Security Dashboard to see how much data was recently purged.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Data Retention Dashboard"
        icon={Database}
        badge="COMPLIANCE"
        badgeVariant="primary"
      >
        <p>
          The Data Retention Dashboard shows you stats on how much old data has been deleted, what will be deleted soon, and how the app follows our data rules. An automatic background job (cron job) runs to purge data when it expires.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Postal Revenue"
        icon={Mail}
        badge="BILLING"
        badgeVariant="success"
      >
        <p>
          When users mail physical letters, we use PostGrid to send them. 
          We charge a markup on the base postage cost to cover our system expenses.
        </p>
        <p>
          You can review these mail transactions to track how much revenue we are making from physical mailings.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Regulatory Updates"
        icon={BookOpen}
        badge="COMPLIANCE"
        badgeVariant="primary"
      >
        <p>
          The laws around credit reporting can change. 
          You must track these changes so the app's dispute letters stay accurate.
        </p>
        <ul className={styles.list}>
          <li>Review new updates detected by the system.</li>
          <li>Create manual updates if you read about a new law.</li>
          <li>Apply or roll back changes to the app's rules engine.</li>
        </ul>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/regulatory-updates">Go to Regulatory Updates</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Support Ticket Queue"
        icon={LifeBuoy}
        badge="SUPPORT"
        badgeVariant="info"
      >
        <p>
          As an admin, you can see every support ticket in the system.
        </p>
        <p>
          While Support Agents normally handle these, you can step in to reassign tickets, update their status, or answer difficult questions. You can filter tickets to find the urgent ones quickly.
        </p>
      </KnowledgeBaseSection>
    </div>
  );
};