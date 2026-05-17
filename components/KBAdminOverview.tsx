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
import { Shield, LayoutDashboard, Users, Settings } from "lucide-react";
import styles from "./KBAdminOverview.module.css";

export const KBAdminOverview = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Admin Getting Started"
        icon={Shield}
        badge="ADMIN ONLY"
        badgeVariant="error"
      >
        <p>
          Welcome to the Admin guide. As an admin, you have full control over the app. 
          You can manage users, change compliance rules, check security logs, and control app versions.
        </p>
        <p>
          Use your power carefully. The changes you make can affect all users. Always check your work.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Admin Tools Overview"
        icon={LayoutDashboard}
        badge="NAVIGATION"
        badgeVariant="primary"
      >
        <p>
          You have access to special pages that regular users cannot see. You can find these in the sidebar.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="pages">
            <AccordionTrigger>What each page does</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>User Management:</strong> See all users. Check their usage. Reset their data or add support agents.</li>
                <li><strong>Risk Triage:</strong> Review active hidden-risk findings, open evidence context, and mark reviewed false positives.</li>
                <li><strong>Rule Check Settings:</strong> Set detector thresholds, change alert messages, configure postal pricing, and control production mode.</li>
                <li><strong>Activity Logs:</strong> See every action taken in the app. Useful for finding problems or checking security.</li>
                <li><strong>Error Logs:</strong> Review failed actions, severity, fingerprints, and expanded diagnostic details.</li>
                <li><strong>Version Management:</strong> Release new versions of the app. Control feature flags.</li>
                <li><strong>Parser Testing:</strong> Test the tool that reads credit reports to make sure it works right.</li>
                <li><strong>Parser Mappings:</strong> Review field mappings, test extraction rules, inspect history, and configure bureau detection.</li>
                <li><strong>Lifecycle Testing:</strong> Run mock user lifecycle scenarios and review generated reports.</li>
                <li><strong>AI Assist:</strong> Use guarded admin-only AI diagnostics without changing deterministic truth.</li>
                <li><strong>Security & Compliance:</strong> Review audit logs, data retention, semantic audit, domain guard, and content protection settings.</li>
                <li><strong>Support Tickets:</strong> Review, assign, answer, and escalate user support requests.</li>
                <li><strong>Legal & Rules:</strong> Review bureaus, laws, reporting-format guidance, obligations, enforcement, and regulatory updates.</li>
                <li><strong>Feature Index:</strong> Find the complete admin function list and full platform feature catalog.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Role Responsibilities"
        icon={Users}
        badge="ROLES"
        badgeVariant="info"
      >
        <p>
          It is important to know who can do what in the app. There are three main roles.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Admin:</strong> You run the system. You manage users, rules, and security.
          </li>
          <li>
            <strong>Support Agent:</strong> They help users with problems. They can read and reply to support tickets. They cannot change system settings.
          </li>
          <li>
            <strong>User:</strong> A normal person using the app to fix their credit. They can only see their own data.
          </li>
        </ul>
      </KnowledgeBaseSection>
    </div>
  );
};
