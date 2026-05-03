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
import { Landmark, Search, Scale, Link as LinkIcon } from "lucide-react";
import styles from "./KBBankruptcy.module.css";

export const KBBankruptcy = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Bankruptcy & Insolvency Tracker"
        icon={Landmark}
        badge="COMPLIANCE ENGINE"
        badgeVariant="primary"
      >
        <p>
          Managing credit reporting after a bankruptcy or consumer proposal is notoriously 
          difficult. The Bankruptcy Tracker centralizes your insolvency records and automatically 
          enforces post-discharge reporting rules against creditors.
        </p>
        <div className={styles.processBox}>
          <h3>Bankruptcy Management Flow</h3>
          <ol className={styles.list}>
            <li><strong>Create Record:</strong> Log your bankruptcy or proposal (dates, case number, etc.).</li>
            <li><strong>Link Tradelines:</strong> Associate specific debts included in the bankruptcy.</li>
            <li><strong>Auto-Detect Violations:</strong> The system scans for creditors illegally reporting balances.</li>
            <li><strong>Dispute:</strong> Generate targeted packets to force compliance and remove violations.</li>
          </ol>
          <Button asChild className={styles.actionButton}>
            <Link to="/bankruptcy-tracker">Open Bankruptcy Tracker</Link>
          </Button>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Record Creation & Status Tracking"
        icon={Search}
      >
        <p>
          To enable automated compliance checking, you must first create a detailed insolvency record.
        </p>
        <ul className={styles.list}>
          <li><strong>Details Required:</strong> Filing date, discharge date, jurisdiction (province), case number, and trustee details.</li>
          <li><strong>Insolvency Types:</strong> Supports Personal Bankruptcy, Division I Proposals, and Consumer Proposals.</li>
          <li><strong>Status Tracking:</strong> Track progression from Active/Filed to Discharged or Dismissed.</li>
        </ul>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Tradeline Linking & The Zero Balance Rule"
        icon={LinkIcon}
        badge="CRITICAL"
        badgeVariant="warning"
      >
        <p>
          Once an insolvency record is created, you must link the specific tradelines 
          (debts) that were included in the filing.
        </p>
        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="zero-balance">
            <AccordionTrigger>The Zero Balance Rule</AccordionTrigger>
            <AccordionContent>
              <p>
                Under Canadian law, once a debt is discharged in bankruptcy or a proposal is 
                completed, the creditor <strong>must</strong> update the tradeline to reflect a $0 balance 
                and indicate that the account was "included in bankruptcy" or "settled."
              </p>
              <p>
                Any creditor reporting a balance owed, past due amount, or continuing to 
                report late payments post-discharge is in violation of the law.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Discharge Violation Detection"
        icon={Scale}
        badge="AUTO-SCANNER"
        badgeVariant="error"
      >
        <p>
          Credit Regulator Pro features a specialized rules engine for detecting post-bankruptcy reporting violations.
        </p>
        <ul className={styles.list}>
          <li><strong>Automated Scanning:</strong> When a new credit report is uploaded, the system cross-references linked tradelines against your discharge date.</li>
          <li><strong>Violation Generation:</strong> If a linked account still shows a balance or reports charge-offs after the discharge date, a "Bankruptcy Discharge Violation" is automatically generated in the compliance test logs.</li>
          <li><strong>Targeted Disputes:</strong> Generate highly aggressive dispute packets tailored to the specific provincial and federal violations occurring post-discharge.</li>
        </ul>
      </KnowledgeBaseSection>
    </div>
  );
};