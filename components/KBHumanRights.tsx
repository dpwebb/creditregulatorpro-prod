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
import { Scale, HeartHandshake, AlertTriangle, FileText } from "lucide-react";
import styles from "./KBHumanRights.module.css";

export const KBHumanRights = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Canadian Human Rights Act"
        icon={Scale}
        badge="FEDERAL LAW"
        badgeVariant="primary"
      >
        <p>
          The <em>Canadian Human Rights Act</em> protects individuals from discrimination when they are employed by or receive services from the federal government, First Nations governments, or private companies regulated by the federal government (including banks and telecommunications companies).
        </p>
        <p>
          In the context of credit reporting, discrimination can occur if credit decisions or reporting practices are biased based on protected grounds.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Protected Grounds"
        icon={HeartHandshake}
      >
        <p>
          Discrimination is prohibited on the following 14 grounds. If you believe a credit decision was influenced by any of these factors, you may have grounds for a claim.
        </p>
        
        <div className={styles.grid}>
          <div className={styles.groundItem}>Race</div>
          <div className={styles.groundItem}>National or ethnic origin</div>
          <div className={styles.groundItem}>Colour</div>
          <div className={styles.groundItem}>Religion</div>
          <div className={styles.groundItem}>Age</div>
          <div className={styles.groundItem}>Sex</div>
          <div className={styles.groundItem}>Sexual orientation</div>
          <div className={styles.groundItem}>Gender identity or expression</div>
          <div className={styles.groundItem}>Marital status</div>
          <div className={styles.groundItem}>Family status</div>
          <div className={styles.groundItem}>Genetic characteristics</div>
          <div className={styles.groundItem}>Disability</div>
          <div className={styles.groundItem}>Conviction for which pardon granted</div>
          <div className={styles.groundItem}>Other</div>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Filing a Claim"
        icon={AlertTriangle}
      >
        <Accordion type="single" collapsible>
          <AccordionItem value="when">
            <AccordionTrigger>When to File</AccordionTrigger>
            <AccordionContent>
              <p>
                You should consider documenting a discrimination claim if:
              </p>
              <ul className={styles.list}>
                <li>You were denied credit despite meeting all financial criteria, and you suspect bias.</li>
                <li>You were offered different terms (higher interest rates) than others in similar financial situations.</li>
                <li>Collection practices were abusive or targeted based on your identity.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how">
            <AccordionTrigger>How to Document</AccordionTrigger>
            <AccordionContent>
              <p>
                Use the <strong>Discrimination Claims</strong> feature in Credit Regulator Pro to create a secure record.
              </p>
              <ol className={styles.list}>
                <li>Navigate to the relevant <strong>Tradeline</strong>.</li>
                <li>Select "Log Discrimination Claim".</li>
                <li>Choose the relevant protected grounds.</li>
                <li>Provide a detailed description of the incident.</li>
                <li>Attach any supporting evidence (emails, recordings, letters).</li>
              </ol>
              <p>
                <strong>Note:</strong> This internal record serves as a contemporaneous note, which can be vital evidence if you later file a formal complaint with the Canadian Human Rights Commission.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Status Tracking"
        icon={FileText}
      >
        <p>
          Claims in Credit Regulator Pro move through the following statuses:
        </p>
        <div className={styles.statusList}>
          <div className={styles.statusItem}>
            <Badge variant="info">REPORTED</Badge>
            <span>Initial documentation created.</span>
          </div>
          <div className={styles.statusItem}>
            <Badge variant="warning">UNDER_REVIEW</Badge>
            <span>Internal review or gathering more evidence.</span>
          </div>
          <div className={styles.statusItem}>
            <Badge variant="error">ESCALATED</Badge>
            <span>Formal complaint filed with Commission.</span>
          </div>
          <div className={styles.statusItem}>
            <Badge variant="success">RESOLVED</Badge>
            <span>Issue settled or closed.</span>
          </div>
        </div>
      </KnowledgeBaseSection>
    </div>
  );
};