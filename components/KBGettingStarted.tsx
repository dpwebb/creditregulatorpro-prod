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
import { Rocket, ShieldCheck, LayoutDashboard, CheckSquare, Ban } from "lucide-react";
import styles from "./KBGettingStarted.module.css";

export const KBGettingStarted = () => {
  return (
    <div className={styles.container}>
      <KnowledgeBaseSection
        title="Welcome to Credit Regulator Pro: Your Credit Repair Assistant"
        icon={Rocket}
        badge="GUIDE"
        badgeVariant="primary"
      >
        <p>
          Welcome to Credit Regulator Pro. This tool helps you review Canadian credit reports, identify possible compliance findings, and prepare evidence-based challenge letters without admitting debt validity.
        </p>
        <p>
          The system is built for Canadian Equifax and TransUnion report workflows. It checks authority-backed finding categories and supporting runtime rules, then uses your province to draft letters for review.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Built-in Checks"
        icon={Ban}
        badge="AUTO-DETECTION"
        badgeVariant="warning"
      >
        <p>
          Credit Regulator Pro automatically checks every account for possible compliance findings:
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="scanner-modules">
            <AccordionTrigger>What We Look For</AccordionTrigger>
            <AccordionContent>
              <ul className={styles.moduleList}>
                <li><strong>Time Errors:</strong> Finds wrong dates and accounts that are too old.</li>
                <li><strong>Mismatch Errors:</strong> Finds accounts that look different on different reports.</li>
                <li><strong>Math Errors:</strong> Finds wrong balances and payment histories.</li>
                <li><strong>Rule Errors:</strong> Finds missing documents and missed deadlines.</li>
                <li><strong>Status Errors:</strong> Finds wrong account statuses, identity theft signs, and bankruptcy errors.</li>
                <li><strong>Format Errors:</strong> Checks if they filled out required fields.</li>
              </ul>
              <p className={styles.scannerNote}>
                For the full list of scanner coverage, see the Rule Checks tab. Findings are saved in your account with confidence, plain-language context, and recommended next steps for review.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Important Canadian Rules"
        icon={ShieldCheck}
        badge="CRITICAL"
        badgeVariant="error"
      >
        <p>
          Our system follows strict rules to keep your data safe and compliant. Please read these important rules.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="region">
            <AccordionTrigger>Region Lock: Canada Only</AccordionTrigger>
            <AccordionContent>
              <p>
                <strong>Policy:</strong> The platform is configured for Canadian credit-report workflows and Canadian data-residency controls. Do not upload non-Canadian reports.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="retention">
            <AccordionTrigger>Data Retention: 1 Year</AccordionTrigger>
            <AccordionContent>
              <p>
                <strong>Policy:</strong> Files and generated records are scheduled for retention for up to 1 year, then purge workflows remove expired data. Download anything you need before it expires.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="terminal">
            <AccordionTrigger>Following the Steps</AccordionTrigger>
            <AccordionContent>
              <p>
                <strong>Policy:</strong> Disputes must follow our 4-step plan. Phase 4 is the last step.
              </p>
              <p>
                You cannot skip steps or jump to the end. Phases show as <code>— PENDING</code> until they are done.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Dashboard Tour"
        icon={LayoutDashboard}
      >
        <p>
          Your dashboard gives you a quick look at your progress.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Compliance Findings:</strong> A live count of possible issues detected.
          </li>
          <li>
            <strong>Active Challenges:</strong> Letters you sent that are waiting for answers.
          </li>
          <li>
            <strong>Ready for Next Steps:</strong> Accounts that finished all 4 steps.
          </li>
          <li>
            <strong>Success Stats:</strong> How well your challenges are working.
          </li>
        </ul>
        <div className={styles.actionRow}>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Go to Dashboard</Link>
          </Button>
        </div>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Quick Start: Check Your First Report"
        icon={CheckSquare}
        badge="ACTION REQUIRED"
        badgeVariant="warning"
      >
        <p>Follow these steps to start reviewing possible credit-report issues:</p>
        <div className={styles.checklist}>
          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <h3>Complete Your Profile</h3>
              <p>Ensure your full legal name and current Canadian address are entered correctly. This information appears on all formal letters.</p>
              <Button asChild variant="link" size="sm">
                <Link to="/my-info?tab=profile">Update Profile &rarr;</Link>
              </Button>
            </div>
          </div>
          
          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <h3>Upload Your Credit Report</h3>
              <p>Upload your Canadian Equifax or TransUnion PDF report so the system can extract accounts and run the compliance scanner.</p>
              <Button asChild variant="link" size="sm">
                <Link to="/upload">Upload Report &rarr;</Link>
              </Button>
            </div>
          </div>

          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepContent}>
              <h3>See What We Found</h3>
              <p>Review the possible findings for each account. We explain the supporting facts and suggest next steps for your review.</p>
              <Button asChild variant="link" size="sm">
                <Link to="/my-accounts">View Your Accounts &rarr;</Link>
              </Button>
            </div>
          </div>

          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepContent}>
              <h3>Create Your Dispute Letters</h3>
              <p>Create draft dispute letters using the suggested finding, evidence, and province-based references. Review every letter before sending it.</p>
            </div>
          </div>
        </div>
      </KnowledgeBaseSection>
    </div>
  );
};
