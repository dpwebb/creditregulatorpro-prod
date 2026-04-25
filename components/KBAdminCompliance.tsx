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
import { Settings, Sliders, MessageSquare, Activity } from "lucide-react";
import styles from "./KBAdminCompliance.module.css";

export const KBAdminCompliance = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Compliance Configuration"
        icon={Settings}
        badge="RULES"
        badgeVariant="primary"
      >
        <p>
          The Compliance Config page lets you tune how the scanner finds errors on credit reports. 
          You can change how strict the scanner is and what it tells the users.
        </p>
        <Button asChild variant="outline" size="sm" className={styles.actionButton}>
          <Link to="/admin-compliance-config">Go to Compliance Config</Link>
        </Button>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Detection Thresholds"
        icon={Sliders}
      >
        <p>
          Not all errors are obvious. The scanner gives a "confidence score" to show how sure it is about an error. 
          You can set a threshold for each type of error.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="thresholds">
            <AccordionTrigger>How thresholds work</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>High Threshold:</strong> The scanner will only flag an error if it is very sure. Users will see fewer alerts, but they will be highly accurate.</li>
                <li><strong>Low Threshold:</strong> The scanner will flag more possible errors. Users will see more alerts, but some might be false alarms.</li>
                <li><strong>Toggle On/Off:</strong> You can completely turn off a rule if it is causing too many problems.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Alert Messaging"
        icon={MessageSquare}
        badge="CONTENT"
        badgeVariant="info"
      >
        <p>
          When the scanner finds an error, it explains the problem to the user. 
          It also suggests what action the user should take. 
          You can edit these messages so they are easy to understand.
        </p>
        <ul className={styles.list}>
          <li><strong>User Explanation:</strong> Tell the user what went wrong in simple words. Avoid hard legal terms.</li>
          <li><strong>Recommended Action:</strong> Tell the user what to do next. For example, "Create a dispute packet to challenge this date."</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="App-Wide Settings"
        icon={Activity}
        badge="SYSTEM"
        badgeVariant="warning"
      >
        <p>
          You can also change settings that affect the whole app. 
          For example, you can toggle "Production Mode".
        </p>
        <p>
          When Production Mode is on, users must pay to use the app after their trial ends. 
          When it is off, billing checks are skipped. Be very careful with this setting.
        </p>
      </KnowledgeBaseSection>
    </div>
  );
};