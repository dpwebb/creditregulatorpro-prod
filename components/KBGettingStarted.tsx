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
          Welcome to Credit Regulator Pro. This tool is built to help you deal with Canadian credit bureaus, creditors, and debt collectors. It finds rules they broke and challenges them legally, without ever saying the debt is yours.
        </p>
        <p>
          Our system is built only for Canada. It knows the rules for all 13 provinces and territories. It uses 35 built-in checks to find errors and makes dispute letters using your local laws.
        </p>
      </KnowledgeBaseSection>

      <KnowledgeBaseSection
        title="Built-in Checks"
        icon={Ban}
        badge="AUTO-DETECTION"
        badgeVariant="warning"
      >
        <p>
          Credit Regulator Pro automatically checks every account to find rules they broke:
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
                For the full list of all checks, see the Rule Checks tab. All errors we find are saved in your account. We show you how sure we are, explain the error simply, and tell you what to do next.
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
          Our system follows strict rules to keep your data safe and legal. Please read these important rules.
        </p>

        <Accordion type="single" collapsible className={styles.accordion}>
          <AccordionItem value="region">
            <AccordionTrigger>Region Lock: Canada Only</AccordionTrigger>
            <AccordionContent>
              <p>
                <strong>Policy:</strong> All your data stays in Canada. We do not send data to other countries. This keeps you safe.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="retention">
            <AccordionTrigger>Data Retention: 1 Year</AccordionTrigger>
            <AccordionContent>
              <p>
                <strong>Policy:</strong> We keep your files and data for exactly 1 year. After 1 year, we delete it to protect your privacy. Make sure you download what you need.
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
            <strong>Rules Broken:</strong> A live count of errors we found.
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
        <p>Follow these steps to start finding errors:</p>
        <div className={styles.checklist}>
          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepContent}>
              <h3>Complete Your Profile</h3>
              <p>Ensure your full legal name and current Canadian address are entered correctly. This information appears on all legal letters.</p>
              <Button asChild variant="link" size="sm">
                <Link to="/my-info?tab=profile">Update Profile &rarr;</Link>
              </Button>
            </div>
          </div>
          
          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepContent}>
              <h3>Upload Your Credit Report</h3>
              <p>Upload your credit report to let the system find your accounts and run the 35 built-in checks.</p>
              <Button asChild variant="link" size="sm">
                <Link to="/upload">Upload Report &rarr;</Link>
              </Button>
            </div>
          </div>

          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepContent}>
              <h3>See What We Found</h3>
              <p>Look at the errors we found for each account. We explain the problem and tell you the best way to challenge it.</p>
              <Button asChild variant="link" size="sm">
                <Link to="/my-accounts">View Your Accounts &rarr;</Link>
              </Button>
            </div>
          </div>

          <div className={styles.checkItem}>
            <div className={styles.stepNumber}>4</div>
            <div className={styles.stepContent}>
              <h3>Create Your Dispute Letters</h3>
              <p>Make dispute letters using our suggestions. The system will pick the right laws for your province.</p>
            </div>
          </div>
        </div>
      </KnowledgeBaseSection>
    </div>
  );
};