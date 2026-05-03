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
import { ShieldAlert, Lock, Unlock, FileWarning, Activity } from "lucide-react";
import styles from "./KBIdentityTheft.module.css";

export const KBIdentityTheft = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Identity Theft Protection Overview"
        icon={ShieldAlert}
        badge="SECURITY"
        badgeVariant="error"
      >
        <p>
          Identity theft incidents require immediate and aggressive action. Credit Regulator Pro 
          provides specialized tools for managing fraud alerts, security freezes, 
          and tracking remediation efforts with the Canadian credit bureaus.
        </p>
        <div className={styles.processBox}>
          <h3>Standard Mitigation Flow</h3>
          <ol className={styles.list}>
            <li><strong>Detect:</strong> Identify suspicious activity or unauthorized accounts.</li>
            <li><strong>Freeze:</strong> Immediately file security freezes with Equifax and TransUnion.</li>
            <li><strong>Document:</strong> Upload police reports and identity theft affidavits.</li>
            <li><strong>Monitor:</strong> Track freeze coverage and active alert status.</li>
            <li><strong>Thaw:</strong> Request temporary thaws only when necessary for legitimate credit applications.</li>
          </ol>
          <Button asChild className={styles.actionButton}>
            <Link to="/identity-theft-protection">Access Protection Center</Link>
          </Button>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Fraud Freeze Management"
        icon={Lock}
        badge="CRITICAL"
        badgeVariant="primary"
      >
        <p>
          Placing a security freeze restricts access to your credit report, making it 
          virtually impossible for identity thieves to open new accounts in your name.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="freeze-types">
            <AccordionTrigger>Types of Protections</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.list}>
                <li><strong>Fraud Alert:</strong> Requires creditors to verify your identity before extending credit. Lasts 1 year by default.</li>
                <li><strong>Extended Fraud Alert:</strong> A 7-year alert available after providing an identity theft report.</li>
                <li><strong>Security Freeze:</strong> Completely blocks access to your credit file until thawed.</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="tracking">
            <AccordionTrigger>Tracking & Coverage</AccordionTrigger>
            <AccordionContent>
              <p>
                Credit Regulator Pro tracks the status of your freezes across Equifax and TransUnion 
                simultaneously. The system alerts you if your file lacks protection at 
                either major bureau.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Thaw Requests"
        icon={Unlock}
      >
        <p>
          When you need to apply for legitimate credit (e.g., a mortgage or car loan), 
          you must temporarily lift the security freeze.
        </p>
        <ul className={styles.list}>
          <li><strong>Temporary Thaw:</strong> Lifts the freeze for a specific time window.</li>
          <li><strong>Permanent Removal:</strong> Completely removes the freeze. Not recommended unless you are certain the threat has passed.</li>
        </ul>
        <p className={styles.note}>
          Always request a thaw a few days prior to applying for credit, as bureaus 
          may take 24-48 hours to process the request.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Document Management"
        icon={FileWarning}
        badge="EVIDENCE"
        badgeVariant="info"
      >
        <p>
          Successfully disputing fraudulent accounts requires a robust paper trail.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="police-reports">
            <AccordionTrigger>Police Reports & Affidavits</AccordionTrigger>
            <AccordionContent>
              <p>
                Upload digital copies of your police reports, RCMP incident numbers, 
                and sworn affidavits directly to the Identity Theft center. These documents 
                are crucial for generating specific PIPEDA and provincial Consumer Reporting Act identity theft dispute packets 
                that force bureaus to block fraudulent information within 4 business days.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Monitoring & Alerts"
        icon={Activity}
      >
        <p>
          The system actively monitors your protection status and provides clear visual indicators:
        </p>
        <ul className={styles.list}>
          <li><strong>No-Protection Warnings:</strong> Alerts you if no active fraud alert or freeze is detected.</li>
          <li><strong>Expiration Tracking:</strong> Notifies you when a 1-year fraud alert is about to expire.</li>
          <li><strong>Timeline View:</strong> Maintains a cryptographic log of when freezes were requested, applied, and thawed.</li>
        </ul>
      </KnowledgeBaseSection>
    </div>
  );
};